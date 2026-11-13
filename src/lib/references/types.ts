/**
 * Reference-preview model. A citation string ("Eq. G6-1", "Table B4.1b, Case 10") parses to one or more
 * RefTargets; an indexed PDF maps target keys to page regions. Geometry is in PDF points with a
 * top-left origin (pdf.js viewport at scale 1, rotation applied), so it maps 1:1 onto a rendered page.
 */

/** Which publication a target lives in. "spec" and "commentary" are both inside AISC 360-22 (and Manual Part 16.1). */
export type RefDoc = "spec" | "commentary" | "manual" | "asce7" | "dg";

export type RefKind = "equation" | "section" | "table" | "figure" | "part" | "chapter" | "appendix";

export interface RefTarget {
  doc: RefDoc;
  kind: RefKind;
  /** Normalized id as printed: "G6-1", "F2.2", "B4.1b", "3-23", "C-A-7.1", "F", "8" */
  id: string;
  /** Design Guide number when doc === "dg" */
  dg?: number;
  /** List-item suffix within a section, e.g. "(a)" or "(b)(2)" */
  sub?: string;
  /** Table case, e.g. "10" or "a" */
  case?: string;
  /** Canonical lookup key, see targetKey() */
  key: string;
  /** Human label, e.g. "Eq. G6-1", "§G2.1(a)", "Table B4.1b, Case 10" */
  label: string;
}

export interface ParsedRef {
  /** The original chip text */
  text: string;
  targets: RefTarget[];
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One located target in one document. */
export interface IndexEntry {
  key: string;
  /** 0-based page index */
  page: number;
  bbox: BBox;
  /** Optional second region: the "where" definitions following an equation */
  where?: { page: number; bbox: BBox };
  /** Pages the region continues onto (multi-page tables, long sections) */
  continued?: number[];
  /** Enclosing section/chapter at the anchor, e.g. "G6", used for the popover title */
  context?: string;
  /** Heading or caption text captured from the PDF, e.g. "MINOR-AXIS SHEAR" */
  title?: string;
  /** Detection confidence 0..1; competing hits keep the highest */
  score: number;
}

export type DocKind = "manual" | "spec" | "dg" | "asce7" | "other";

export interface PageInfo {
  w: number;
  h: number;
  /** Printed page label ("16.1-71", "3-211") or the 1-based page number as a string */
  label: string;
  /** Page belongs to the Commentary */
  commentary?: boolean;
}

export interface DocIndex {
  fingerprint: string;
  version: number;
  pages: PageInfo[];
  /** key → best hit */
  entries: Record<string, IndexEntry>;
}

/** Text lines per page, kept separately (large) for search and "best match" lookup. */
export interface PageLines {
  page: number;
  lines: { t: string; b: BBox }[];
}

export interface DocRecord {
  fingerprint: string;
  name: string;
  size: number;
  addedAt: number;
  kind: DocKind;
  /** Design Guide number when kind === "dg" */
  dg?: number;
  pageCount: number;
  indexVersion: number;
  indexedAt?: number;
  entryCount?: number;
  error?: string;
}

export interface CropOverride {
  /** `${fingerprint}|${targetKey}` */
  id: string;
  fingerprint: string;
  key: string;
  page: number;
  bbox: BBox;
  savedAt: number;
}
