import type {
  AppSettings,
  BackupManifest,
  BookRecord,
  CategoryRecord,
  FilterOption,
  LibraryStats,
  ReadingProgressRecord,
  ReadingStatus,
  SortOption,
} from '../types/library';

export const BACKUP_MANIFEST_VERSION = 1;

export const DEFAULT_CATEGORY_NAMES: readonly string[] = [
  'Fiction',
  'Non-Fiction',
  'Business',
  'Technology',
  'Science',
  'Education',
  'History',
  'Biography',
  'Personal Development',
  'Others',
] as const;

export function createDefaultCategories(now = Date.now()): CategoryRecord[] {
  return DEFAULT_CATEGORY_NAMES.map((name, idx) => ({
    id: `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    createdAt: now + idx,
    isDefault: true,
  }));
}

export function createDefaultSettings(): AppSettings {
  return {
    id: 'default',
    theme: 'light',
    readingMode: 'auto',
    defaultZoom: 1,
    libraryPreferences: {
      defaultViewMode: 'grid',
      defaultSort: 'recently_added',
      showCoverPage: true,
      hasSeededStarterLibrary: false,
    },
    security: {
      lockEnabled: false,
      pinHash: null,
      pinSalt: null,
      autoLockMinutes: 5,
    },
  };
}

export function computeProgressPercentage(lastPage: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  const clampedPage = Math.max(1, Math.min(lastPage, totalPages));
  if (totalPages === 1) {
    return clampedPage >= 1 ? 100 : 0;
  }
  return Math.round((clampedPage / totalPages) * 100);
}

export function computeReadingStatus(lastPage: number, totalPages: number): ReadingStatus {
  if (totalPages <= 0 || lastPage <= 0) return 'not_started';
  if (lastPage >= totalPages) return 'completed';
  if (lastPage === 1 && totalPages > 1) return 'reading';
  return 'reading';
}

export function computeLibraryStats(
  books: BookRecord[],
  progressList: ReadingProgressRecord[]
): LibraryStats {
  const progressByBook = new Map<string, ReadingProgressRecord>();
  for (const p of progressList) {
    progressByBook.set(p.bookId, p);
  }

  let currentlyReading = 0;
  let completedBooks = 0;
  let totalPagesRead = 0;

  for (const book of books) {
    const progress = progressByBook.get(book.id);
    if (book.readingStatus === 'reading') {
      currentlyReading += 1;
    } else if (book.readingStatus === 'completed') {
      completedBooks += 1;
    }

    if (progress && progress.lastPage > 0) {
      totalPagesRead += Math.min(progress.lastPage, Math.max(book.totalPages, progress.lastPage));
    }
  }

  return {
    totalBooks: books.length,
    currentlyReading,
    completedBooks,
    totalPagesRead,
  };
}

export interface BookFilterQuery {
  search: string;
  filter: FilterOption;
  categoryId: string; // 'all' or specific category id
  sort: SortOption;
}

export function filterAndSortBooks(
  books: BookRecord[],
  progressByBook: Map<string, ReadingProgressRecord>,
  query: BookFilterQuery
): BookRecord[] {
  const searchLower = query.search.trim().toLowerCase();

  const filtered = books.filter((book) => {
    if (searchLower) {
      const titleMatch = book.title.toLowerCase().includes(searchLower);
      const authorMatch = book.author.toLowerCase().includes(searchLower);
      if (!titleMatch && !authorMatch) return false;
    }

    if (query.categoryId !== 'all' && book.categoryId !== query.categoryId) {
      return false;
    }

    switch (query.filter) {
      case 'reading':
        return book.readingStatus === 'reading';
      case 'completed':
        return book.readingStatus === 'completed';
      case 'not_started':
        return book.readingStatus === 'not_started';
      case 'favorites':
        return book.isFavorite;
      case 'all':
      default:
        return true;
    }
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    switch (query.sort) {
      case 'alphabetical':
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      case 'recently_read': {
        const aTime = progressByBook.get(a.id)?.lastReadAt ?? a.lastOpened ?? 0;
        const bTime = progressByBook.get(b.id)?.lastReadAt ?? b.lastOpened ?? 0;
        if (bTime !== aTime) return bTime - aTime;
        return b.dateAdded - a.dateAdded;
      }
      case 'progress': {
        const aProg = progressByBook.get(a.id)?.progressPercentage ?? 0;
        const bProg = progressByBook.get(b.id)?.progressPercentage ?? 0;
        if (bProg !== aProg) return bProg - aProg;
        return b.dateAdded - a.dateAdded;
      }
      case 'recently_added':
      default:
        return b.dateAdded - a.dateAdded;
    }
  });

  return sorted;
}

export function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function findDuplicateBook(
  existingBooks: BookRecord[],
  candidate: { title: string; fileName: string; fileSize: number; totalPages?: number }
): BookRecord | undefined {
  const candFile = candidate.fileName.trim().toLowerCase();
  const candTitle = normalizeTitle(candidate.title);

  return existingBooks.find((book) => {
    const sameFileAndSize =
      book.fileName.trim().toLowerCase() === candFile &&
      book.fileSize === candidate.fileSize &&
      candidate.fileSize > 0;
    if (sameFileAndSize) return true;

    const sameTitleAndPages =
      candTitle.length > 0 &&
      normalizeTitle(book.title) === candTitle &&
      typeof candidate.totalPages === 'number' &&
      candidate.totalPages > 0 &&
      book.totalPages === candidate.totalPages;
    return sameTitleAndPages;
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val < 10 && idx > 0 ? val.toFixed(1) : Math.round(val)} ${units[idx]}`;
}

export function formatRelativeDate(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp) return 'Never';
  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function validateBackupManifest(raw: unknown): { valid: true; manifest: BackupManifest } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Manifest is not a valid JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.app !== 'MyLibrary') {
    return { valid: false, error: 'Archive is not a My Library backup.' };
  }
  if (typeof obj.manifestVersion !== 'number' || obj.manifestVersion > BACKUP_MANIFEST_VERSION || obj.manifestVersion < 1) {
    return { valid: false, error: `Unsupported backup manifest version (${String(obj.manifestVersion)}).` };
  }
  if (!Array.isArray(obj.books)) {
    return { valid: false, error: 'Backup manifest is missing book records.' };
  }
  if (!Array.isArray(obj.categories)) {
    return { valid: false, error: 'Backup manifest is missing category records.' };
  }
  if (!Array.isArray(obj.readingProgress) || !Array.isArray(obj.bookmarks)) {
    return { valid: false, error: 'Backup manifest is missing reading progress or bookmarks.' };
  }
  return { valid: true, manifest: obj as unknown as BackupManifest };
}
