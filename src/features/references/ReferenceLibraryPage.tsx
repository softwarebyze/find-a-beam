import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Badge, Button, Card, EmptyState, PageHeader, SpecRef, Stat, table } from "@/components/ui";
import { indexSummary, useReference } from "@/lib/references/preview";
import type { BBox, DocIndex, DocRecord, IndexEntry } from "@/lib/references/types";

function DocMeta({ record, index }: { record: DocRecord; index?: DocIndex }) {
  const stats = index ? indexSummary(index) : undefined;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="num">{record.pageCount || "—"} pages</span>
      <span className="num">{stats?.total ?? record.entryCount ?? 0} located citations</span>
      {stats && (
        <span className="num">
          {stats.equations} eq · {stats.tables} tables · {stats.sections} §
        </span>
      )}
      {record.indexedAt ? <Badge tone="pass">indexed</Badge> : record.error ? <Badge tone="fail">error</Badge> : <Badge tone="warn">indexing</Badge>}
    </div>
  );
}

function Library({
  onPick,
  selected,
}: {
  onPick: (fingerprint: string, key: string) => void;
  selected?: { fingerprint: string; key?: string };
}) {
  const api = useReference();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const file = e.dataTransfer.files[0];
          if (file) void api.addFile(file).catch((err) => alert(err instanceof Error ? err.message : String(err)));
        }}
        className={`rounded-xl border border-dashed p-4 text-center transition ${drag ? "border-accent bg-accent-soft" : "border-line-strong bg-surface"}`}
      >
        <p className="text-sm text-ink">Add a design reference PDF</p>
        <p className="mt-1 text-xs text-muted">
          AISC 360-22, the Steel Construction Manual, or a Design Guide. The file stays in this browser; nothing is uploaded.
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button onClick={() => input.current?.click()}>Choose PDF</Button>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void api.addFile(file).catch((err) => alert(err instanceof Error ? err.message : String(err)));
              e.target.value = "";
            }}
          />
        </div>
        <p className="mt-2 text-[10.5px] text-faint">
          For local development, place files at <span className="font-mono">public/specs/aisc-360-22-specification.pdf</span> and{" "}
          <span className="font-mono">public/specs/aisc-dg11.pdf</span>; they load automatically.
        </p>
      </div>

      {api.progress && (
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="flex justify-between text-xs">
            <span className="text-ink">Indexing {api.progress.name}</span>
            <span className="num text-muted">
              {api.progress.page} / {api.progress.total || "…"}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${api.progress.total ? (api.progress.page / api.progress.total) * 100 : 8}%` }}
            />
          </div>
        </div>
      )}

      {api.error && <p className="rounded-lg border border-line bg-fail-soft p-3 text-sm text-fail">{api.error}</p>}

      {api.docs.length === 0 ? (
        <EmptyState title="No reference documents yet">
          Add the AISC 360-22 PDF to turn every citation chip in the app into a cropped page preview.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {api.docs.map((record) => {
            const index = api.indexes[record.fingerprint];
            const active = selected?.fingerprint === record.fingerprint;
            return (
              <div
                key={record.fingerprint}
                className={`rounded-lg border p-3 ${active ? "border-accent bg-accent-soft/30" : "border-line bg-surface"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" className="text-left" onClick={() => onPick(record.fingerprint, "")}>
                    <div className="text-sm font-medium text-ink">{record.name}</div>
                    <DocMeta record={record} index={index} />
                  </button>
                  <Button onClick={() => void api.remove(record.fingerprint)} aria-label={`Remove ${record.name}`}>
                    Remove
                  </Button>
                </div>
                {record.error && <p className="mt-2 text-xs text-fail">{record.error}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PageView({
  record,
  index,
  page,
  entry,
  onPage,
}: {
  record: DocRecord;
  index?: DocIndex;
  page: number;
  entry?: IndexEntry;
  onPage: (page: number) => void;
}) {
  const api = useReference();
  const [image, setImage] = useState<string>();
  const [error, setError] = useState<string>();
  const info = index?.pages[page];
  const [zoom, setZoom] = useState(1);
  const [local, setLocal] = useState<BBox | undefined>();
  const override = entry ? api.overrides.find((o) => o.fingerprint === record.fingerprint && o.key === entry.key) : undefined;

  useEffect(() => setLocal(undefined), [entry?.key, page]);

  useEffect(() => {
    if (!info) return;
    let live = true;
    setImage(undefined);
    setError(undefined);
    api
      .crop(record.fingerprint, page, { x: 0, y: 0, w: info.w, h: info.h }, zoom)
      .then((url) => live && setImage(url))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [api, record.fingerprint, page, info, zoom]);

  const bbox = local ?? override?.bbox ?? entry?.bbox;

  const nudge = (dx: number, dy: number, dw: number, dh: number) => {
    if (!bbox) return;
    setLocal({
      x: Math.max(0, bbox.x + dx),
      y: Math.max(0, bbox.y + dy),
      w: Math.max(8, bbox.w + dw),
      h: Math.max(8, bbox.h + dh),
    });
  };

  if (!info) return <EmptyState title="Page not indexed">Pick a document to view its pages.</EmptyState>;

  return (
    <Card
      title={`${record.name} · page ${page + 1}`}
      subtitle={<span className="font-mono text-[10.5px]">printed label {info.label}</span>}
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={() => onPage(Math.max(0, page - 1))} disabled={page <= 0}>
            Prev
          </Button>
          <Button onClick={() => onPage(Math.min((index?.pages.length ?? 1) - 1, page + 1))} disabled={page >= (index?.pages.length ?? 1) - 1}>
            Next
          </Button>
        </div>
      }
    >
      {error && <p className="mb-3 rounded border border-line bg-fail-soft p-2 text-xs text-fail">{error}</p>}
      <div className="relative overflow-auto rounded border border-line bg-white">
        {image ? (
          <div className="relative mx-auto" style={{ width: `${Math.min(100, 100 * (zoom > 1 ? 1 : 1))}%` }}>
            <img src={image} alt={`${record.name} page ${page + 1}`} className="block w-full" />
            {bbox && (
              <div
                className="pointer-events-none absolute border-2 border-accent bg-accent/15"
                style={{
                  left: `${(bbox.x / info.w) * 100}%`,
                  top: `${(bbox.y / info.h) * 100}%`,
                  width: `${(bbox.w / info.w) * 100}%`,
                  height: `${(bbox.h / info.h) * 100}%`,
                }}
              />
            )}
          </div>
        ) : (
          <div className="p-16 text-center text-xs text-muted">Rendering page…</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Button onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}>−</Button>
        <span className="num w-12 text-center text-muted">{Math.round(zoom * 100)}%</span>
        <Button onClick={() => setZoom((z) => Math.min(2, z + 0.25))}>+</Button>
        {entry && (
          <>
            <span className="ml-2 font-mono text-[10.5px] text-muted">{entry.key}</span>
            <span className="text-faint">nudge crop</span>
            <div className="flex gap-1">
              <Button onClick={() => nudge(-4, 0, 0, 0)} aria-label="Move crop left">
                ←
              </Button>
              <Button onClick={() => nudge(4, 0, 0, 0)} aria-label="Move crop right">
                →
              </Button>
              <Button onClick={() => nudge(0, -4, 0, 0)} aria-label="Move crop up">
                ↑
              </Button>
              <Button onClick={() => nudge(0, 4, 0, 0)} aria-label="Move crop down">
                ↓
              </Button>
              <Button onClick={() => nudge(0, 0, -4, 0)} aria-label="Narrow crop">
                −w
              </Button>
              <Button onClick={() => nudge(0, 0, 4, 0)} aria-label="Widen crop">
                +w
              </Button>
              <Button onClick={() => nudge(0, 0, 0, -4)} aria-label="Shorten crop">
                −h
              </Button>
              <Button onClick={() => nudge(0, 0, 0, 4)} aria-label="Heighten crop">
                +h
              </Button>
            </div>
            <Button
              variant="primary"
              disabled={!local}
              onClick={() => {
                if (!local || !entry) return;
                void api.saveOverride({
                  id: `${record.fingerprint}|${entry.key}`,
                  fingerprint: record.fingerprint,
                  key: entry.key,
                  page,
                  bbox: local,
                  savedAt: Date.now(),
                });
                setLocal(undefined);
              }}
            >
              Save crop
            </Button>
            {override && (
              <Button
                onClick={() => {
                  void api.clearOverride(override.id);
                  setLocal(undefined);
                }}
              >
                Reset
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export function ReferenceLibraryPage() {
  const api = useReference();
  const [params, setParams] = useSearchParams();
  const docParam = params.get("doc") ?? "";
  const record = api.docs.find((d) => d.fingerprint === docParam) ?? api.docs[0];
  const index = record ? api.indexes[record.fingerprint] : undefined;
  const pageParam = Number(params.get("page") ?? 0);
  const key = params.get("key") ?? undefined;
  const entry = key && index ? index.entries[key] : undefined;
  const page = Number.isFinite(pageParam) && pageParam >= 0 ? Math.floor(pageParam) : (entry?.page ?? 0);
  const [search, setSearch] = useState("");

  const entries = useMemo(() => {
    if (!index) return [];
    const term = search.trim().toLowerCase();
    return Object.values(index.entries)
      .filter((e) => !term || e.key.toLowerCase().includes(term) || e.title?.toLowerCase().includes(term))
      .sort((a, b) => a.page - b.page || a.key.localeCompare(b.key))
      .slice(0, 150);
  }, [index, search]);

  const totals = useMemo(() => {
    const stats = { equations: 0, tables: 0, sections: 0, total: 0 };
    for (const d of api.docs) {
      const idx = api.indexes[d.fingerprint];
      if (!idx) continue;
      const s = indexSummary(idx);
      stats.equations += s.equations;
      stats.tables += s.tables;
      stats.sections += s.sections;
      stats.total += s.total;
    }
    return stats;
  }, [api.docs, api.indexes]);

  const pick = (fingerprint: string, nextKey: string) => {
    const next = new URLSearchParams(params);
    next.set("doc", fingerprint);
    if (nextKey) {
      next.set("key", nextKey);
      const target = api.indexes[fingerprint]?.entries[nextKey];
      next.set("page", String(target?.page ?? 0));
    } else {
      next.delete("key");
      next.delete("page");
    }
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Reference"
        title="Manual references"
        description="Load the actual AISC PDFs and preview the cited equation, table or section in place. Files and indexes stay in this browser."
        actions={
          <Link to="/reference" className="text-xs text-accent underline">
            Materials & factors
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Documents" value={api.docs.length} sub="Stored locally" />
        <Stat label="Citations located" value={totals.total} sub="Equations, tables, figures, sections" />
        <Stat label="Equations" value={totals.equations} sub="Numbered, indexed" />
        <Stat label="Tables & sections" value={totals.tables + totals.sections} sub={`${totals.tables} tables · ${totals.sections} sections`} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Library selected={record ? { fingerprint: record.fingerprint, key } : undefined} onPick={pick} />

          {index && record && (
            <Card title="Citation index" subtitle={`${Object.keys(index.entries).length} entries`}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search G6-1, Table B4.1b, J3.11…"
                className="mb-2 h-8 w-full rounded-md border border-line-strong bg-surface px-2 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-faint focus:border-accent"
              />
              <div className="max-h-[26rem] overflow-y-auto rounded border border-line">
                <table className={table.table}>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.key} className={`${table.tr} cursor-pointer ${e.key === key ? "bg-accent-soft" : ""}`} onClick={() => pick(record.fingerprint, e.key)}>
                        <td className={`${table.td} whitespace-normal`}>
                          <div className="font-mono text-[10.5px] text-ink">{e.key.split(":").slice(1).join(" ")}</div>
                          <div className="truncate text-[11px] text-muted">{e.title ?? "—"}</div>
                        </td>
                        <td className={`${table.td} whitespace-nowrap text-right text-[11px] text-muted`}>p. {e.page + 1}</td>
                      </tr>
                    ))}
                    {entries.length === 0 && (
                      <tr>
                        <td className={`${table.td} text-xs text-muted`}>No matching entries.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {record && index ? (
            <PageView
              record={record}
              index={index}
              page={page}
              entry={entry}
              onPage={(next) => {
                const p = new URLSearchParams(params);
                p.set("doc", record.fingerprint);
                p.set("page", String(next));
                if (entry && next !== entry.page) p.delete("key");
                setParams(p, { replace: true });
              }}
            />
          ) : (
            <Card title="How previews work">
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
                <li>Add the AISC 360-22 PDF once. It is fingerprinted, indexed locally, and cached in IndexedDB.</li>
                <li>Every citation chip in the app becomes a button. Clicking it crops the exact equation, table or section.</li>
                <li>If a crop is slightly loose, open it here, nudge the box, and save the override. The chip uses it immediately.</li>
              </ol>
              <p className="mt-3 text-xs text-muted">
                Indexing reads text layer geometry; a scanned PDF without a text layer cannot be located automatically. The 360-22
                Specification and Design Guide 11 are distributed by AISC. <SpecRef>Part 16</SpecRef>
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
