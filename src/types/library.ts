export type NavigationSection =
  | 'dashboard'
  | 'my-books'
  | 'continue-reading'
  | 'favorites'
  | 'categories'
  | 'settings';

export type ReadingStatus = 'not_started' | 'reading' | 'completed';
export type ThemeMode = 'light' | 'dark';
export type ReadingMode = 'auto' | 'single' | 'double';
export type ViewMode = 'grid' | 'list';
export type FilterOption = 'all' | 'reading' | 'completed' | 'not_started' | 'favorites';
export type SortOption = 'recently_added' | 'recently_read' | 'alphabetical' | 'progress';

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  description: string;
  categoryId: string;
  cover: string; // data URL or generated cover image
  totalPages: number;
  dateAdded: number;
  lastOpened: number | null;
  isFavorite: boolean;
  readingStatus: ReadingStatus;
  fileName: string;
  fileSize: number;
}

export interface PdfFileRecord {
  bookId: string;
  fileBlob: Blob;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface ReadingProgressRecord {
  bookId: string;
  lastPage: number; // 1-indexed
  progressPercentage: number; // 0..100
  lastReadAt: number;
}

export interface BookmarkRecord {
  id: string;
  bookId: string;
  pageNumber: number; // 1-indexed
  note: string;
  createdAt: number;
}

export interface CategoryRecord {
  id: string;
  name: string;
  createdAt: number;
  isDefault?: boolean;
}

export interface SecuritySettings {
  lockEnabled: boolean;
  pinHash: string | null;
  pinSalt: string | null;
  autoLockMinutes: number; // 0 = never auto-lock
}

export interface LibraryPreferences {
  defaultViewMode: ViewMode;
  defaultSort: SortOption;
  showCoverPage: boolean;
  hasSeededStarterLibrary: boolean;
}

export interface AppSettings {
  id: string;
  theme: ThemeMode;
  readingMode: ReadingMode;
  defaultZoom: number;
  libraryPreferences: LibraryPreferences;
  security: SecuritySettings;
}

export interface LibraryStats {
  totalBooks: number;
  currentlyReading: number;
  completedBooks: number;
  totalPagesRead: number;
}

export interface BackupBookEntry extends BookRecord {
  pdfPath: string;
  mimeType: string;
}

export interface BackupManifest {
  app: 'MyLibrary';
  manifestVersion: number;
  exportedAt: number;
  bookCount: number;
  books: BackupBookEntry[];
  readingProgress: ReadingProgressRecord[];
  bookmarks: BookmarkRecord[];
  categories: CategoryRecord[];
  settings: Omit<AppSettings, 'security'> & {
    security?: { autoLockMinutes: number };
  };
}

export interface BookWithProgress {
  book: BookRecord;
  progress: ReadingProgressRecord | undefined;
}
