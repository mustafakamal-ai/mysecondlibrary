import {
  db,
  ensureBaseDbSetup,
  saveBookWithPdf,
  saveReadingProgress,
  updateSettings,
} from '../db/libraryDb';
import { inspectPdfBlob } from './pdfService';
import { buildPdfBytes, STARTER_BOOKS } from '../utils/samplePdf';
import type { BookRecord } from '../types/library';

export async function initializeLibraryWithStarterBooks(): Promise<void> {
  const settings = await ensureBaseDbSetup();
  if (settings.libraryPreferences.hasSeededStarterLibrary) {
    return;
  }

  const existingCount = await db.books.count();
  if (existingCount > 0) {
    await updateSettings((prev) => ({
      ...prev,
      libraryPreferences: {
        ...prev.libraryPreferences,
        hasSeededStarterLibrary: true,
      },
    }));
    return;
  }

  const now = Date.now();
  for (let i = 0; i < STARTER_BOOKS.length; i++) {
    const spec = STARTER_BOOKS[i];
    const pdfBytes = buildPdfBytes(spec);
    const bufferCopy = new Uint8Array(pdfBytes).buffer;
    const blob = new Blob([bufferCopy], { type: 'application/pdf' });
    const fileName = `${spec.id}.pdf`;

    let coverDataUrl = '';
    let totalPages = spec.pages.length;
    try {
      const inspected = await inspectPdfBlob(blob, fileName);
      coverDataUrl = inspected.coverDataUrl;
      totalPages = inspected.totalPages;
    } catch {
      totalPages = spec.pages.length;
    }

    const book: BookRecord = {
      id: spec.id,
      title: spec.title,
      author: spec.author,
      description: spec.description,
      categoryId: spec.categoryId,
      cover: coverDataUrl,
      totalPages,
      dateAdded: now - (STARTER_BOOKS.length - i) * 3600_000,
      lastOpened: i === 0 ? now - 1800_000 : null,
      isFavorite: i === 0,
      readingStatus: i === 0 ? 'reading' : 'not_started',
      fileName,
      fileSize: blob.size,
    };

    await saveBookWithPdf(book, {
      bookId: book.id,
      fileBlob: blob,
      fileName,
      fileSize: blob.size,
      mimeType: 'application/pdf',
    });

    if (i === 0) {
      await saveReadingProgress(book.id, 2, totalPages);
    }
  }

  await updateSettings((prev) => ({
    ...prev,
    libraryPreferences: {
      ...prev.libraryPreferences,
      hasSeededStarterLibrary: true,
    },
  }));
}
