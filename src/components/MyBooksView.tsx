import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import type {
  BookRecord,
  CategoryRecord,
  FilterOption,
  ReadingProgressRecord,
  SortOption,
  ViewMode,
} from '../types/library';
import { filterAndSortBooks } from '../utils/libraryLogic';
import { BookCard } from './BookCard';

interface MyBooksViewProps {
  books: BookRecord[];
  progressByBook: Map<string, ReadingProgressRecord>;
  categories: CategoryRecord[];
  categoriesById: Map<string, CategoryRecord>;
  defaultViewMode: ViewMode;
  defaultSort: SortOption;
  initialCategoryFilter?: string;
  focusSearchTrigger?: number;
  onOpenUpload: () => void;
  onOpenReader: (book: BookRecord) => void;
  onToggleFavorite: (bookId: string) => void;
  onEditBook: (book: BookRecord) => void;
  onDeleteBook: (book: BookRecord) => void;
}

const FILTER_TABS: { id: FilterOption; label: string }[] = [
  { id: 'all', label: 'All Books' },
  { id: 'reading', label: 'Currently Reading' },
  { id: 'completed', label: 'Completed' },
  { id: 'not_started', label: 'Not Started' },
  { id: 'favorites', label: 'Favorites' },
];

export const MyBooksView: React.FC<MyBooksViewProps> = ({
  books,
  progressByBook,
  categories,
  categoriesById,
  defaultViewMode,
  defaultSort,
  initialCategoryFilter = 'all',
  focusSearchTrigger = 0,
  onOpenUpload,
  onOpenReader,
  onToggleFavorite,
  onEditBook,
  onDeleteBook,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [categoryId, setCategoryId] = useState<string>(initialCategoryFilter);
  const [sort, setSort] = useState<SortOption>(defaultSort);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);

  useEffect(() => {
    setCategoryId(initialCategoryFilter);
  }, [initialCategoryFilter]);

  useEffect(() => {
    if (focusSearchTrigger > 0) {
      searchInputRef.current?.focus();
    }
  }, [focusSearchTrigger]);

  const visibleBooks = useMemo(
    () =>
      filterAndSortBooks(books, progressByBook, {
        search,
        filter,
        categoryId,
        sort,
      }),
    [books, progressByBook, search, filter, categoryId, sort]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#DFD2C0] dark:border-[#3E3027]">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            My Books
          </h1>
          <p className="mt-1 text-sm text-[#5C4D42] dark:text-[#D8CBB8] font-mono-tabular">
            {visibleBooks.length} of {books.length} {books.length === 1 ? 'volume' : 'volumes'} shown
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenUpload}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Import PDF</span>
        </button>
      </div>

      {/* Search, Sort & View Controls */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#7C6C5F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="books-search-input" className="sr-only">
            Search books by title or author
          </label>
          <input
            ref={searchInputRef}
            id="books-search-input"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by book title or author..."
            className="w-full min-h-[44px] pl-10 pr-9 rounded-xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-sm text-[#292929] dark:text-[#F5EFE5] focus:outline-none focus:ring-2 focus:ring-[#B68B54]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[#7C6C5F]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <select
            aria-label="Filter by category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="min-h-[44px] px-3 rounded-xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-sm text-[#292929] dark:text-[#F5EFE5] min-w-0"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Sort books"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="min-h-[44px] px-3 rounded-xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-sm text-[#292929] dark:text-[#F5EFE5] min-w-0"
          >
            <option value="recently_added">Recently Added</option>
            <option value="recently_read">Recently Read</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="progress">Reading Progress</option>
          </select>

          <div className="col-span-2 sm:col-span-1 flex items-center justify-self-end rounded-xl bg-[#EBE1D2] dark:bg-[#2E241D] p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={`min-h-[36px] min-w-[38px] flex items-center justify-center rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[#FFFDF9] dark:bg-[#231B16] text-[#352820] dark:text-[#F5EFE5] shadow-xs'
                  : 'text-[#7C6C5F] dark:text-[#A69684]'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              className={`min-h-[36px] min-w-[38px] flex items-center justify-center rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-[#FFFDF9] dark:bg-[#231B16] text-[#352820] dark:text-[#F5EFE5] shadow-xs'
                  : 'text-[#7C6C5F] dark:text-[#A69684]'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Segmented Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              filter === tab.id
                ? 'bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E]'
                : 'bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] text-[#5C4D42] dark:text-[#D8CBB8] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bookshelf Content */}
      {visibleBooks.length === 0 ? (
        <div className="rounded-2xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] p-10 text-center">
          <p className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            No matching books found
          </p>
          <p className="mt-1.5 text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
            {books.length === 0
              ? 'Import your personal PDF collection to start building your shelf.'
              : 'Try adjusting your search keywords, category, or status filter.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {books.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                  setCategoryId('all');
                }}
                className="min-h-[44px] px-4 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-sm font-medium"
              >
                Reset Filters
              </button>
            )}
            <button
              type="button"
              onClick={onOpenUpload}
              className="min-h-[44px] px-5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium"
            >
              Import PDF Books
            </button>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {visibleBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              progress={progressByBook.get(book.id)}
              category={categoriesById.get(book.categoryId)}
              viewMode="list"
              onOpenReader={onOpenReader}
              onToggleFavorite={onToggleFavorite}
              onEdit={onEditBook}
              onDelete={onDeleteBook}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {visibleBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              progress={progressByBook.get(book.id)}
              category={categoriesById.get(book.categoryId)}
              viewMode="grid"
              onOpenReader={onOpenReader}
              onToggleFavorite={onToggleFavorite}
              onEdit={onEditBook}
              onDelete={onDeleteBook}
            />
          ))}
        </div>
      )}
    </div>
  );
};
