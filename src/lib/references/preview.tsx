import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { parseRefs, targetLabel } from "@/lib/references/parse";
import { buildIndex, lookup } from "@/lib/references/index-pdf";
import type { PdfDocument } from "@/lib/references/pdf";
import { CitationContext } from "@/lib/references/citation";
import {
  deleteDoc,
  fingerprintOf,
  getDoc,
  getIndex,
  listDocs,
  listOverrides,
  putDoc,
  putIndex,
  putOverride,
  deleteOverride,
  updateDoc,
} from "@/lib/references/store";
import type { BBox, CropOverride, DocIndex, DocKind, DocRecord, RefTarget } from "@/lib/references/types";

/** Local documents are optionally served from public/specs/ (gitignored). */
const LOCAL_DOCS: { url: string; name: string; kind: DocKind; dg?: number }[] = [
  { url: "/specs/aisc-360-22-specification.pdf", name: "AISC 360-22 Specification", kind: "spec" },
  { url: "/specs/aisc-dg11.pdf", name: "AISC Design Guide 11", kind: "dg", dg: 11 },
];

const DOC_NAMES: Record<string, string> = {
  spec: "AISC 360-22 Specification",
  commentary: "AISC 360-22 Commentary",
  manual: "AISC Steel Construction Manual",
  asce7: "ASCE/SEI 7-22",
};

function inferKind(name: string): { kind: DocKind; dg?: number } {
  const lower = name.toLowerCase();
  const dg = /(?:dg|design guide)\s*(\d{1,3})/.exec(lower);
  if (dg?.[1]) return { kind: "dg", dg: Number(dg[1]) };
  if (/asce/.test(lower)) return { kind: "asce7" };
  if (/manual/.test(lower)) return { kind: "manual" };
  if (/360|specification/.test(lower)) return { kind: "spec" };
  return { kind: "other" };
}

interface PreviewState {
  text: string;
  targets: RefTarget[];
  anchor: { left: number; top: number; bottom: number };
}

export interface ReferenceApi {
  docs: DocRecord[];
  indexes: Record<string, DocIndex>;
  progress?: { name: string; page: number; total: number };
  error?: string;
  ready: boolean;
  addFile: (file: File) => Promise<void>;
  remove: (fingerprint: string) => Promise<void>;
  open: (text: string, targets: RefTarget[], anchor: DOMRect) => void;
  overrides: CropOverride[];
  saveOverride: (override: CropOverride) => Promise<void>;
  clearOverride: (id: string) => Promise<void>;
  crop: (fingerprint: string, page: number, bbox: BBox, zoom?: number) => Promise<string>;
}

const Ctx = createContext<ReferenceApi | null>(null);

const documents = new Map<string, Promise<PdfDocument>>();
const pageCanvases = new Map<string, Promise<HTMLCanvasElement>>();

function pdfFor(fingerprint: string): Promise<PdfDocument> {
  const existing = documents.get(fingerprint);
  if (existing) return existing;
  const promise = getDoc(fingerprint).then(async (stored) => {
    if (!stored) throw new Error("The reference PDF is no longer stored. Add it again under References.");
    const { openPdf } = await import("./pdf");
    return openPdf(new Uint8Array(stored.bytes));
  });
  documents.set(fingerprint, promise);
  return promise;
}

function canvasFor(fingerprint: string, page: number): Promise<HTMLCanvasElement> {
  const key = `${fingerprint}:${page}`;
  const existing = pageCanvases.get(key);
  if (existing) return existing;
  const promise = pdfFor(fingerprint).then(async (pdf) => {
    const { renderPage } = await import("./pdf");
    return renderPage(pdf, page, 2.5);
  });
  pageCanvases.set(key, promise);
  if (pageCanvases.size > 6) {
    const first = pageCanvases.keys().next().value;
    if (first && first !== key) pageCanvases.delete(first);
  }
  return promise;
}

