import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLibraryStats,
  computeProgressPercentage,
  computeReadingStatus,
  createDefaultCategories,
  filterAndSortBooks,
  findDuplicateBook,
  formatBytes,
  validateBackupManifest,
} from './libraryLogic';
import type { BookRecord, ReadingProgressRecord } from '../types/library';

function makeBook(overrides: Partial<BookRecord> = {}): BookRecord {
  return {
    id: 'b1',
    title: 'Meditations',
    author: 'Marcus Aurelius',
    description: 'Stoic reflections',
    categoryId: 'cat-non-fiction',
    cover: '',
    totalPages: 200,
    dateAdded: 1000,
    lastOpened: null,
    isFavorite: false,
    readingStatus: 'not_started',
    fileName: 'meditations.pdf',
    fileSize: 102400,
    ...overrides,
  };
}

test('computeProgressPercentage handles edge cases and clamps values', () => {
  assert.equal(computeProgressPercentage(125, 320), 39);
  assert.equal(computeProgressPercentage(320, 320), 100);
  assert.equal(computeProgressPercentage(1, 1), 100);
  assert.equal(computeProgressPercentage(5, 0), 0);
  assert.equal(computeProgressPercentage(999, 100), 100);
});

test('computeReadingStatus transitions accurately', () => {
  assert.equal(computeReadingStatus(0, 100), 'not_started');
  assert.equal(computeReadingStatus(1, 100), 'reading');
  assert.equal(computeReadingStatus(50, 100), 'reading');
  assert.equal(computeReadingStatus(100, 100), 'completed');
});

test('computeLibraryStats totals books, reading, completed, and pages read', () => {
  const books = [
    makeBook({ id: 'b1', totalPages: 320, readingStatus: 'reading' }),
    makeBook({ id: 'b2', totalPages: 120, readingStatus: 'completed' }),
    makeBook({ id: 'b3', totalPages: 80, readingStatus: 'not_started' }),
  ];
  const progress: ReadingProgressRecord[] = [
    { bookId: 'b1', lastPage: 125, progressPercentage: 39, lastReadAt: 5000 },
    { bookId: 'b2', lastPage: 120, progressPercentage: 100, lastReadAt: 4000 },
  ];
  const stats = computeLibraryStats(books, progress);
  assert.deepEqual(stats, {
    totalBooks: 3,
    currentlyReading: 1,
    completedBooks: 1,
    totalPagesRead: 245,
  });
});

test('filterAndSortBooks filters by search, category, status, and sorts accurately', () => {
  const books = [
    makeBook({ id: 'b1', title: 'Zebra', author: 'Alice', dateAdded: 100, isFavorite: true, readingStatus: 'reading' }),
    makeBook({ id: 'b2', title: 'Alpha', author: 'Bob', dateAdded: 300, isFavorite: false, readingStatus: 'completed', categoryId: 'cat-science' }),
    makeBook({ id: 'b3', title: 'Middle', author: 'Alice', dateAdded: 200, isFavorite: true, readingStatus: 'not_started' }),
  ];
  const progressMap = new Map<string, ReadingProgressRecord>([
    ['b1', { bookId: 'b1', lastPage: 40, progressPercentage: 20, lastReadAt: 900 }],
    ['b2', { bookId: 'b2', lastPage: 200, progressPercentage: 100, lastReadAt: 500 }],
  ]);

  const byAuthor = filterAndSortBooks(books, progressMap, {
    search: 'alice',
    filter: 'all',
    categoryId: 'all',
    sort: 'alphabetical',
  });
  assert.deepEqual(byAuthor.map((b) => b.id), ['b3', 'b1']);

  const byRecentRead = filterAndSortBooks(books, progressMap, {
    search: '',
    filter: 'all',
    categoryId: 'all',
    sort: 'recently_read',
  });
  assert.deepEqual(byRecentRead.map((b) => b.id), ['b1', 'b2', 'b3']);

  const favs = filterAndSortBooks(books, progressMap, {
    search: '',
    filter: 'favorites',
    categoryId: 'all',
    sort: 'recently_added',
  });
  assert.deepEqual(favs.map((b) => b.id), ['b3', 'b1']);
});

test('findDuplicateBook detects matching filename+size or normalized title+pages', () => {
  const existing = [makeBook({ id: 'b1', title: 'Clean Code', fileName: 'clean_code.pdf', fileSize: 55000, totalPages: 464 })];
  assert.ok(findDuplicateBook(existing, { title: 'Other', fileName: 'CLEAN_CODE.PDF', fileSize: 55000 }));
  assert.ok(findDuplicateBook(existing, { title: '  clean   code ', fileName: 'copy.pdf', fileSize: 123, totalPages: 464 }));
  assert.equal(findDuplicateBook(existing, { title: 'Clean Architecture', fileName: 'arch.pdf', fileSize: 55000, totalPages: 432 }), undefined);
});

test('default categories include all 10 required categories', () => {
  const cats = createDefaultCategories(1000);
  assert.equal(cats.length, 10);
  assert.ok(cats.some((c) => c.name === 'Personal Development'));
  assert.ok(cats.some((c) => c.name === 'Others'));
});

test('formatBytes and validateBackupManifest work reliably', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(validateBackupManifest({ app: 'Other' }).valid, false);
  assert.equal(validateBackupManifest({ app: 'MyLibrary', manifestVersion: 99 }).valid, false);
  assert.equal(
    validateBackupManifest({
      app: 'MyLibrary',
      manifestVersion: 1,
      books: [],
      categories: [],
      readingProgress: [],
      bookmarks: [],
    }).valid,
    true
  );
});
