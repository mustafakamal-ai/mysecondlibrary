import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileText,
  ImagePlus,
  Lock,
  Upload,
  X,
} from 'lucide-react';
import type { BookRecord, CategoryRecord } from '../types/library';
import { saveBookWithPdf } from '../db/libraryDb';
import { inspectPdfBlob, PdfLoadError } from '../services/pdfService';
import { findDuplicateBook, formatBytes } from '../utils/libraryLogic';

interface UploadModalProps {
  open: boolean;
  existingBooks: BookRecord[];
  categories: CategoryRecord[];
  onClose: () => void;
  onImported: (count: number) => void;
}

interface PendingImportItem {
  id: string;
  file: File;
  title: string;
  author: string;
  description: string;
  categoryId: string;
  cover: string;
  totalPages: number;
  status: 'pending' | 'processing' | 'needs_password' | 'duplicate_warning' | 'ready' | 'saved' | 'error' | 'cancelled';
  progress: number;
  errorMessage?: string;
  duplicateTitle?: string;
  passwordInput?: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  open,
  existingBooks,
  categories,
  onClose,
  onImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledIdsRef = useRef<Set<string>>(new Set());
  const [items, setItems] = useState<PendingImportItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  if (!open) return null;

  const defaultCatId = categories[0]?.id ?? 'cat-others';

