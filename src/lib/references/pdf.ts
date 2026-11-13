/**
 * PDF text extraction and rendering. Geometry is stored in PDF points with a top-left origin
 * (viewport at scale 1), matching `BBox` in ./types.
 */
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { groupItems, type PageText, type RawItem } from "./text";

export type { PageText, TextLine } from "./text";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

/** Copy the bytes: pdf.js transfers the buffer to its worker and detaches it. */
export async function openPdf(bytes: Uint8Array): Promise<PdfDocument> {
  return pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: false }).promise;
}

export async function extractPage(doc: PdfDocument, index: number): Promise<PageText> {
  const page = await doc.getPage(index + 1);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: RawItem[] = [];
  for (const raw of content.items) {
    if (!("str" in raw) || !raw.str.trim()) continue;
    const m = pdfjs.Util.transform(viewport.transform, raw.transform);
    items.push({ str: raw.str, x: m[4] ?? 0, y: m[5] ?? 0, w: raw.width, h: Math.max(raw.height, 1) });
  }
  return { page: index, width: viewport.width, height: viewport.height, lines: groupItems(items) };
}

/** Extract one page at a time, yielding to the event loop so indexing never freezes the UI. */
export async function extractPages(
  doc: PdfDocument,
  onProgress?: (page: number, total: number) => void,
  signal?: { cancelled: boolean },
): Promise<PageText[]> {
  const total = doc.numPages;
  const out: PageText[] = [];
  for (let i = 0; i < total; i++) {
    if (signal?.cancelled) throw new Error("Indexing cancelled");
    out.push(await extractPage(doc, i));
    onProgress?.(i + 1, total);
    if (i % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return out;
}

/** Render a full page to a canvas at `scale` device pixels per PDF point. */
export async function renderPage(doc: PdfDocument, pageIndex: number, scale = 2): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return canvas;
}
