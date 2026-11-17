import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

const loadingTasks = new WeakMap<PDFDocumentProxy, PDFDocumentLoadingTask>();

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export type PdfLoadErrorCode = 'PASSWORD_REQUIRED' | 'INCORRECT_PASSWORD' | 'INVALID_PDF';

export class PdfLoadError extends Error {
  code: PdfLoadErrorCode;
  constructor(code: PdfLoadErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface InspectedPdfMetadata {
  title: string;
  author: string;
  totalPages: number;
  coverDataUrl: string;
}

function classifyPdfError(err: unknown): PdfLoadError {
  const anyErr = err as { name?: string; code?: number; message?: string };
  if (anyErr?.name === 'PasswordException') {
    if (anyErr.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
      return new PdfLoadError('INCORRECT_PASSWORD', 'The password entered for this PDF is incorrect.');
    }
    return new PdfLoadError('PASSWORD_REQUIRED', 'This PDF is password-protected. Enter the password to continue.');
  }
  return new PdfLoadError(
    'INVALID_PDF',
    anyErr?.message || 'Unable to read this PDF file. It may be corrupted or unsupported.'
  );
}

export async function openPdfDocument(blob: Blob, password?: string): Promise<PDFDocumentProxy> {
  const buffer = await blob.arrayBuffer();
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    password: password || undefined,
  });

  try {
    const doc = await loadingTask.promise;
    loadingTasks.set(doc, loadingTask);
    return doc;
  } catch (err) {
    await loadingTask.destroy().catch(() => undefined);
    throw classifyPdfError(err);
  }
}

export async function closePdfDocument(pdfDoc: PDFDocumentProxy): Promise<void> {
  const task = loadingTasks.get(pdfDoc);
  try {
    await pdfDoc.cleanup();
  } catch {
    // ignore cleanup errors
  }
  if (task) {
    loadingTasks.delete(pdfDoc);
    await task.destroy().catch(() => undefined);
  }
}

export async function renderPageCoverDataUrl(
  pdfDoc: PDFDocumentProxy,
  maxWidth = 380
): Promise<string> {
  const page = await pdfDoc.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.max(0.4, maxWidth / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    page.cleanup();
    return '';
  }

  ctx.fillStyle = '#FCF9F2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
    canvas,
  }).promise;

  page.cleanup();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function inspectPdfBlob(
  blob: Blob,
  fallbackFileName: string,
  password?: string
): Promise<InspectedPdfMetadata> {
  const pdfDoc = await openPdfDocument(blob, password);
  try {
    const totalPages = pdfDoc.numPages;
    let rawTitle = '';
    let rawAuthor = '';

    try {
      const meta = await pdfDoc.getMetadata();
      const info = (meta?.info ?? {}) as Record<string, unknown>;
      if (typeof info.Title === 'string') rawTitle = info.Title.trim();
      if (typeof info.Author === 'string') rawAuthor = info.Author.trim();
    } catch {
      // Metadata dictionary is optional in PDFs
    }

    const cleanFileTitle = fallbackFileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    const title = rawTitle || cleanFileTitle || 'Untitled Volume';
    const author = rawAuthor || 'Unknown Author';
    const coverDataUrl = await renderPageCoverDataUrl(pdfDoc, 380);

    return {
      title,
      author,
      totalPages,
      coverDataUrl,
    };
  } finally {
    await closePdfDocument(pdfDoc);
  }
}

export async function getPdfPageAspectRatio(pdfDoc: PDFDocumentProxy, pageNumber = 1): Promise<number> {
  const safePage = Math.max(1, Math.min(pageNumber, pdfDoc.numPages));
  const page = await pdfDoc.getPage(safePage);
  const vp = page.getViewport({ scale: 1 });
  page.cleanup();
  if (vp.height <= 0) return 0.707;
  return vp.width / vp.height;
}

export function renderPdfPageToCanvas(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  targetCssWidth: number,
  targetCssHeight: number,
  onDone?: (success: boolean) => void
): () => void {
  let cancelled = false;
  let renderTask: RenderTask | null = null;

  (async () => {
    try {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) {
        page.cleanup();
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2.25);
      const baseViewport = page.getViewport({ scale: 1 });

      // Fit page cleanly inside targetCssWidth x targetCssHeight while preserving proportions
      const fitScale = Math.min(
        targetCssWidth / Math.max(1, baseViewport.width),
        targetCssHeight / Math.max(1, baseViewport.height)
      );
      const renderViewport = page.getViewport({ scale: fitScale * dpr });

      const pixelW = Math.max(1, Math.floor(renderViewport.width));
      const pixelH = Math.max(1, Math.floor(renderViewport.height));

      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        page.cleanup();
        onDone?.(false);
        return;
      }

      ctx.fillStyle = '#FCF9F2';
      ctx.fillRect(0, 0, pixelW, pixelH);

      renderTask = page.render({
        canvasContext: ctx,
        viewport: renderViewport,
        canvas,
      });

      await renderTask.promise;
      page.cleanup();
      onDone?.(!cancelled);
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name !== 'RenderingCancelledException') {
        onDone?.(false);
      } else {
        onDone?.(false);
      }
    }
  })();

  return () => {
    cancelled = true;
    if (renderTask) {
      try {
        renderTask.cancel();
      } catch {
        // ignore cancellation errors
      }
    }
    onDone?.(false);
  };
}