  const processSingleItem = async (itemId: string, file: File, password?: string, ignoreDuplicate = false) => {
    if (cancelledIdsRef.current.has(itemId)) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, status: 'processing', progress: 25, errorMessage: undefined } : it
      )
    );

    try {
      const isPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        throw new Error('Only PDF files (.pdf) are supported.');
      }

      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, progress: 55 } : it))
      );

      const inspected = await inspectPdfBlob(file, file.name, password);

      if (cancelledIdsRef.current.has(itemId)) return;

      const duplicate = !ignoreDuplicate
        ? findDuplicateBook(existingBooks, {
            title: inspected.title,
            fileName: file.name,
            fileSize: file.size,
            totalPages: inspected.totalPages,
          })
        : undefined;

      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                title: inspected.title,
                author: inspected.author,
                totalPages: inspected.totalPages,
                cover: inspected.coverDataUrl,
                progress: 100,
                status: duplicate ? 'duplicate_warning' : 'ready',
                duplicateTitle: duplicate?.title,
              }
            : it
        )
      );
    } catch (err) {
      if (cancelledIdsRef.current.has(itemId)) return;
      if (err instanceof PdfLoadError && (err.code === 'PASSWORD_REQUIRED' || err.code === 'INCORRECT_PASSWORD')) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  status: 'needs_password',
                  progress: 0,
                  errorMessage: err.message,
                }
              : it
          )
        );
        return;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                status: 'error',
                progress: 0,
                errorMessage: err instanceof Error ? err.message : 'Failed to read PDF file.',
              }
            : it
        )
      );
    }
  };

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const newEntries: PendingImportItem[] = files.map((file) => ({
      id: `up-${crypto.randomUUID()}`,
      file,
      title: file.name.replace(/\.pdf$/i, ''),
      author: 'Unknown Author',
      description: '',
      categoryId: defaultCatId,
      cover: '',
      totalPages: 0,
      status: 'pending',
      progress: 10,
    }));

    setItems((prev) => [...prev, ...newEntries]);
    for (const entry of newEntries) {
      void processSingleItem(entry.id, entry.file);
    }
  };

  const handleCancelItem = (itemId: string) => {
    cancelledIdsRef.current.add(itemId);
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleCustomCoverChange = (itemId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (dataUrl) {
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, cover: dataUrl } : it))
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveReadyBooks = async () => {
    const readyItems = items.filter((it) => it.status === 'ready');
    if (readyItems.length === 0) return;
    setIsSavingAll(true);

    let savedCount = 0;
    try {
      for (const item of readyItems) {
        const bookId = `book-${crypto.randomUUID()}`;
        const now = Date.now();
        const book: BookRecord = {
          id: bookId,
          title: item.title.trim() || item.file.name.replace(/\.pdf$/i, ''),
          author: item.author.trim() || 'Unknown Author',
          description: item.description.trim(),
          categoryId: item.categoryId || defaultCatId,
          cover: item.cover,
          totalPages: item.totalPages,
          dateAdded: now,
          lastOpened: null,
          isFavorite: false,
          readingStatus: 'not_started',
          fileName: item.file.name,
          fileSize: item.file.size,
        };

        await saveBookWithPdf(book, {
          bookId,
          fileBlob: item.file,
          fileName: item.file.name,
          fileSize: item.file.size,
          mimeType: item.file.type || 'application/pdf',
        });

        savedCount += 1;
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'saved' } : it))
        );
      }

      onImported(savedCount);
      setItems([]);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save book to local storage.';
      setItems((prev) =>
        prev.map((it) =>
          it.status === 'ready' ? { ...it, status: 'error', errorMessage: msg } : it
        )
      );
    } finally {
      setIsSavingAll(false);
    }
  };

  const readyCount = items.filter((it) => it.status === 'ready').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#FFFDF9] dark:bg-[#231B16] border border-[#DFD2C0] dark:border-[#3E3027] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#DFD2C0] dark:border-[#3E3027] flex items-center justify-between">
          <div>
            <h2
              id="upload-modal-title"
              className="font-display text-2xl font-semibold text-[#352820] dark:text-[#F5EFE5]"
            >
              Import PDF Books
            </h2>
            <p className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
              Stored privately on this device. Files never leave your browser.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setItems([]);
              onClose();
            }}
            aria-label="Close import dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#7C6C5F] hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFilesSelected(e.dataTransfer.files);
            }}
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-[#B68B54] bg-[#B68B54]/10'
                : 'border-[#DFD2C0] dark:border-[#3E3027] bg-[#F5EFE5]/60 dark:bg-[#18120E]/50'
            }`}
          >
            <Upload className="w-8 h-8 mx-auto text-[#B68B54]" />
            <p className="mt-3 text-sm font-medium text-[#352820] dark:text-[#F5EFE5]">
              Select PDF files from your device or drop them here
            </p>
            <p className="mt-1 text-xs text-[#7C6C5F] dark:text-[#A69684]">
              Supports multiple PDFs, automatic cover extraction, and custom metadata
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
              id="pdf-upload-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <FileText className="w-4 h-4" />
              <span>Choose PDF Files</span>
            </button>
          </div>

          {items.length > 0 && (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#DFD2C0] dark:border-[#3E3027] bg-[#FFFDF9] dark:bg-[#1D1612] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#352820] dark:text-[#F5EFE5] truncate">
                        {item.file.name}
                      </p>
                      <p className="text-xs text-[#7C6C5F] dark:text-[#A69684] font-mono-tabular">
                        {formatBytes(item.file.size)}
                        {item.totalPages > 0 ? ` · ${item.totalPages} pages` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancelItem(item.id)}
                      aria-label={`Remove ${item.file.name} from import queue`}
                      className="min-h-[36px] px-2.5 rounded-lg text-xs text-[#7C6C5F] hover:text-red-700 dark:hover:text-red-400 hover:bg-[#EBE1D2] dark:hover:bg-[#2E241D]"
                    >
                      Cancel
                    </button>
                  </div>

                  {(item.status === 'pending' || item.status === 'processing') && (
                    <div className="mt-3">
                      <div className="h-2 rounded-full bg-[#EBE1D2] dark:bg-[#2E241D] overflow-hidden">
                        <div
                          className="h-full bg-[#B68B54] transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-[#7C6C5F] dark:text-[#A69684]">
                        Inspecting PDF pages & generating cover preview...
                      </p>
                    </div>
                  )}

                  {item.status === 'error' && (
                    <p role="alert" className="mt-2.5 text-xs text-red-700 dark:text-red-400">
                      {item.errorMessage}
                    </p>
                  )}

                  {item.status === 'needs_password' && (
                    <div className="mt-3 p-3 rounded-xl bg-[#F5EFE5] dark:bg-[#2E241D] space-y-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-[#352820] dark:text-[#F5EFE5]">
                        <Lock className="w-3.5 h-3.5 text-[#B68B54]" />
                        <span>{item.errorMessage}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={item.passwordInput ?? ''}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it) =>
                                it.id === item.id ? { ...it, passwordInput: e.target.value } : it
                              )
                            )
                          }
                          placeholder="Enter PDF password"
                          className="flex-1 min-h-[40px] px-3 rounded-lg bg-[#FFFDF9] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            processSingleItem(item.id, item.file, item.passwordInput || '')
                          }
                          className="min-h-[40px] px-4 rounded-lg bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium"
                        >
                          Unlock
                        </button>
                      </div>
                    </div>
                  )}

                  {item.status === 'duplicate_warning' && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 space-y-2">
                      <div className="flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          A similar book (&ldquo;{item.duplicateTitle}&rdquo;) already exists in your library. Import as a separate copy anyway?
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setItems((prev) =>
                              prev.map((it) =>
                                it.id === item.id ? { ...it, status: 'ready' } : it
                              )
                            )
                          }
                          className="min-h-[38px] px-3 rounded-lg bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-xs font-medium"
                        >
                          Import Anyway
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelItem(item.id)}
                          className="min-h-[38px] px-3 rounded-lg border border-[#DFD2C0] dark:border-[#3E3027] text-xs font-medium"
                        >
                          Skip Duplicate
                        </button>
                      </div>
                    </div>
                  )}

                  {item.status === 'ready' && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-4">
                      <div className="shrink-0 flex flex-col items-center gap-2">
                        <div className="w-24 h-32 rounded-lg overflow-hidden border border-[#DFD2C0] dark:border-[#3E3027] bg-[#EBE1D2] dark:bg-[#2E241D]">
                          {item.cover ? (
                            <img
                              src={item.cover}
                              alt={`Preview of ${item.title}`}
                              className="w-full h-full object-cover"
                            />
                          ) : null}
                        </div>
                        <label className="cursor-pointer inline-flex items-center gap-1 text-xs font-medium text-[#B68B54] hover:underline">
                          <ImagePlus className="w-3.5 h-3.5" />
                          <span>Custom cover</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                              handleCustomCoverChange(item.id, e.target.files?.[0] ?? null)
                            }
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-[#5C4D42] dark:text-[#D8CBB8] mb-1">
                            Title
                          </label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === item.id ? { ...it, title: e.target.value } : it
                                )
                              )
                            }
                            className="w-full min-h-[40px] px-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm text-[#292929] dark:text-[#F5EFE5]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#5C4D42] dark:text-[#D8CBB8] mb-1">
                            Author
                          </label>
                          <input
                            type="text"
                            value={item.author}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === item.id ? { ...it, author: e.target.value } : it
                                )
                              )
                            }
                            className="w-full min-h-[40px] px-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm text-[#292929] dark:text-[#F5EFE5]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#5C4D42] dark:text-[#D8CBB8] mb-1">
                            Category
                          </label>
                          <select
                            value={item.categoryId}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === item.id ? { ...it, categoryId: e.target.value } : it
                                )
                              )
                            }
                            className="w-full min-h-[40px] px-3 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm text-[#292929] dark:text-[#F5EFE5]"
                          >
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-[#5C4D42] dark:text-[#D8CBB8] mb-1">
                            Description (optional)
                          </label>
                          <textarea
                            rows={2}
                            value={item.description}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === item.id ? { ...it, description: e.target.value } : it
                                )
                              )
                            }
                            placeholder="Brief notes or summary..."
                            className="w-full p-2.5 rounded-xl bg-[#F5EFE5] dark:bg-[#18120E] border border-[#DFD2C0] dark:border-[#3E3027] text-sm text-[#292929] dark:text-[#F5EFE5]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#DFD2C0] dark:border-[#3E3027] flex items-center justify-between gap-3 bg-[#FAF6EF] dark:bg-[#1D1612]">
          <span className="text-xs text-[#7C6C5F] dark:text-[#A69684]">
            {readyCount > 0
              ? `${readyCount} book${readyCount > 1 ? 's' : ''} ready to add`
              : 'Select PDF files to import'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setItems([]);
                onClose();
              }}
              className="min-h-[44px] px-4 rounded-xl border border-[#DFD2C0] dark:border-[#3E3027] text-sm font-medium text-[#352820] dark:text-[#F5EFE5]"
            >
              Close
            </button>
            <button
              type="button"
              disabled={readyCount === 0 || isSavingAll}
              onClick={handleSaveReadyBooks}
              className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#352820] dark:bg-[#B68B54] text-[#F5EFE5] dark:text-[#18120E] text-sm font-medium disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              <span>{isSavingAll ? 'Saving...' : 'Add to Library'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
