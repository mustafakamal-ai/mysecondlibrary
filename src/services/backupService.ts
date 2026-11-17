import JSZip from 'jszip';
import { db } from '../db/libraryDb';
import type {
  BackupBookEntry,
  BackupManifest,
  BookRecord,
} from '../types/library';
import {
  BACKUP_MANIFEST_VERSION,
  createDefaultSettings,
  findDuplicateBook,
  validateBackupManifest,
} from '../utils/libraryLogic';
import {
  decryptBytesWithPassphrase,
  encryptBytesWithPassphrase,
  isEncryptedBackupEnvelope,
} from '../utils/crypto';

export interface ExportBackupOptions {
  encryptionPassphrase?: string;
  onProgress?: (percent: number, stage: string) => void;
}

export async function exportLibraryBackup(options: ExportBackupOptions = {}): Promise<{
  blob: Blob;
  filename: string;
  encrypted: boolean;
}> {
  const { encryptionPassphrase, onProgress } = options;
  onProgress?.(5, 'Reading local library records...');

  const [books, pdfFiles, readingProgress, bookmarks, categories, settingsRow] = await Promise.all([
    db.books.toArray(),
    db.pdfFiles.toArray(),
    db.readingProgress.toArray(),
    db.bookmarks.toArray(),
    db.categories.toArray(),
    db.settings.get('default'),
  ]);

  const pdfById = new Map(pdfFiles.map((f) => [f.bookId, f]));
  const zip = new JSZip();

  const bookEntries: BackupBookEntry[] = [];
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const pdf = pdfById.get(book.id);
    const pdfPath = `pdfs/${book.id}.pdf`;
    if (pdf) {
      zip.file(pdfPath, pdf.fileBlob);
    }
    bookEntries.push({
      ...book,
      pdfPath,
      mimeType: pdf?.mimeType || 'application/pdf',
    });
    const pct = 10 + Math.round(((i + 1) / Math.max(1, books.length)) * 45);
    onProgress?.(pct, `Packaging "${book.title}"...`);
  }

  const safeSettings = settingsRow ?? createDefaultSettings();
  const manifest: BackupManifest = {
    app: 'MyLibrary',
    manifestVersion: BACKUP_MANIFEST_VERSION,
    exportedAt: Date.now(),
    bookCount: bookEntries.length,
    books: bookEntries,
    readingProgress,
    bookmarks,
    categories,
    settings: {
      id: safeSettings.id,
      theme: safeSettings.theme,
      readingMode: safeSettings.readingMode,
      defaultZoom: safeSettings.defaultZoom,
      libraryPreferences: safeSettings.libraryPreferences,
      security: {
        autoLockMinutes: safeSettings.security.autoLockMinutes,
      },
    },
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  onProgress?.(60, 'Compressing archive...');
  const zipBytes = await zip.generateAsync(
    { type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => {
      const pct = 60 + Math.round(meta.percent * 0.3);
      onProgress?.(pct, 'Compressing archive...');
    }
  );

  const dateTag = new Date().toISOString().slice(0, 10);
  if (encryptionPassphrase && encryptionPassphrase.trim().length > 0) {
    onProgress?.(92, 'Encrypting backup with AES-256-GCM...');
    const encryptedBytes = await encryptBytesWithPassphrase(zipBytes, encryptionPassphrase.trim());
    onProgress?.(100, 'Backup ready.');
    const bufferCopy = new Uint8Array(encryptedBytes).buffer;
    return {
      blob: new Blob([bufferCopy], { type: 'application/octet-stream' }),
      filename: `my-library-backup-${dateTag}.mylibrary.enc`,
      encrypted: true,
    };
  }

  onProgress?.(100, 'Backup ready.');
  const zipBufferCopy = new Uint8Array(zipBytes).buffer;
  return {
    blob: new Blob([zipBufferCopy], { type: 'application/zip' }),
    filename: `my-library-backup-${dateTag}.zip`,
    encrypted: false,
  };
}

export interface ParsedBackupArchive {
  manifest: BackupManifest;
  zip: JSZip;
  duplicateBookIds: string[];
  newBookCount: number;
  encrypted: boolean;
}

export async function inspectBackupArchive(
  file: File,
  passphrase?: string
): Promise<{ status: 'needs_passphrase' } | { status: 'ready'; parsed: ParsedBackupArchive }> {
  const rawBytes = new Uint8Array(await file.arrayBuffer());
  const encrypted = isEncryptedBackupEnvelope(rawBytes);

  let zipBytes: Uint8Array = rawBytes;
  if (encrypted) {
    if (!passphrase) {
      return { status: 'needs_passphrase' };
    }
    zipBytes = await decryptBytesWithPassphrase(rawBytes, passphrase);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch {
    throw new Error('The selected file is not a valid ZIP backup archive.');
  }

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup: manifest.json is missing from the archive.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await manifestFile.async('string'));
  } catch {
    throw new Error('Invalid backup: manifest.json could not be parsed.');
  }

  const validation = validateBackupManifest(parsedJson);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const existingBooks = await db.books.toArray();
  const existingIds = new Set(existingBooks.map((b) => b.id));
  const duplicateBookIds: string[] = [];

  for (const entry of validation.manifest.books) {
    if (
      existingIds.has(entry.id) ||
      findDuplicateBook(existingBooks, {
        title: entry.title,
        fileName: entry.fileName,
        fileSize: entry.fileSize,
        totalPages: entry.totalPages,
      })
    ) {
      duplicateBookIds.push(entry.id);
    }
  }

  return {
    status: 'ready',
    parsed: {
      manifest: validation.manifest,
      zip,
      duplicateBookIds,
      newBookCount: validation.manifest.books.length - duplicateBookIds.length,
      encrypted,
    },
  };
}

