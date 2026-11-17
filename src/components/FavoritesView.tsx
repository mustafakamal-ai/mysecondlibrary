import React from 'react';
import { Heart } from 'lucide-react';
import type { BookRecord, CategoryRecord, ReadingProgressRecord } from '../types/library';
import { BookCard } from './BookCard';

interface FavoritesViewProps {
  books: BookRecord[];
  progressByBook: Map<string, ReadingProgressRecord>;
  categoriesById: Map<string, CategoryRecord>;
  onOpenReader: (book: BookRecord) => void;
  onToggleFavorite: (bookId: string) => void;
  onEditBook: (book: BookRecord) => void;
  onDeleteBook: (book: BookRecord) => void;
  onBrowseAll: () => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  books,
  progressByBook,
  categoriesById,
  onOpenReader,
  onToggleFavorite,
  onEditBook,
  onDeleteBook,
  onBrowseAll,
}) => {
  const favorites = books.filter((b) => b.isFavorite);

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-[#DFD2C0] dark:border-[#3E3027]">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
          Favorites
        </h1>
        <p className="mt-1 text-sm text-[#5C4D42] dark:text-[#D8CBB8] font-mono-tabular">
          {favorites.length} {favorites.length === 1 ? 'treasured volume' : 'treasured volumes'}
        </p>
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-2xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#231B16] p-10 text-center">
          <Heart className="w-8 h-8 mx-auto text-[#B68B54]" />
          <p className="mt-3 font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
            No favorite books yet
          </p>
          <p className="mt-1.5 text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
            Mark books as favorites in your bookshelf to access them quickly here.
          </p>
          <button
            type="button"
            onClick={onBrowseAll}
            className="mt-5 min-h-[44px] px-5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium"
          >
            Explore My Books
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {favorites.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              progress={progressByBook.get(book.id)}
              category={categoriesById.get(book.categoryId)}
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
