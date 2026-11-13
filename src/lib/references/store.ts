/**
 * Local persistence for reference documents. Nothing leaves the browser: the PDF bytes,
 * their citation index and any crop overrides live in IndexedDB.
 */
import type { CropOverride, DocIndex, DocRecord } from "./types";

const DB_NAME = "fab-references";
const DB_VERSION = 1;
const DOCS = "docs";
const INDEXES = "indexes";
const OVERRIDES = "overrides";

interface StoredDoc {
  fingerprint: string;
  record: DocRecord;
  bytes: ArrayBuffer;
}

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: "fingerprint" });
      if (!db.objectStoreNames.contains(INDEXES)) db.createObjectStore(INDEXES, { keyPath: "fingerprint" });
      if (!db.objectStoreNames.contains(OVERRIDES)) db.createObjectStore(OVERRIDES, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the reference database"));
  });
  return opening;
}

function tx<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = work(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Reference database request failed"));
      }),
  );
}

const all = <T>(store: string): Promise<T[]> =>
  new Promise((resolve, reject) => {
    open().then(
      (db) => {
        const request = db.transaction(store, "readonly").objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      },
      reject,
    );
  });

export const listDocs = () => all<StoredDoc>(DOCS).then((rows) => rows.map((r) => r.record));

export async function getDoc(fingerprint: string): Promise<StoredDoc | undefined> {
  return (await tx<StoredDoc | undefined>(DOCS, "readonly", (s) => s.get(fingerprint) as IDBRequest<StoredDoc | undefined>)) ?? undefined;
}

export function putDoc(record: DocRecord, bytes: ArrayBuffer): Promise<IDBValidKey> {
  const value: StoredDoc = { fingerprint: record.fingerprint, record, bytes };
  return tx(DOCS, "readwrite", (s) => s.put(value));
}

export function updateDoc(record: DocRecord): Promise<IDBValidKey> {
  return getDoc(record.fingerprint).then((stored) => {
    if (!stored) throw new Error("Document not found");
    return tx(DOCS, "readwrite", (s) => s.put({ ...stored, record }));
  });
}

export async function deleteDoc(fingerprint: string): Promise<void> {
  await tx(DOCS, "readwrite", (s) => s.delete(fingerprint));
  await tx(INDEXES, "readwrite", (s) => s.delete(fingerprint));
  const overrides = await all<CropOverride>(OVERRIDES);
  await Promise.all(overrides.filter((o) => o.fingerprint === fingerprint).map((o) => tx(OVERRIDES, "readwrite", (s) => s.delete(o.id))));
}

export async function getIndex(fingerprint: string): Promise<DocIndex | undefined> {
  return (await tx<DocIndex | undefined>(INDEXES, "readonly", (s) => s.get(fingerprint) as IDBRequest<DocIndex | undefined>)) ?? undefined;
}

export function putIndex(index: DocIndex): Promise<IDBValidKey> {
  return tx(INDEXES, "readwrite", (s) => s.put(index));
}

export const listOverrides = () => all<CropOverride>(OVERRIDES);

export function putOverride(override: CropOverride): Promise<IDBValidKey> {
  return tx(OVERRIDES, "readwrite", (s) => s.put(override));
}

export function deleteOverride(id: string): Promise<undefined> {
  return tx<undefined>(OVERRIDES, "readwrite", (s) => s.delete(id));
}

/** Content fingerprint. Falls back to size+time when SubtleCrypto is unavailable (plain http). */
export async function fingerprintOf(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  return `len${bytes.byteLength}-${Date.now().toString(36)}`;
}