export async function restoreParsedBackup(
  parsed: ParsedBackupArchive,
  options: { overwriteDuplicates: boolean; onProgress?: (percent: number, stage: string) => void }
): Promise<{ restoredBooks: number; skippedDuplicates: number }> {
  const { manifest, zip, duplicateBookIds } = parsed;
  const duplicateSet = new Set(duplicateBookIds);
  const { overwriteDuplicates, onProgress } = options;

  onProgress?.(10, 'Restoring categories & preferences...');
  if (manifest.categories.length > 0) {
    await db.categories.bulkPut(manifest.categories);
  }

  if (manifest.settings) {
    const currentSettings = (await db.settings.get('default')) ?? createDefaultSettings();
    await db.settings.put({
      ...currentSettings,
      theme: manifest.settings.theme ?? currentSettings.theme,
      readingMode: manifest.settings.readingMode ?? currentSettings.readingMode,
      defaultZoom: manifest.settings.defaultZoom ?? currentSettings.defaultZoom,
      libraryPreferences: {
        ...currentSettings.libraryPreferences,
        ...(manifest.settings.libraryPreferences ?? {}),
        hasSeededStarterLibrary: true,
      },
    });
  }

  let restoredBooks = 0;
  let skippedDuplicates = 0;
  const restoredBookIds = new Set<string>();

  for (let i = 0; i < manifest.books.length; i++) {
    const entry = manifest.books[i];
    const isDup = duplicateSet.has(entry.id);

    if (isDup && !overwriteDuplicates) {
      skippedDuplicates += 1;
      continue;
    }

    const pdfZipEntry = zip.file(entry.pdfPath);
    if (!pdfZipEntry) {
      continue;
    }

    const pdfArrayBuffer = await pdfZipEntry.async('arraybuffer');
    const pdfBlob = new Blob([pdfArrayBuffer], { type: entry.mimeType || 'application/pdf' });

    const bookRecord: BookRecord = {
      id: entry.id,
      title: entry.title,
      author: entry.author,
      description: entry.description,
      categoryId: entry.categoryId,
      cover: entry.cover,
      totalPages: entry.totalPages,
      dateAdded: entry.dateAdded,
      lastOpened: entry.lastOpened,
      isFavorite: entry.isFavorite,
      readingStatus: entry.readingStatus,
      fileName: entry.fileName,
      fileSize: entry.fileSize || pdfBlob.size,
    };

    await db.transaction('rw', db.books, db.pdfFiles, async () => {
      await db.books.put(bookRecord);
      await db.pdfFiles.put({
        bookId: entry.id,
        fileBlob: pdfBlob,
        fileName: entry.fileName,
        fileSize: pdfBlob.size,
        mimeType: entry.mimeType || 'application/pdf',
      });
    });

    restoredBookIds.add(entry.id);
    restoredBooks += 1;

    const pct = 20 + Math.round(((i + 1) / Math.max(1, manifest.books.length)) * 65);
    onProgress?.(pct, `Restoring "${entry.title}"...`);
  }

  onProgress?.(90, 'Restoring reading progress & bookmarks...');
  const progressToPut = manifest.readingProgress.filter((p) => restoredBookIds.has(p.bookId));
  if (progressToPut.length > 0) {
    await db.readingProgress.bulkPut(progressToPut);
  }

  const bookmarksToPut = manifest.bookmarks.filter((bm) => restoredBookIds.has(bm.bookId));
  if (bookmarksToPut.length > 0) {
    await db.bookmarks.bulkPut(bookmarksToPut);
  }

  onProgress?.(100, 'Library restore complete.');
  return { restoredBooks, skippedDuplicates };
}
