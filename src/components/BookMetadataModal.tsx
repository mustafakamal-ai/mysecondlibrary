import React, { useEffect, useState } from 'react';
import { BookOpen, ImagePlus, Save, X } from 'lucide-react';
import type { BookRecord, CategoryRecord, ReadingProgressRecord } from '../types/library';
import { db, updateBookMetadata } from '../db/libraryDb';
import { inspectPdfBlob } from '../services/pdfService';
import { formatBytes, formatRelativeDate } from '../utils/libraryLogic';
import { BookCoverArt } from './BookCard';

interface BookMetadataModalProps {
  book: BookRecord | null;
  progress?: ReadingProgressRecord;
  categories: CategoryRecord[];
  onClose: () => void;
  onSaved: () => void;
  onOpenReader: (book: BookRecord) => void;
}

export const BookMetadataModal: React.FC<BookMetadataModalProps> = ({
  book,
  progress,
  categories,
  onClose,
  onSaved,
  onOpenReader,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cover, setCover] = useState('');
  const [saving, setSaving] = useState(false);
  const [resettingCover, setResettingCover] = useState(false);

  useEffect(() => {
    if (book) {
      setTitle(book.title);
      setAuthor(book.author);
      setDescription(book.description);
      setCategoryId(book.categoryId);
      setCover(book.cover);
    }
  }, [book]);

  if (!book) return null;

  const handleCoverUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCover(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetCoverToPdfPage = async () => {
    setResettingCover(true);
    try {
      const pdfRecord = await db.pdfFiles.get(book.id);
      if (pdfRecord) {
        const meta = await inspectPdfBlob(pdfRecord.fileBlob, pdfRecord.fileName);
        if (meta.coverDataUrl) {
          setCover(meta.coverDataUrl);
        }
      }
    } finally {
      setResettingCover(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await updateBookMetadata(book.id, {
        title: title.trim(),
        author: author.trim() || 'Unknown Author',
        description: description.trim(),
        categoryId,
        cover,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-book-title"
    >
      <div className="w-full max-w-xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#DFD2C0] dark:border-[#3E3027] flex items-center justify-between">
          <h2
            id="edit-book-title"
            className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]"
          >
            Book Details & Metadata
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close book details"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#7C6C5F] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div className="w-28 h-40 rounded-xl overflow-hidden border border-[#DFD2C0] dark:border-[#3E3027] bg-[#EBE1D2] dark:bg-[#2E241D]">
                <BookCoverArt book={{ ...book, cover, title, author }} />
              </div>
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-[#B68B54] hover:underline">
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Change cover</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleCoverUpload(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                disabled={resettingCover}
                onClick={handleResetCoverToPdfPage}
                className="text-[11px] text-[#7C6C5F] dark:text-[#A69684] hover:underline"
              >
                {resettingCover ? 'Rendering...' : 'Use PDF page 1'}
              </button>
            </div>

            <div className="flex-1 w-full space-y-3">
              <div>
                <label htmlFor="meta-title" className="block text-xs font-medium text-[#5C4D42] dark:text-[#D8CBB8] mb-1">
                  Book Title
                </label>
                <input
                  id="meta-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
                />
              </div>
              <div>
                <label htmlFor="meta-author" className="block text-xs font-medium text-[#5C4D42] dark:text-[#D8CBB8] mb-1">
                  Author
                </label>
                <input
                  id="meta-author"
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
                />
              </div>
              <div>
                <label htmlFor="meta-category" className="block text-xs font-medium text-[#5C4D42] dark:text-[#D8CBB8] mb-1">
                  Category
                </label>
                <select
                  id="meta-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="meta-description" className="block text-xs font-medium text-[#5C4D42] dark:text-[#D8CBB8] mb-1">
              Description
            </label>
            <textarea
              id="meta-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
            />
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[#DFD2C0] dark:border-[#3E3027] text-xs">
            <div>
              <dt className="text-[#7C6C5F] dark:text-[#A69684]">Pages</dt>
              <dd className="mt-0.5 font-mono-tabular font-medium text-[#352820] dark:text-[#F5EFE5]">
                {book.totalPages}
              </dd>
            </div>
            <div>
              <dt className="text-[#7C6C5F] dark:text-[#A69684]">File Size</dt>
              <dd className="mt-0.5 font-mono-tabular font-medium text-[#352820] dark:text-[#F5EFE5]">
                {formatBytes(book.fileSize)}
              </dd>
            </div>
            <div>
              <dt className="text-[#7C6C5F] dark:text-[#A69684]">Progress</dt>
              <dd className="mt-0.5 font-mono-tabular font-medium text-[#352820] dark:text-[#F5EFE5]">
                {progress ? `P. ${progress.lastPage} (${progress.progressPercentage}%)` : 'Not started'}
              </dd>
            </div>
            <div>
              <dt className="text-[#7C6C5F] dark:text-[#A69684]">Last Opened</dt>
              <dd className="mt-0.5 font-medium text-[#352820] dark:text-[#F5EFE5]">
                {formatRelativeDate(book.lastOpened)}
              </dd>
            </div>
          </dl>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenReader(book);
              }}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-sm font-medium text-[#352820] dark:text-[#F5EFE5] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
            >
              <BookOpen className="w-4 h-4 text-[#B68B54]" />
              <span>Open in Reader</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