/** Crop a page region to a PNG data URL. Rendered page canvases are cached in memory. */
async function renderCrop(fingerprint: string, page: number, bbox: BBox, zoom = 1): Promise<string> {
  const full = await canvasFor(fingerprint, page);
  const scale = 2.5 * zoom;
  const width = Math.max(1, Math.round(bbox.w * scale));
  const height = Math.max(1, Math.round(bbox.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(width, 2400);
  canvas.height = Math.min(height, 2400);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    full,
    bbox.x * 2.5,
    bbox.y * 2.5,
    Math.max(1, bbox.w * 2.5),
    Math.max(1, bbox.h * 2.5),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/png");
}

function summary(index: DocIndex) {
  let equations = 0,
    tables = 0,
    sections = 0;
  for (const key of Object.keys(index.entries)) {
    if (key.includes(":equation:")) equations++;
    else if (key.includes(":table:")) tables++;
    else if (key.includes(":section:")) sections++;
  }
  return { equations, tables, sections, total: Object.keys(index.entries).length };
}

export { summary as indexSummary };

export function ReferenceProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [indexes, setIndexes] = useState<Record<string, DocIndex>>({});
  const [overrides, setOverrides] = useState<CropOverride[]>([]);
  const [progress, setProgress] = useState<{ name: string; page: number; total: number }>();
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<PreviewState>();
  const [ready, setReady] = useState(false);
  const started = useRef(false);

  const indexDocument = useCallback(async (record: DocRecord, bytes: Uint8Array) => {
    setProgress({ name: record.name, page: 0, total: 0 });
    try {
      const { openPdf, extractPages } = await import("./pdf");
      const pdf = await openPdf(bytes);
      const pages = await extractPages(pdf, (page, total) => setProgress({ name: record.name, page, total }));
      const index = buildIndex(pages, record.fingerprint, record.kind, record.dg);
      await putIndex(index);
      const updated: DocRecord = {
        ...record,
        pageCount: pages.length,
        entryCount: Object.keys(index.entries).length,
        indexedAt: Date.now(),
        indexVersion: 1,
      };
      await updateDoc(updated);
      setDocs((list) => list.map((d) => (d.fingerprint === updated.fingerprint ? updated : d)));
      setIndexes((map) => ({ ...map, [updated.fingerprint]: index }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`${record.name}: ${message}`);
      await updateDoc({ ...record, error: message }).catch(() => undefined);
      setDocs((list) => list.map((d) => (d.fingerprint === record.fingerprint ? { ...d, error: message } : d)));
    } finally {
      setProgress(undefined);
    }
  }, []);

  const addBytes = useCallback(
    async (bytes: Uint8Array, name: string, kind?: DocKind, dg?: number) => {
      const fingerprint = await fingerprintOf(bytes);
      const existing = docs.find((d) => d.fingerprint === fingerprint);
      if (existing) return;
      const inferred = kind ? { kind, dg } : inferKind(name);
      const record: DocRecord = {
        fingerprint,
        name,
        size: bytes.byteLength,
        addedAt: Date.now(),
        kind: inferred.kind,
        dg: inferred.dg,
        pageCount: 0,
        indexVersion: 1,
      };
      try {
        await putDoc(record, bytes.slice().buffer);
      } catch (e) {
        throw new Error(`Could not store the PDF (${e instanceof Error ? e.message : String(e)}). Browser storage may be full.`);
      }
      setDocs((list) => [...list, record]);
      await indexDocument(record, bytes);
    },
    [docs, indexDocument],
  );

  const addFile = useCallback(
    async (file: File) => {
      setError(undefined);
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new Error("Choose a PDF file.");
      await addBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    },
    [addBytes],
  );

  const remove = useCallback(async (fingerprint: string) => {
    await deleteDoc(fingerprint);
    documents.delete(fingerprint);
    for (const key of [...pageCanvases.keys()]) if (key.startsWith(`${fingerprint}:`)) pageCanvases.delete(key);
    setDocs((list) => list.filter((d) => d.fingerprint !== fingerprint));
    setIndexes((map) => {
      const next = { ...map };
      delete next[fingerprint];
      return next;
    });
    setOverrides((list) => list.filter((o) => o.fingerprint !== fingerprint));
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const [records, storedOverrides] = await Promise.all([listDocs(), listOverrides()]);
        setDocs(records);
        setOverrides(storedOverrides);
        const loaded: Record<string, DocIndex> = {};
        for (const record of records) {
          const index = await getIndex(record.fingerprint);
          if (index) loaded[record.fingerprint] = index;
        }
        setIndexes(loaded);
        setReady(true);
        // Auto-detect documents served from public/specs. Absent on a static deploy; the library handles upload.
        for (const local of LOCAL_DOCS) {
          if (records.some((r) => r.name === local.name)) continue;
          try {
            const response = await fetch(local.url, { method: "HEAD" });
            if (!response.ok) continue;
            if (!/pdf/i.test(response.headers.get("content-type") ?? "")) continue;
            const bytes = new Uint8Array(await (await fetch(local.url)).arrayBuffer());
            await addBytes(bytes, local.name, local.kind, local.dg);
          } catch {
            /* No local copy. */
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setReady(true);
      }
    })();
  }, [addBytes]);

  const open = useCallback((text: string, targets: RefTarget[], anchor: DOMRect) => {
    setPreview({ text, targets, anchor: { left: anchor.left, top: anchor.top, bottom: anchor.bottom } });
  }, []);

  const saveOverride = useCallback(async (override: CropOverride) => {
    await putOverride(override);
    setOverrides((list) => [...list.filter((o) => o.id !== override.id), override]);
  }, []);

  const clearOverride = useCallback(async (id: string) => {
    await deleteOverride(id);
    setOverrides((list) => list.filter((o) => o.id !== id));
  }, []);

  const api = useMemo<ReferenceApi>(
    () => ({ docs, indexes, progress, error, ready, addFile, remove, open, overrides, saveOverride, clearOverride, crop: renderCrop }),
    [docs, indexes, progress, error, ready, addFile, remove, open, overrides, saveOverride, clearOverride],
  );

  return (
    <CitationContext.Provider value={(text, element) => open(text, parseRefs(text).targets, element.getBoundingClientRect())}>
      <Ctx.Provider value={api}>
        {children}
        {preview && <ReferencePreview preview={preview} close={() => setPreview(undefined)} api={api} />}
      </Ctx.Provider>
    </CitationContext.Provider>
  );
}

export function useReference(): ReferenceApi {
  const value = useContext(Ctx);
  if (!value) throw new Error("useReference must be used inside ReferenceProvider");
  return value;
}

/** Safe for shared components rendered outside the provider (tests, stories). */
export function useReferenceOptional(): ReferenceApi | null {
  return useContext(Ctx);
}

function ReferencePreview({ preview, close, api }: { preview: PreviewState; close: () => void; api: ReferenceApi }) {
  const [tab, setTab] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState<string>();
  const [cropError, setCropError] = useState<string>();
  const panel = useRef<HTMLDivElement>(null);
  const target = preview.targets[tab];

  const located = useMemo(() => {
    if (!target) return undefined;
    for (const doc of api.docs) {
      const index = api.indexes[doc.fingerprint];
      if (!index) continue;
      const entry = lookup(index, target);
      if (entry) return { doc, entry };
    }
    return undefined;
  }, [api.docs, api.indexes, target]);

  const override = located
    ? api.overrides.find((o) => o.fingerprint === located.doc.fingerprint && o.key === located.entry.key)
    : undefined;
  const bbox = override?.bbox ?? located?.entry.bbox;

  useEffect(() => {
    setZoom(1);
    setCrop(undefined);
    setCropError(undefined);
  }, [tab, preview]);

  useEffect(() => {
    if (!located || !bbox) return;
    let live = true;
    api
      .crop(located.doc.fingerprint, located.entry.page, bbox, zoom)
      .then((url) => live && setCrop(url))
      .catch((e) => live && setCropError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [api, located, bbox, zoom]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    const outside = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", esc);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("keydown", esc);
      document.removeEventListener("mousedown", outside);
    };
  }, [close]);

  const width = Math.min(620, (typeof window === "undefined" ? 620 : window.innerWidth) - 20);
  const left = Math.max(10, Math.min(preview.anchor.left, (typeof window === "undefined" ? 1024 : window.innerWidth) - width - 10));
  const top = Math.max(10, Math.min(preview.anchor.bottom + 8, (typeof window === "undefined" ? 768 : window.innerHeight) - 320));

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={`Reference preview: ${preview.text}`}
      className="fixed z-[60] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      style={{ left, top, width }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[11px] text-muted">{preview.text}</div>
          {located && target && (
            <div className="mt-0.5 text-sm font-medium text-ink">
              {targetLabel(target)} · {located.doc.name} · p. {located.entry.page + 1}
            </div>
          )}
        </div>
        <button type="button" onClick={close} aria-label="Close reference preview" className="text-muted hover:text-ink">
          ✕
        </button>
      </div>

      {preview.targets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
          {preview.targets.map((t, i) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(i)}
              className={`whitespace-nowrap rounded px-2 py-0.5 font-mono text-[10.5px] ${
                i === tab ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {targetLabel(t)}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-[54vh] overflow-auto bg-white p-2">
        {!located || !bbox ? (
          <div className="p-6 text-sm text-muted">
            {api.docs.length === 0 ? (
              <>
                This citation can be previewed from the actual PDF.{" "}
                <Link to="/references" className="text-accent underline" onClick={close}>
                  Add the AISC Specification
                </Link>
                .
              </>
            ) : (
              <>
                Not located in the loaded documents.{" "}
                <Link to="/references" className="text-accent underline" onClick={close}>
                  Open the reference library
                </Link>
                .
              </>
            )}
          </div>
        ) : cropError ? (
          <div className="p-4 text-sm text-fail">{cropError}</div>
        ) : crop ? (
          <img src={crop} alt={`${target ? targetLabel(target) : preview.text} cropped from ${located.doc.name}`} className="mx-auto block max-w-full" />
        ) : (
          <div className="p-10 text-center text-xs text-muted">Rendering the page…</div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs">
        <div className="flex items-center gap-1">
          <button type="button" className="rounded border border-line px-2 py-0.5 text-muted hover:text-ink" onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}>
            −
          </button>
          <span className="w-10 text-center font-mono text-[10.5px] text-muted">{Math.round(zoom * 100)}%</span>
          <button type="button" className="rounded border border-line px-2 py-0.5 text-muted hover:text-ink" onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}>
            +
          </button>
          {located && override && <span className="ml-2 text-[10.5px] text-accent">adjusted crop</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-line px-2 py-0.5 text-muted hover:text-ink"
            onClick={() => void navigator.clipboard.writeText(preview.text)}
          >
            Copy citation
          </button>
          {located && (
            <Link
              to={`/references?doc=${located.doc.fingerprint}&page=${located.entry.page}&key=${encodeURIComponent(located.entry.key)}`}
              className="rounded bg-accent px-2 py-1 font-medium text-white"
              onClick={close}
            >
              Open in viewer
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Parse the chip's text and open the locator. Used by SpecRef. */
export function useCitationPreview() {
  const api = useReferenceOptional();
  return useCallback(
    (text: string, element: HTMLElement) => {
      if (!api) return;
      const { targets } = parseRefs(text);
      if (!targets.length) return;
      api.open(text, targets, element.getBoundingClientRect());
    },
    [api],
  );
}

export { DOC_NAMES };
