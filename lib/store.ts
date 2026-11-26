// Data layer for the Vercel port of PULSE VIDEO.
//
// The Muse version stored two tables in Drizzle + SQLite (app.db):
//   - interactions: likes / saves / follows / watch-history rows
//   - admin_state:  a single JSON payload (site texts, SEO, admin videos,
//                    taxonomy changes) — everything the admin panel manages.
//
// On Vercel there is no bundled SQLite file, so the same two documents
// live as JSON blobs in a Vercel Blob store (private blobs, read/write
// via BLOB_READ_WRITE_TOKEN, which Vercel injects when the store is
// connected to the project). The public shape is unchanged: interactions
// are global (the live site has no per-viewer accounts — getState returns
// every row, newest first), and admin_state is one payload string.
//
// Concurrency: reads are read-modify-write with last-write-wins. That
// matches the traffic this site gets; a lost toggle under simultaneous
// writes is possible but harmless (the button just flips again).
//
// Local development (no Blob token, not on Vercel): the same two
// documents are kept as JSON files under .vercel-data/ (gitignored).

import { get, put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type InteractionKind = "like" | "save" | "follow" | "history";

export interface InteractionRow {
  id: number;
  kind: InteractionKind;
  itemKey: string;
  createdAt: number; // ms epoch
}

const INTERACTIONS_PATH = "data/interactions.json";
const ADMIN_STATE_PATH = "data/admin-state.json";

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || undefined;
}

function localDir(): string | null {
  // On Vercel (VERCEL=1) always use Blob. Locally without a token,
  // fall back to JSON files so the API can be tested without a store.
  if (process.env.VERCEL) return null;
  if (blobToken()) return null;
  return path.join(process.cwd(), ".vercel-data");
}

async function readJson<T>(blobPath: string, localFile: string, fallback: T): Promise<T> {
  const local = localDir();
  if (local) {
    try {
      const raw = await readFile(path.join(local, localFile), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      throw err;
    }
  }
  const token = blobToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set — connect a Blob store to the project.");
  // get() returns null when the blob does not exist yet (safe fallback).
  // Any other failure throws: a transient read error must never be
  // mistaken for "empty", or the next write would wipe the document.
  const result = await get(blobPath, { access: "private", token, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return fallback;
  const text = await new Response(result.stream).text();
  return JSON.parse(text) as T;
}

async function writeJson(blobPath: string, localFile: string, value: unknown): Promise<void> {
  const local = localDir();
  if (local) {
    await mkdir(local, { recursive: true });
    await writeFile(path.join(local, localFile), JSON.stringify(value), "utf8");
    return;
  }
  const token = blobToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set — connect a Blob store to the project.");
  await put(blobPath, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token,
  });
}

function sortRows(rows: InteractionRow[]): InteractionRow[] {
  return [...rows].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
}

export async function listInteractions(): Promise<InteractionRow[]> {
  const rows = await readJson<InteractionRow[]>(INTERACTIONS_PATH, "interactions.json", []);
  return sortRows(rows);
}

// Monotonic row ids: strictly increasing within this process, and
// dominated by wall-clock ms across processes — so sorting by id desc
// is insertion order, exactly like SQLite AUTOINCREMENT in the Muse
// version. (A random suffix would break same-millisecond ordering.)
let lastId = 0;
function nextId(): number {
  const now = Date.now() * 1000;
  lastId = Math.max(lastId + 1, now);
  return lastId;
}

export async function toggleInteraction(kind: InteractionKind, itemKey: string): Promise<boolean> {
  const rows = await listInteractions();
  const idx = rows.findIndex((r) => r.kind === kind && r.itemKey === itemKey);
  if (idx >= 0) {
    rows.splice(idx, 1);
    await writeJson(INTERACTIONS_PATH, "interactions.json", rows);
    return false;
  }
  const now = Date.now();
  rows.unshift({ id: nextId(), kind, itemKey, createdAt: now });
  await writeJson(INTERACTIONS_PATH, "interactions.json", rows);
  return true;
}

export async function recordHistory(itemKey: string): Promise<void> {
  const rows = await listInteractions();
  const kept = rows.filter((r) => !(r.kind === "history" && r.itemKey === itemKey));
  const now = Date.now();
  kept.unshift({ id: nextId(), kind: "history", itemKey, createdAt: now });
  await writeJson(INTERACTIONS_PATH, "interactions.json", kept);
}

export async function clearHistory(): Promise<void> {
  const rows = await listInteractions();
  await writeJson(
    INTERACTIONS_PATH,
    "interactions.json",
    rows.filter((r) => r.kind !== "history"),
  );
}

export async function getAdminPayload(): Promise<string | null> {
  const doc = await readJson<{ payload: string } | null>(ADMIN_STATE_PATH, "admin-state.json", null);
  return doc ? doc.payload : null;
}

export async function saveAdminPayload(payload: string): Promise<void> {
  await writeJson(ADMIN_STATE_PATH, "admin-state.json", { payload });
}

export async function resetAdminPayload(): Promise<void> {
  const local = localDir();
  if (local) {
    const { rm } = await import("node:fs/promises");
    await rm(path.join(local, "admin-state.json"), { force: true });
    return;
  }
  const token = blobToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set — connect a Blob store to the project.");
  // No delete-by-pathname in @vercel/blob's small surface used here;
  // writing an explicit empty document is equivalent to "no saved state".
  await put(ADMIN_STATE_PATH, JSON.stringify(null), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token,
  });
}
