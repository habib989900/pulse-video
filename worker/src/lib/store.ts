// Data layer for the Cloudflare port of PULSE VIDEO.
//
// Same two documents as the Vercel port (interactions + admin_state),
// plus the per-origin sitemap cache — but stored in Cloudflare KV
// (namespace `pulse-video-data`, binding PV_DATA) instead of a Vercel
// Blob store. Keys are the same paths the Blob store used, so a
// migration is a straight copy. There is no local-filesystem fallback:
// Workers have no fs, and wrangler dev can bind a local KV.
//
// KV is eventually consistent: a write can take up to ~60 s to be
// visible on every edge. The admin panel refetches after a save, and
// the sitemap cache is best-effort, so this is acceptable here.
//
// Concurrency is the same read-modify-write last-write-wins as the
// Vercel port.

import { getEnv } from "./env.js";

export type InteractionKind = "like" | "save" | "follow" | "history";

export interface InteractionRow {
  id: number;
  kind: InteractionKind;
  itemKey: string;
  createdAt: number; // ms epoch
}

const INTERACTIONS_PATH = "data/interactions.json";
const ADMIN_STATE_PATH = "data/admin-state.json";
const SITEMAP_CACHE_PATH = "data/sitemap-cache.json";

export interface SitemapCacheEntry {
  xml: string;
  builtAt: number; // ms epoch
}

export interface SitemapCacheDoc {
  entries: Record<string, SitemapCacheEntry>;
}

export async function getSitemapCache(origin: string): Promise<SitemapCacheEntry | null> {
  const doc = await readJson<SitemapCacheDoc | null>(SITEMAP_CACHE_PATH, null);
  return doc?.entries?.[origin] ?? null;
}

export async function saveSitemapCache(origin: string, xml: string): Promise<void> {
  const doc = (await readJson<SitemapCacheDoc | null>(SITEMAP_CACHE_PATH, null)) ?? { entries: {} };
  doc.entries[origin] = { xml, builtAt: Date.now() };
  await writeJson(SITEMAP_CACHE_PATH, doc);
}

export async function invalidateSitemapCache(): Promise<void> {
  await writeJson(SITEMAP_CACHE_PATH, { entries: {} });
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  // KV get("json") returns null when the key does not exist yet (safe
  // fallback). Any other failure throws: a transient read error must
  // never be mistaken for "empty", or the next write would wipe the
  // document.
  const val = await getEnv().PV_DATA.get(key, "json");
  if (val === null || val === undefined) return fallback;
  return val as T;
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await getEnv().PV_DATA.put(key, JSON.stringify(value));
}

function sortRows(rows: InteractionRow[]): InteractionRow[] {
  return [...rows].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
}

export async function listInteractions(): Promise<InteractionRow[]> {
  const rows = await readJson<InteractionRow[]>(INTERACTIONS_PATH, []);
  const valid = rows.filter(
    (r): r is InteractionRow =>
      !!r && typeof r === "object" &&
      (r.kind === "like" || r.kind === "save" || r.kind === "follow" || r.kind === "history") &&
      typeof r.itemKey === "string" && r.itemKey.length > 0 &&
      Number.isFinite(r.id) && Number.isFinite(r.createdAt),
  );
  if (valid.length !== rows.length) {
    console.warn(`[store] dropped ${rows.length - valid.length} malformed interaction row(s)`);
  }
  return sortRows(valid);
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
    await writeJson(INTERACTIONS_PATH, rows);
    return false;
  }
  const now = Date.now();
  rows.unshift({ id: nextId(), kind, itemKey, createdAt: now });
  await writeJson(INTERACTIONS_PATH, rows);
  return true;
}

export async function recordHistory(itemKey: string): Promise<void> {
  const rows = await listInteractions();
  const kept = rows.filter((r) => !(r.kind === "history" && r.itemKey === itemKey));
  const now = Date.now();
  kept.unshift({ id: nextId(), kind: "history", itemKey, createdAt: now });
  const history = kept.filter((r) => r.kind === "history").slice(0, 200);
  const rest = kept.filter((r) => r.kind !== "history");
  await writeJson(INTERACTIONS_PATH, sortRows([...history, ...rest]));
}

export async function clearHistory(): Promise<void> {
  const rows = await listInteractions();
  await writeJson(
    INTERACTIONS_PATH,
    rows.filter((r) => r.kind !== "history"),
  );
}

/** Overwrites the whole interactions document (used by the one-time
    migrateFromVercel action, which rebuilds rows from the live
    Vercel getState arrays). */
export async function replaceInteractions(rows: InteractionRow[]): Promise<void> {
  await writeJson(INTERACTIONS_PATH, sortRows(rows));
}

export async function getAdminPayload(): Promise<string | null> {
  const doc = await readJson<{ payload: string } | null>(ADMIN_STATE_PATH, null);
  return doc ? doc.payload : null;
}

export async function saveAdminPayload(payload: string): Promise<void> {
  await writeJson(ADMIN_STATE_PATH, { payload });
}

export async function resetAdminPayload(): Promise<void> {
  await getEnv().PV_DATA.delete(ADMIN_STATE_PATH);
}
