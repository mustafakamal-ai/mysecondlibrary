import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageFlip } from 'page-flip';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Columns2,
  File as FileIcon,
  Lock,
  Maximize,
  Minimize,
  Monitor,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  addBookmark,
  db,
  deleteBookmark,
  saveReadingProgress,
} from '../db/libraryDb';
import {
  closePdfDocument,
  getPdfPageAspectRatio,
  openPdfDocument,
  PdfLoadError,
  renderPdfPageToCanvas,
} from '../services/pdfService';
import type {
  BookRecord,
  BookmarkRecord,
  ReadingMode,
} from '../types/library';
import { computeProgressPercentage } from '../utils/libraryLogic';

interface BookReaderProps {
  book: BookRecord;
  initialReadingMode: ReadingMode;
  initialZoom: number;
  onClose: () => void;
  onProgressUpdated: () => void;
}

export const BookReader: React.FC<BookReaderProps> = ({
  book,
  initialReadingMode,
  initialZoom,
  onClose,
  onProgressUpdated,
}) => {
  const readerRootRef = useRef<HTMLDivElement>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const flipMountRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<PageFlip | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(book.totalPages || 1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageAspectRatio, setPageAspectRatio] = useState<number>(0.707);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [readingMode, setReadingMode] = useState<ReadingMode>(initialReadingMode);
  const [zoom, setZoom] = useState<number>(initialZoom || 1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 900,
    height: 640,
  });

  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [showBookmarksDrawer, setShowBookmarksDrawer] = useState<boolean>(false);
  const [bookmarkNote, setBookmarkNote] = useState<string>('');
  const [showAddBookmarkForm, setShowAddBookmarkForm] = useState<boolean>(false);
  const [pageInputValue, setPageInputValue] = useState<string>('1');

  const latestPageRef = useRef<number>(1);
  const totalPagesRef = useRef<number>(book.totalPages || 1);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const activeRenderCancelsRef = useRef<Map<string, () => void>>(new Map());
  const saveTimerRef = useRef<number | null>(null);
  const initialPageRestoredRef = useRef<boolean>(false);
  const onProgressUpdatedRef = useRef(onProgressUpdated);
  onProgressUpdatedRef.current = onProgressUpdated;

  const loadBookmarks = useCallback(async () => {
    const list = await db.bookmarks.where('bookId').equals(book.id).toArray();
    list.sort((a, b) => a.pageNumber - b.pageNumber || b.createdAt - a.createdAt);
    setBookmarks(list);
  }, [book.id]);

  // Flush reading progress reliably without destabilizing reader effect dependencies
  const flushProgressNow = useCallback(
    async (pageNum: number, total: number) => {
      if (total <= 0) return;
      try {
        await saveReadingProgress(book.id, pageNum, total);
        onProgressUpdatedRef.current();
      } catch {
        // Ignore storage error on rapid unmount
      }
    },
    [book.id]
  );

  const scheduleProgressSave = useCallback(
    (pageNum: number, total: number) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void flushProgressNow(pageNum, total);
      }, 320);
    },
    [flushProgressNow]
  );

  // Load PDF document and saved progress from IndexedDB
  const openBookFromDb = useCallback(
    async (password?: string) => {
      setLoading(true);
      setLoadError(null);
      setPasswordError(null);

      try {
        const [pdfRecord, savedProgress] = await Promise.all([
          db.pdfFiles.get(book.id),
          db.readingProgress.get(book.id),
        ]);

        if (!pdfRecord) {
          throw new Error('The local PDF file for this book could not be found in IndexedDB.');
        }

        const doc = await openPdfDocument(pdfRecord.fileBlob, password);
        pdfDocRef.current = doc;

        const ratio = await getPdfPageAspectRatio(doc, 1);
        const startPage = savedProgress?.lastPage
          ? Math.max(1, Math.min(savedProgress.lastPage, doc.numPages))
          : 1;

        latestPageRef.current = startPage;
        totalPagesRef.current = doc.numPages;
        initialPageRestoredRef.current = true;

        setPageAspectRatio(ratio);
        setTotalPages(doc.numPages);
        setCurrentPage(startPage);
        setPageInputValue(String(startPage));
        setNeedsPassword(false);
        setPdfDoc(doc);

        await loadBookmarks();
        // Record initial open timestamp/progress if never opened
        if (!savedProgress) {
          await saveReadingProgress(book.id, startPage, doc.numPages);
          onProgressUpdatedRef.current();
        }
      } catch (err) {
        if (err instanceof PdfLoadError) {
          if (err.code === 'PASSWORD_REQUIRED' || err.code === 'INCORRECT_PASSWORD') {
            setNeedsPassword(true);
            if (err.code === 'INCORRECT_PASSWORD') {
              setPasswordError(err.message);
            }
            setLoading(false);
            return;
          }
        }
        setLoadError(
          err instanceof Error ? err.message : 'Unable to open this PDF document.'
        );
      } finally {
        setLoading(false);
      }
    },
    [book.id, loadBookmarks]
  );

  useEffect(() => {
    void openBookFromDb();
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (initialPageRestoredRef.current) {
        void flushProgressNow(latestPageRef.current, totalPagesRef.current);
      }
      for (const cancel of activeRenderCancelsRef.current.values()) {
        cancel();
      }
      activeRenderCancelsRef.current.clear();
      if (pdfDocRef.current) {
        void closePdfDocument(pdfDocRef.current);
        pdfDocRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Save on pagehide / visibilitychange so unexpected closure preserves exact page
  useEffect(() => {
    const handleFlush = () => {
      if (initialPageRestoredRef.current) {
        void flushProgressNow(latestPageRef.current, totalPagesRef.current);
      }
    };
    window.addEventListener('pagehide', handleFlush);
    return () => window.removeEventListener('pagehide', handleFlush);
  }, [flushProgressNow]);

  // Observe stage container size without triggering jitter rebuilds
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      if (el.clientWidth <= 0 || el.clientHeight <= 0) return;
      const nextW = Math.max(280, el.clientWidth);
      const nextH = Math.max(320, el.clientHeight);
      setStageSize((prev) =>
        Math.abs(prev.width - nextW) <= 2 && Math.abs(prev.height - nextH) <= 2
          ? prev
          : { width: nextW, height: nextH }
      );
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Track fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const effectiveIsSingle = useMemo(() => {
    if (readingMode === 'single') return true;
    if (readingMode === 'double') return false;
    return stageSize.width < 768 || stageSize.width < stageSize.height * 1.05;
  }, [readingMode, stageSize.width, stageSize.height]);

  // Calculate crisp page dimensions preserving PDF aspect ratio
  const bookGeometry = useMemo(() => {
    const availW = Math.max(260, stageSize.width - 32);
    const availH = Math.max(280, stageSize.height - 28);
    const spreadMultiplier = effectiveIsSingle ? 1 : 2;

    let pageHeight = availH;
    let pageWidth = pageHeight * pageAspectRatio;

    if (pageWidth * spreadMultiplier > availW) {
      pageWidth = availW / spreadMultiplier;
      pageHeight = pageWidth / pageAspectRatio;
    }

    pageWidth = Math.max(200, Math.floor(pageWidth * zoom));
    pageHeight = Math.max(260, Math.floor(pageHeight * zoom));

    return { pageWidth, pageHeight };
  }, [stageSize.width, stageSize.height, effectiveIsSingle, pageAspectRatio, zoom]);

  // Render visible sliding window of PDF pages onto StPageFlip canvases
  const renderWindowAroundPage = useCallback(
    (centerPage1Based: number, doc: PDFDocumentProxy, pageW: number, pageH: number) => {
      const mount = flipMountRef.current;
      if (!mount) return;

      const minPage = Math.max(1, centerPage1Based - 2);
      const maxPage = Math.min(doc.numPages, centerPage1Based + 3);

      // Clear distant canvases to protect mobile memory
      for (const oldPage of Array.from(renderedPagesRef.current)) {
        if (oldPage < centerPage1Based - 5 || oldPage > centerPage1Based + 6) {
          const oldCanvases = mount.querySelectorAll<HTMLCanvasElement>(
            `canvas[data-pdf-page="${oldPage}"]`
          );
          oldCanvases.forEach((c) => {
            c.width = 0;
            c.height = 0;
          });
          renderedPagesRef.current.delete(oldPage);
        }
      }

      for (let p = minPage; p <= maxPage; p++) {
        const canvases = mount.querySelectorAll<HTMLCanvasElement>(
          `canvas[data-pdf-page="${p}"]`
        );
        canvases.forEach((canvas, cloneIdx) => {
          const key = `${p}-${cloneIdx}-${pageW}x${pageH}`;
          if (canvas.dataset.renderedKey === key && canvas.width > 0) {
            return;
          }

          const existingCancel = activeRenderCancelsRef.current.get(`${p}-${cloneIdx}`);
          if (existingCancel) existingCancel();

          const cancel = renderPdfPageToCanvas(doc, p, canvas, pageW, pageH, (ok) => {
            if (ok) {
              canvas.dataset.renderedKey = key;
              renderedPagesRef.current.add(p);
              const placeholder = canvas.parentElement?.querySelector('[data-page-loader]');
              if (placeholder instanceof HTMLElement) {
                placeholder.style.display = 'none';
              }
            }
          });
          activeRenderCancelsRef.current.set(`${p}-${cloneIdx}`, cancel);
        });
      }
    },
    []
  );

  const renderWindowRef = useRef(renderWindowAroundPage);
  renderWindowRef.current = renderWindowAroundPage;
  const scheduleProgressSaveRef = useRef(scheduleProgressSave);
  scheduleProgressSaveRef.current = scheduleProgressSave;

  // Initialize / re-initialize StPageFlip when pdfDoc, geometry, or single/double mode changes
  useEffect(() => {
    const mount = flipMountRef.current;
    if (!pdfDoc || !mount) return;

    // Clean up any previous renders
    for (const cancel of activeRenderCancelsRef.current.values()) {
      cancel();
    }
    activeRenderCancelsRef.current.clear();
    renderedPagesRef.current.clear();

    if (pageFlipRef.current) {
      try {
        pageFlipRef.current.destroy();
      } catch {
        // ignore
      }
      pageFlipRef.current = null;
    }
    mount.innerHTML = '';

    const bookHost = document.createElement('div');
    mount.appendChild(bookHost);

    const pageNodes: HTMLElement[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const pageEl = document.createElement('div');
      pageEl.className =
        'reader-page relative w-full h-full bg-[#FCF9F2] flex items-center justify-center overflow-hidden shadow-inner';
      if (i === 1 || i === pdfDoc.numPages) {
        pageEl.setAttribute('data-density', 'hard');
      }

      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-pdf-page', String(i));
      canvas.className = 'w-full h-full object-contain block';

      const loader = document.createElement('div');
      loader.setAttribute('data-page-loader', 'true');
      loader.className =
        'absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-[#7C6C5F] bg-[#FCF9F2]';
      loader.innerHTML = `<span class="font-mono-tabular">Page ${i}</span>`;

      pageEl.appendChild(canvas);
      pageEl.appendChild(loader);
      pageNodes.push(pageEl);
    }

    const startIndex = Math.max(0, Math.min(latestPageRef.current - 1, pdfDoc.numPages - 1));

    const pf = new PageFlip(bookHost, {
      width: bookGeometry.pageWidth,
      height: bookGeometry.pageHeight,
      size: 'fixed',
      minWidth: bookGeometry.pageWidth,
      maxWidth: bookGeometry.pageWidth,
      minHeight: bookGeometry.pageHeight,
      maxHeight: bookGeometry.pageHeight,
      drawShadow: true,
      flippingTime: 650,
      usePortrait: effectiveIsSingle,
      startZIndex: 10,
      startPage: startIndex,
      autoSize: true,
      maxShadowOpacity: 0.5,
      showCover: true,
      mobileScrollSupport: true,
      swipeDistance: 28,
      showPageCorners: true,
      disableFlipByClick: false,
    });

    pf.on('init', () => {
      renderWindowRef.current(
        latestPageRef.current,
        pdfDoc,
        bookGeometry.pageWidth,
        bookGeometry.pageHeight
      );
    });

    pf.on('flip', (e) => {
      const zeroIdx = typeof e.data === 'number' ? e.data : 0;
      const newPage = Math.max(1, Math.min(zeroIdx + 1, pdfDoc.numPages));
      latestPageRef.current = newPage;
      setCurrentPage(newPage);
      setPageInputValue(String(newPage));
      scheduleProgressSaveRef.current(newPage, pdfDoc.numPages);
      renderWindowRef.current(
        newPage,
        pdfDoc,
        bookGeometry.pageWidth,
        bookGeometry.pageHeight
      );
    });

    pf.on('changeOrientation', () => {
      renderWindowRef.current(
        latestPageRef.current,
        pdfDoc,
        bookGeometry.pageWidth,
        bookGeometry.pageHeight
      );
    });

    pf.loadFromHTML(pageNodes);
    pageFlipRef.current = pf;

    // Immediate render pass for first visible spread
    renderWindowRef.current(
      latestPageRef.current,
      pdfDoc,
      bookGeometry.pageWidth,
      bookGeometry.pageHeight
    );

    return () => {
      if (pageFlipRef.current) {
        try {
          pageFlipRef.current.destroy();
        } catch {
          // ignore
        }
        pageFlipRef.current = null;
      }
      mount.innerHTML = '';
    };
  }, [
    pdfDoc,
    bookGeometry.pageWidth,
    bookGeometry.pageHeight,
    effectiveIsSingle,
  ]);

  const goToNextPage = useCallback(() => {
    pageFlipRef.current?.flipNext('bottom');
  }, []);

  const goToPrevPage = useCallback(() => {
    pageFlipRef.current?.flipPrev('bottom');
  }, []);

  const jumpToPage = useCallback(
    (target1Based: number) => {
      const clamped = Math.max(1, Math.min(target1Based, totalPages));
      setPageInputValue(String(clamped));
      if (pageFlipRef.current) {
        const diff = Math.abs(clamped - currentPage);
        if (diff <= 2) {
          pageFlipRef.current.flip(clamped - 1, 'top');
        } else {
          pageFlipRef.current.turnToPage(clamped - 1);
          latestPageRef.current = clamped;
          setCurrentPage(clamped);
          scheduleProgressSave(clamped, totalPages);
          if (pdfDocRef.current) {
            renderWindowAroundPage(
              clamped,
              pdfDocRef.current,
              bookGeometry.pageWidth,
              bookGeometry.pageHeight
            );
          }
        }
      }
    },
    [
      totalPages,
      currentPage,
      scheduleProgressSave,
      renderWindowAroundPage,
      bookGeometry.pageWidth,
      bookGeometry.pageHeight,
    ]
  );

  // Keyboard arrow navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goToNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === 'Escape') {
        if (showBookmarksDrawer) {
          setShowBookmarksDrawer(false);
        } else if (!document.fullscreenElement) {
          void handleCloseReader();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goToNextPage, goToPrevPage, showBookmarksDrawer]);

  const handleCloseReader = async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (initialPageRestoredRef.current) {
      await flushProgressNow(latestPageRef.current, totalPagesRef.current);
    }
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
    onClose();
  };

  const toggleFullscreen = async () => {
    const root = readerRootRef.current;
    if (!root) return;
    try {
      if (!document.fullscreenElement) {
        await root.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen may be restricted in some embedded previews
    }
  };

  const currentBookmark = bookmarks.find((bm) => bm.pageNumber === currentPage);
  const progressPct = computeProgressPercentage(currentPage, totalPages);

  const handleSaveBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    await addBookmark(book.id, currentPage, bookmarkNote);
    setBookmarkNote('');
    setShowAddBookmarkForm(false);
    await loadBookmarks();
  };

  const handleRemoveBookmark = async (bmId: string) => {
    await deleteBookmark(bmId);
    await loadBookmarks();
  };

  return (
    <div
      ref={readerRootRef}
      data-testid="book-reader"
      data-current-page={currentPage}
      data-total-pages={totalPages}
      className="fixed inset-0 z-50 flex flex-col bg-[#241B15] text-[#F5EFE5] select-none"
    >
      {/* Top Reader Toolbar */}
      <header className="shrink-0 h-14 px-3 sm:px-5 border-b border-white/10 bg-[#1B140F]/95 backdrop-blur-md flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleCloseReader}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-white/8 hover:bg-white/15 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-[#C99E67]" />
            <span className="hidden sm:inline">Return to Bookshelf</span>
            <span className="sm:hidden">Bookshelf</span>
          </button>

          <div className="min-w-0 pl-1">
            <h1 className="font-display text-lg sm:text-xl font-semibold text-[#F5EFE5] truncate">
              {book.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Reading Mode Toggle */}
          <div className="hidden md:flex items-center rounded-xl bg-white/8 p-0.5 border border-white/10">
            <button
              type="button"
              onClick={() => setReadingMode('auto')}
              title="Auto orientation"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                readingMode === 'auto' ? 'bg-[#B68B54] text-[#18120E]' : 'text-[#D8CBB8] hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Auto</span>
            </button>
            <button
              type="button"
              onClick={() => setReadingMode('single')}
              title="Single page"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                readingMode === 'single' ? 'bg-[#B68B54] text-[#18120E]' : 'text-[#D8CBB8] hover:text-white'
              }`}
            >
              <FileIcon className="w-3.5 h-3.5" />
              <span>Single</span>
            </button>
            <button
              type="button"
              onClick={() => setReadingMode('double')}
              title="Double page spread"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                readingMode === 'double' ? 'bg-[#B68B54] text-[#18120E]' : 'text-[#D8CBB8] hover:text-white'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>Double</span>
            </button>
          </div>

          {/* Mobile cycle mode button */}
          <button
            type="button"
            onClick={() =>
              setReadingMode((m) => (m === 'auto' ? 'single' : m === 'single' ? 'double' : 'auto'))
            }
            aria-label={`Switch page layout (current: ${readingMode})`}
            className="md:hidden min-h-[40px] px-2.5 rounded-xl bg-white/8 text-xs font-medium text-[#E8DCCB]"
          >
            {readingMode === 'auto' ? 'Auto' : readingMode === 'single' ? '1-Page' : '2-Page'}
          </button>

          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center rounded-xl bg-white/8 border border-white/10">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.15).toFixed(2)))}
              aria-label="Zoom out"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center hover:bg-white/10 rounded-l-xl"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Reset zoom"
              className="px-2 text-xs font-mono-tabular text-[#E8DCCB]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)))}
              aria-label="Zoom in"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center hover:bg-white/10 rounded-r-xl"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Add Bookmark */}
          <button
            type="button"
            onClick={() => {
              if (currentBookmark) {
                setShowBookmarksDrawer(true);
              } else {
                setShowAddBookmarkForm((v) => !v);
              }
            }}
            aria-label={currentBookmark ? 'Page bookmarked — view bookmarks' : 'Bookmark this page'}
            className={`min-h-[40px] min-w-[40px] px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors ${
              currentBookmark
                ? 'bg-[#B68B54] text-[#18120E]'
                : 'bg-white/8 hover:bg-white/15 text-[#F5EFE5]'
            }`}
          >
            {currentBookmark ? (
              <Bookmark className="w-4 h-4 fill-current" />
            ) : (
              <BookmarkPlus className="w-4 h-4" />
            )}
            <span className="hidden lg:inline">
              {currentBookmark ? 'Bookmarked' : 'Bookmark'}
            </span>
          </button>

          {/* Bookmarks List Drawer */}
          <button
            type="button"
            onClick={() => setShowBookmarksDrawer((v) => !v)}
            aria-label={`Open bookmarks (${bookmarks.length})`}
            className="min-h-[40px] px-2.5 rounded-xl bg-white/8 hover:bg-white/15 text-xs font-medium flex items-center gap-1.5"
          >
            <Bookmark className="w-4 h-4 text-[#C99E67]" />
            <span className="font-mono-tabular">{bookmarks.length}</span>
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-white/8 hover:bg-white/15"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Quick Add Bookmark Bar */}
      {showAddBookmarkForm && (
        <form
          onSubmit={handleSaveBookmark}
          className="shrink-0 px-4 py-2.5 bg-[#2F241D] border-b border-white/10 flex flex-wrap items-center justify-center gap-2"
        >
          <span className="text-xs font-medium text-[#E8DCCB] font-mono-tabular">
            Bookmark Page {currentPage}:
          </span>
          <input
            type="text"
            value={bookmarkNote}
            onChange={(e) => setBookmarkNote(e.target.value)}
            placeholder="Optional note (e.g., Key quote)"
            className="flex-1 max-w-sm min-h-[38px] px-3 rounded-lg bg-[#18120E] border border-white/15 text-sm text-[#F5EFE5] placeholder:text-[#A69684]"
          />
          <button
            type="submit"
            className="min-h-[38px] px-4 rounded-lg bg-[#B68B54] text-[#18120E] text-xs font-semibold"
          >
            Save Bookmark
          </button>
          <button
            type="button"
            onClick={() => setShowAddBookmarkForm(false)}
            className="min-h-[38px] px-3 rounded-lg bg-white/10 text-xs"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Main Book Stage */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-8 text-center bg-[#241B15]">
            <div className="w-10 h-10 rounded-full border-2 border-[#B68B54]/30 border-t-[#B68B54] animate-spin" />
            <p className="text-sm text-[#E8DCCB]">Opening volume from local storage...</p>
          </div>
        )}

        {!loading && needsPassword && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-[#241B15]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void openBookFromDb(passwordInput);
              }}
              className="w-full max-w-sm rounded-2xl bg-[#1B140F] border border-white/15 p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#B68B54]/20 text-[#C99E67] flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-semibold">Password Protected PDF</h2>
                  <p className="text-xs text-[#D8CBB8]">Enter the document password to read.</p>
                </div>
              </div>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="PDF Password"
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#2A2019] border border-white/15 text-sm text-white"
              />
              {passwordError && (
                <p role="alert" className="text-xs text-red-400">
                  {passwordError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseReader}
                  className="min-h-[42px] px-4 rounded-xl bg-white/10 text-xs font-medium"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 rounded-xl bg-[#B68B54] text-[#18120E] text-xs font-semibold"
                >
                  Unlock PDF
                </button>
              </div>
            </form>
          </div>
        )}

        {!loading && loadError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-[#241B15]">
            <div className="max-w-md rounded-2xl bg-[#1B140F] border border-red-500/30 p-6 text-center space-y-4">
              <h2 className="font-display text-2xl font-semibold text-red-200">
                Unable to Render Book
              </h2>
              <p className="text-sm text-[#D8CBB8]">{loadError}</p>
              <button
                type="button"
                onClick={handleCloseReader}
                className="min-h-[44px] px-5 rounded-xl bg-[#B68B54] text-[#18120E] text-sm font-medium"
              >
                Return to Bookshelf
              </button>
            </div>
          </div>
        )}

        <div
          ref={stageContainerRef}
          className={`w-full h-full flex items-center justify-center p-2 sm:p-4 ${
            loading || loadError || needsPassword ? 'opacity-0 pointer-events-none' : ''
          }`}
        >
          {/* Previous Page Side Button */}
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="hidden sm:flex shrink-0 min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-black/30 hover:bg-black/50 disabled:opacity-25 text-[#F5EFE5] mr-2 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* StPageFlip Mount Container (uses m-auto inside flex overflow-auto to avoid zoom scroll clipping) */}
          <div className="library-flipbook-stage relative flex flex-1 min-w-0 min-h-0 overflow-auto max-w-full max-h-full">
            <div
              className="m-auto relative shrink-0"
              style={{
                width: effectiveIsSingle ? bookGeometry.pageWidth : bookGeometry.pageWidth * 2,
                height: bookGeometry.pageHeight,
              }}
            >
              <div ref={flipMountRef} data-testid="flipbook-stage" />
              {!effectiveIsSingle && currentPage > 1 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 bg-gradient-to-r from-transparent via-black/14 to-transparent z-20"
                />
              )}
            </div>
          </div>

          {/* Next Page Side Button */}
          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="hidden sm:flex shrink-0 min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-black/30 hover:bg-black/50 disabled:opacity-25 text-[#F5EFE5] ml-2 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Bookmarks Slide-over Drawer */}
        {showBookmarksDrawer && (
          <aside
            aria-label="Book bookmarks"
            className="absolute top-0 right-0 bottom-0 z-30 w-80 max-w-[90vw] bg-[#1B140F]/98 border-l border-white/15 shadow-2xl flex flex-col"
          >
            <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-[#F5EFE5]">
                Bookmarks
              </h2>
              <button
                type="button"
                onClick={() => setShowBookmarksDrawer(false)}
                aria-label="Close bookmarks drawer"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-white/10">
              <button
                type="button"
                onClick={() => {
                  setShowAddBookmarkForm(true);
                  setShowBookmarksDrawer(false);
                }}
                className="w-full min-h-[42px] rounded-xl bg-[#B68B54] text-[#18120E] text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>Bookmark Page {currentPage}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {bookmarks.length === 0 ? (
                <p className="text-xs text-[#A69684] text-center py-8 px-3">
                  No bookmarks yet. Tap Bookmark while reading to save important pages and notes.
                </p>
              ) : (
                bookmarks.map((bm) => (
                  <div
                    key={bm.id}
                    className="rounded-xl bg-white/6 border border-white/10 p-3 flex items-start justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        jumpToPage(bm.pageNumber);
                        setShowBookmarksDrawer(false);
                      }}
                      className="flex-1 text-left min-w-0"
                    >
                      <p className="text-xs font-mono-tabular font-semibold text-[#C99E67]">
                        Page {bm.pageNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-[#E8DCCB] break-words">
                        {bm.note || 'Saved page'}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveBookmark(bm.id)}
                      aria-label={`Remove bookmark on page ${bm.pageNumber}`}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A69684] hover:text-red-400 hover:bg-white/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Reading Progress & Navigation Footer */}
      <footer className="shrink-0 px-3 sm:px-6 py-2.5 border-t border-white/10 bg-[#1B140F]/95 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-white/8 hover:bg-white/15 disabled:opacity-35 text-xs font-medium flex items-center gap-1 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="flex-1 flex items-center gap-2 min-w-0">
            <input
              type="range"
              min={1}
              max={Math.max(1, totalPages)}
              value={currentPage}
              onChange={(e) => jumpToPage(Number(e.target.value))}
              aria-label="Reading progress slider"
              className="flex-1 min-w-0 accent-[#B68B54] cursor-pointer"
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = parseInt(pageInputValue, 10);
              if (!Number.isNaN(parsed)) {
                jumpToPage(parsed);
              }
            }}
            className="flex items-center gap-1.5 text-xs font-mono-tabular shrink-0"
          >
            <label htmlFor="reader-page-jump" className="sr-only">
              Jump to page
            </label>
            <input
              id="reader-page-jump"
              type="number"
              min={1}
              max={totalPages}
              value={pageInputValue}
              onChange={(e) => setPageInputValue(e.target.value)}
              onBlur={() => {
                const parsed = parseInt(pageInputValue, 10);
                if (!Number.isNaN(parsed)) {
                  jumpToPage(parsed);
                } else {
                  setPageInputValue(String(currentPage));
                }
              }}
              className="w-11 sm:w-12 text-center min-h-[36px] rounded-lg bg-white/10 border border-white/15 text-[#F5EFE5]"
            />
            <span className="text-[#A69684]">/ {totalPages}</span>
            <span className="hidden sm:inline text-[#C99E67] ml-1">({progressPct}%)</span>
          </form>

          {/* Compact mobile zoom controls */}
          <div className="flex sm:hidden items-center rounded-xl bg-white/8 border border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.15).toFixed(2)))}
              aria-label="Mobile zoom out"
              className="min-h-[38px] min-w-[34px] flex items-center justify-center hover:bg-white/10 rounded-l-xl"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)))}
              aria-label="Mobile zoom in"
              className="min-h-[38px] min-w-[34px] flex items-center justify-center hover:bg-white/10 rounded-r-xl"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
            className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-white/8 hover:bg-white/15 disabled:opacity-35 text-xs font-medium flex items-center gap-1 shrink-0"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};
