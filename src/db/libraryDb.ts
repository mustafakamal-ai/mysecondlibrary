import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  BookRecord,
  BookmarkRecord,
  CategoryRecord,
  PdfFileRecord,
  ReadingProgressRecord,
} from '../types/library';
import {
  computeProgressPercentage,
  computeReadingStatus,
  createDefaultCategories,
  createDefaultSettings,
} from '../utils/libraryLogic';

export class MyLibraryDatabase extends Dexie {
  books!: Table<BookRecord, string>;
  pdfFiles!: Table<PdfFileRecord, string>;
  readingProgress!: Table<ReadingProgressRecord, string>;
  bookmarks!: Table<BookmarkRecord, string>;
  categories!: Table<CategoryRecord, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('MyLibraryLocalDB');
    this.version(1).stores({
      books: 'id, title, author, categoryId, dateAdded, lastOpened, isFavorite, readingStatus',
      pdfFiles: 'bookId, fileName, fileSize',
      readingProgress: 'bookId, lastReadAt',
      bookmarks: 'id, bookId, pageNumber, createdAt',
      categories: 'id, name, createdAt',
      settings: 'id',
    });
  }
}

export const db = new MyLibraryDatabase();

export async function ensureBaseDbSetup(): Promise<AppSettings> {
  return db.transaction('rw', db.settings, db.categories, async () => {
    let settings = await db.settings.get('default');
    if (!settings) {
      settings = createDefaultSettings();
      await db.settings.put(settings);
    }

    const catCount = await db.categories.count();
    if (catCount === 0) {
      await db.categories.bulkPut(createDefaultCategories());
    }

    return settings;
  });
}

export async function updateSettings(updater: (prev: AppSettings) => AppSettings): Promise<AppSettings> {
  return db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('default')) ?? createDefaultSettings();
    const next = updater(current);
    await db.settings.put(next);
    return next;
  });
}

export async function saveBookWithPdf(book: BookRecord, pdfFile: PdfFileRecord): Promise<void> {
  try {
    await db.transaction('rw', db.books, db.pdfFiles, async () => {
      await db.books.put(book);
      await db.pdfFiles.put(pdfFile);
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      throw new Error(
        'Device storage quota is full. Free up space or remove unused books before importing.'
      );
    }
    throw err;
  }
}

export async function updateBookMetadata(
  bookId: string,
  changes: Partial<Pick<BookRecord, 'title' | 'author' | 'description' | 'categoryId' | 'cover' | 'isFavorite'>>
): Promise<void> {
  await db.books.update(bookId, changes);
}

export async function toggleBookFavorite(bookId: string): Promise<boolean> {
  return db.transaction('rw', db.books, async () => {
    const book = await db.books.get(bookId);
    if (!book) return false;
    const next = !book.isFavorite;
    await db.books.update(bookId, { isFavorite: next });
    return next;
  });
}

export async function deleteBookSafely(bookId: string): Promise<void> {
  await db.transaction('rw', db.books, db.pdfFiles, db.readingProgress, db.bookmarks, async () => {
    await db.books.delete(bookId);
    await db.pdfFiles.delete(bookId);
    await db.readingProgress.delete(bookId);
    await db.bookmarks.where('bookId').equals(bookId).delete();
  });
}

export async function saveReadingProgress(
  bookId: string,
  lastPage: number,
  totalPages: number
): Promise<ReadingProgressRecord> {
  const now = Date.now();
  const clampedPage = Math.max(1, Math.min(lastPage, Math.max(1, totalPages)));
  const progressPercentage = computeProgressPercentage(clampedPage, totalPages);
  const readingStatus = computeReadingStatus(clampedPage, totalPages);

  const record: ReadingProgressRecord = {
    bookId,
    lastPage: clampedPage,
    progressPercentage,
    lastReadAt: now,
  };

  await db.transaction('rw', db.readingProgress, db.books, async () => {
    await db.readingProgress.put(record);
    await db.books.update(bookId, {
      lastOpened: now,
      readingStatus,
    });
  });

  return record;
}

export async function addBookmark(bookId: string, pageNumber: number, note: string): Promise<BookmarkRecord> {
  const record: BookmarkRecord = {
    id: `bm-${crypto.randomUUID()}`,
    bookId,
    pageNumber,
    note: note.trim(),
    createdAt: Date.now(),
  };
  await db.bookmarks.put(record);
  return record;
}

export async function deleteBookmark(bookmarkId: string): Promise<void> {
  await db.bookmarks.delete(bookmarkId);
}

export async function createCategory(name: string): Promise<CategoryRecord> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Category name cannot be empty.');
  }
  const existing = await db.categories.toArray();
  if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Category "${trimmed}" already exists.`);
  }
  const category: CategoryRecord = {
    id: `cat-${crypto.randomUUID().slice(0, 8)}`,
    name: trimmed,
    createdAt: Date.now(),
    isDefault: false,
  };
  await db.categories.put(category);
  return category;
}

export async function renameCategory(categoryId: string, nextName: string): Promise<void> {
  const trimmed = nextName.trim();
  if (!trimmed) {
    throw new Error('Category name cannot be empty.');
  }
  const existing = await db.categories.toArray();
  if (existing.some((c) => c.id !== categoryId && c.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error(`Category "${trimmed}" already exists.`);
  }
  await db.categories.update(categoryId, { name: trimmed });
}

export async function deleteCategorySafely(categoryId: string): Promise<void> {
  await db.transaction('rw', db.categories, db.books, async () => {
    let fallbackId = 'cat-others';
    const others = await db.categories.get('cat-others');
    if (!others || others.id === categoryId) {
      const remaining = (await db.categories.toArray()).filter((c) => c.id !== categoryId);
      if (remaining.length > 0) {
        fallbackId = remaining[0].id;
      } else {
        const created: CategoryRecord = {
          id: 'cat-others',
          name: 'Others',
          createdAt: Date.now(),
          isDefault: true,
        };
        await db.categories.put(created);
        fallbackId = created.id;
      }
    }

    await db.books.where('categoryId').equals(categoryId).modify({ categoryId: fallbackId });
    await db.categories.delete(categoryId);
  });
}

export async function clearAllLibraryData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.books, db.pdfFiles, db.readingProgress, db.bookmarks, db.categories, db.settings],
    async () => {
      await db.books.clear();
      await db.pdfFiles.clear();
      await db.readingProgress.clear();
      await db.bookmarks.clear();
      await db.categories.clear();
      await db.categories.bulkPut(createDefaultCategories());
      const freshSettings = createDefaultSettings();
      freshSettings.libraryPreferences.hasSeededStarterLibrary = true;
      await db.settings.put(freshSettings);
    }
  );
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (already) return true;
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  persisted: boolean;
  supported: boolean;
}> {
  const supported = typeof navigator !== 'undefined' && !!navigator.storage?.estimate;
  if (!supported) {
    return { usage: 0, quota: 0, persisted: false, supported: false };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return {
      usage: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
      persisted,
      supported: true,
    };
  } catch {
    return { usage: 0, quota: 0, persisted: false, supported: false };
  }
}
