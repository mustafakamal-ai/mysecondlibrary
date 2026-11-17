import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, FolderPlus, Pencil, Trash2, X } from 'lucide-react';
import type { BookRecord, CategoryRecord } from '../types/library';
import {
  createCategory,
  deleteCategorySafely,
  renameCategory,
} from '../db/libraryDb';
import { ConfirmDialog } from './ConfirmDialog';

interface CategoriesViewProps {
  categories: CategoryRecord[];
  books: BookRecord[];
  onRefresh: () => void;
  onSelectCategory: (categoryId: string) => void;
  onNotify: (type: 'success' | 'info' | 'error', text: string) => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({
  categories,
  books,
  onRefresh,
  onSelectCategory,
  onNotify,
}) => {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<CategoryRecord | null>(null);

  const countByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of books) {
      map.set(b.categoryId, (map.get(b.categoryId) ?? 0) + 1);
    }
    return map;
  }, [books]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await createCategory(newName);
      setNewName('');
      onRefresh();
      onNotify('success', `Category "${created.name}" created.`);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to create category.');
    }
  };

  const handleSaveRename = async (categoryId: string) => {
    try {
      await renameCategory(categoryId, editingName);
      setEditingId(null);
      setEditingName('');
      onRefresh();
      onNotify('success', 'Category renamed.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Unable to rename category.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    await deleteCategorySafely(target.id);
    onRefresh();
    onNotify('info', `Category "${target.name}" removed. Books remain safely in your library.`);
  };

  return (
    <div className="space-y-6">
      <div className="pb-5 border-b border-[#DFD2C0] dark:border-[#3E3027]">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
          Categories
        </h1>
        <p className="mt-1 text-sm text-[#5C4D42] dark:text-[#D8CBB8]">
          Organize your collection into curated shelves. Deleting a category never deletes your books.
        </p>
      </div>

      {/* Create New Category */}
      <form
        onSubmit={handleCreate}
        className="flex flex-col sm:flex-row gap-3 p-4 rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027]"
      >
        <label htmlFor="new-category-input" className="sr-only">
          New category name
        </label>
        <input
          id="new-category-input"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Create a custom category (e.g., Philosophy, Architecture)..."
          className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm text-[#292929] dark:text-[#F5EFE5]"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium disabled:opacity-45 whitespace-nowrap"
        >
          <FolderPlus className="w-4 h-4" />
          <span>Add Category</span>
        </button>
      </form>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const count = countByCat.get(cat.id) ?? 0;
          const isEditing = editingId === cat.id;

          return (
            <div
              key={cat.id}
              className="rounded-2xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] p-4 flex flex-col justify-between gap-4"
            >
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    aria-label={`Rename category ${cat.name}`}
                    className="flex-1 min-h-[40px] px-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveRename(cat.id)}
                    aria-label="Save category name"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E]"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel rename"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-[#DFD2C0] dark:border-[#3E3027]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]">
                      {cat.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-[#7C6C5F] dark:text-[#A69684] font-mono-tabular">
                      {count} {count === 1 ? 'volume' : 'volumes'}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(cat.id);
                        setEditingName(cat.name);
                      }}
                      aria-label={`Rename "${cat.name}"`}
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#7C6C5F] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    {categories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPendingDelete(cat)}
                        aria-label={`Delete "${cat.name}"`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#7C6C5F] hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className="inline-flex items-center justify-between w-full min-h-[40px] px-3.5 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D] text-xs font-medium text-[#352820] dark:text-[#F5EFE5] transition-colors"
              >
                <span>Browse shelf</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#B68B54]" />
              </button>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete Category"
        message={
          pendingDelete
            ? `Remove "${pendingDelete.name}"? Any books currently assigned to this category will be safely moved to another category and will not be deleted.`
            : ''
        }
        confirmLabel="Delete Category"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
