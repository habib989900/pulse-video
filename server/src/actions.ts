import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

const kindEnum = z.enum(["like", "save", "follow", "history"]);

/* Admin authorization. The admin code and the token-signing secret
   live ONLY here, in server code — the client bundle never contains
   either (the client imports action types only, never this module's
   values). Typing the code into the site's search box calls
   verifyAdminCode; on a match the server issues a short-lived
   HMAC-signed token, and the state-changing admin actions
   (saveAdminState / resetAdminState) refuse to run without a valid
   one, so knowing the panel's route alone grants nothing.
   getAdminState stays readable without a token on purpose: its
   payload is exactly the content the public site itself renders
   (site texts, catalog, SEO), so reading it exposes nothing the
   homepage does not already show. */
const ADMIN_CODE = process.env.ADMIN_CODE ?? ""; // set ADMIN_CODE in your .env — see .env.example
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET ?? ""; // set ADMIN_TOKEN_SECRET in your .env — see .env.example
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signAdminPayload(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(ADMIN_TOKEN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

async function issueAdminToken(): Promise<string> {
  const exp = Date.now() + ADMIN_TOKEN_TTL_MS;
  return `${exp}.${await signAdminPayload(`admin:${exp}`)}`;
}

async function isValidAdminToken(token: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  const expected = await signAdminPayload(`admin:${exp}`);
  const given = token.slice(dot + 1);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function requireAdmin(token: string): Promise<void> {
  if (!(await isValidAdminToken(token))) {
    throw new Error("Admin session missing or expired — type the admin code in the site search box to open the panel again, then retry.");
  }
}

/* resolveEmbedFile result: fileUrl is the stream the player starts with
   (the embed's fast alt encode when one exists), hdFileUrl the
   full-quality original when a separate fast stream exists, and
   fastLabel the alt stream's own quality label (e.g. "480p"). `streams`
   lists EVERY stream the source offers for the video — each with its
   own label and an `hls` flag for playlist streams — lowest first; the
   player's quality menu shows exactly that list, no invented options. */
const embedFileResponse = z.object({
  fileUrl: z.string().nullable(),
  hdFileUrl: z.string().nullable(),
  fastLabel: z.string().nullable(),
  streams: z.array(z.object({ url: z.string(), label: z.string(), hls: z.boolean() })),
});

export const Actions = {
  getState: defineAction({
    description: "Returns the viewer's liked, saved, followed and history item keys.",
    request: z.object({}),
    response: z.object({
      likes: z.array(z.string()),
      saves: z.array(z.string()),
      follows: z.array(z.string()),
      history: z.array(z.string()),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.interactions)
        .orderBy(desc(schema.interactions.id));
      return {
        likes: rows.filter((r) => r.kind === "like").map((r) => r.itemKey),
        saves: rows.filter((r) => r.kind === "save").map((r) => r.itemKey),
        follows: rows.filter((r) => r.kind === "follow").map((r) => r.itemKey),
        history: rows.filter((r) => r.kind === "history").map((r) => r.itemKey),
      };
    },
  }),

  toggleInteraction: defineAction({
    description: "Toggles a like, save or follow for an item and returns whether it is now on.",
    request: z.object({ kind: kindEnum, itemKey: z.string().min(1).max(120) }),
    response: z.object({ active: z.boolean() }),
    async handler(ctx, args): Promise<{ active: boolean }> {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select()
        .from(schema.interactions)
        .where(
          and(
            eq(schema.interactions.kind, args.kind),
            eq(schema.interactions.itemKey, args.itemKey),
          ),
        );
      if (existing.length > 0) {
        await db
          .delete(schema.interactions)
          .where(
            and(
              eq(schema.interactions.kind, args.kind),
              eq(schema.interactions.itemKey, args.itemKey),
            ),
          );
        ctx.invalidateQueries();
        return { active: false };
      }
      await db
        .insert(schema.interactions)
        .values({ kind: args.kind, itemKey: args.itemKey });
      ctx.invalidateQueries();
      return { active: true };
    },
  }),

  recordHistory: defineAction({
    description: "Records a watched video at the top of the viewer's history.",
    request: z.object({ itemKey: z.string().min(1).max(120) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.interactions)
        .where(
          and(
            eq(schema.interactions.kind, "history"),
            eq(schema.interactions.itemKey, args.itemKey),
          ),
        );
      await db
        .insert(schema.interactions)
        .values({ kind: "history", itemKey: args.itemKey });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  getAdminState: defineAction({
    description: "Returns the admin panel's saved state payload (site texts, buttons, SEO, admin videos, taxonomy changes), or null when nothing was ever saved.",
    request: z.object({}),
    response: z.object({ payload: z.string().nullable() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.adminState);
      const first = rows[0];
      return { payload: first ? first.payload : null };
    },
  }),

  verifyAdminCode: defineAction({
    description: "Checks text typed into the site search box against the server-held admin code; on a match returns a short-lived signed admin token that the state-changing admin actions require.",
    request: z.object({ code: z.string().min(1).max(120) }),
    response: z.object({ admin: z.boolean(), token: z.string().nullable() }),
    async handler(ctx, args): Promise<{ admin: boolean; token: string | null }> {
      void ctx;
      const normalized = args.code.trim().toLowerCase().replace(/^#+\/?/, "").replace(/\/$/, "");
      if (normalized !== ADMIN_CODE) return { admin: false, token: null };
      return { admin: true, token: await issueAdminToken() };
    },
  }),

  saveAdminState: defineAction({
    description: "Saves the admin panel's full state payload, replacing the previous one. Requires a valid admin token from verifyAdminCode.",
    request: z.object({ payload: z.string().max(5_000_000), token: z.string().max(500) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      await requireAdmin(args.token);
      const db = ctx.db<typeof schema>();
      await db.delete(schema.adminState);
      await db.insert(schema.adminState).values({ id: 1, payload: args.payload });
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  resetAdminState: defineAction({
    description: "Deletes the admin panel's saved state, restoring the site's built-in defaults. Requires a valid admin token from verifyAdminCode.",
    request: z.object({ token: z.string().max(500) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      await requireAdmin(args.token);
      const db = ctx.db<typeof schema>();
      await db.delete(schema.adminState);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  resolveEmbedFile: defineAction({
    description: "Resolves a freepornvideo.sex or xnxx.com embed page to its direct playable streams — every resolution the source offers (freepornvideo: its fast alt encode plus the full-quality original; xnxx.com: its low/high MP4s plus every variant in its HLS master playlist) — fetched server-side, so the video page can play them in a native in-page player with a full quality menu instead of the source's iframe (whose player can refuse embedded playback with a 'Blocked content' notice).",
    request: z.object({ embedUrl: z.string().min(1).max(2000) }),
    response: embedFileResponse,
    async handler(ctx, args): Promise<z.infer<typeof embedFileResponse>> {
      void ctx;
      const empty: z.infer<typeof embedFileResponse> = { fileUrl: null, hdFileUrl: null, fastLabel: null, streams: [] };
      try {
        const u = new URL(args.embedUrl);
        if (u.protocol !== "https:" && u.protocol !== "http:") return empty;
        const ua = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" };
        /* xnxx.com: its embed player refuses playback inside third-party
           frames ("Blocked content. Contact the site owner to fix"), but
           the embed page itself names the direct MP4 files in plain
           setVideoUrlLow / setVideoUrlHigh calls, and those files were
           verified to answer 206 video/mp4 with Range support to a
           cookie-less, referer-less request — so they play natively
           here exactly like the freepornvideo storage URLs below. A
           watch-page link (/video-<id>/…) converts to /embedframe/<id>. */
        if (/(^|\.)xnxx\.com$/i.test(u.hostname)) {
          const watch = u.pathname.match(/^\/video-([\w-]+)/);
          if (watch && watch[1]) { u.pathname = `/embedframe/${watch[1]}`; u.search = ""; }
          if (!/^\/embedframe\/[\w-]+/.test(u.pathname)) return empty;
          const pageRes = await fetch(u.toString(), { headers: ua, redirect: "follow", signal: AbortSignal.timeout(12000) });
          if (!pageRes.ok) return empty;
          const html = await pageRes.text();
          const grabCall = (name: string): string | null => {
            const m = html.match(new RegExp(`${name}\\('([^']+)'\\)`));
            return m && m[1] ? m[1] : null;
          };
          const low = grabCall("setVideoUrlLow");
          const high = grabCall("setVideoUrlHigh");
          const fast = low ?? high;
          if (!fast) return empty;
          /* Every resolution this source offers: the two MP4s PLUS
             every variant in the HLS master playlist the embed page
             names via setVideoHLS — verified live on the owner's
             catalog video: the master lists 250p/360p/480p/720p/1080p,
             and the playlists and their .ts segments all answer with
             Access-Control-Allow-Origin: *, so the client can play
             them (native HLS in Safari, hls.js elsewhere). At a
             height both offer, the MP4 wins — it plays everywhere
             with no HLS machinery. Nothing is invented: a height the
             playlist does not list never appears. */
          type Stream = { url: string; label: string; hls: boolean; height: number };
          const byHeight = new Map<number, Stream>();
          const addMp4 = (u: string | null) => {
            if (!u) return;
            const m = u.match(/_(\d{3,4})p\.mp4/i);
            const h = m && m[1] ? parseInt(m[1], 10) : 0;
            byHeight.set(h, { url: u, label: h ? `${h}p` : "MP4", hls: false, height: h });
          };
          addMp4(low);
          addMp4(high);
          const hlsMaster = grabCall("setVideoHLS");
          if (hlsMaster) {
            try {
              const hlsRes = await fetch(hlsMaster, { headers: ua, redirect: "follow", signal: AbortSignal.timeout(12000) });
              if (hlsRes.ok) {
                const lines = (await hlsRes.text()).split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i] ?? "";
                  if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
                  const nm = line.match(/NAME="(\d{3,4})p"/) ?? line.match(/RESOLUTION=\d+x(\d{3,4})/);
                  const next = (lines[i + 1] ?? "").trim();
                  if (!nm || !nm[1] || !next || next.startsWith("#")) continue;
                  const h = parseInt(nm[1], 10);
                  if (!byHeight.has(h)) byHeight.set(h, { url: new URL(next, hlsMaster).toString(), label: `${h}p`, hls: true, height: h });
                }
              }
            } catch { /* HLS only ever adds options; the MP4s still play without it */ }
          }
          const sorted = [...byHeight.values()].sort((a, b) => a.height - b.height);
          const streams = sorted.map(({ url, label, hls }) => ({ url, label, hls }));
          const fastEntry = sorted.find((s) => s.url === fast);
          return { fileUrl: fast, hdFileUrl: high && high !== fast ? high : null, fastLabel: fastEntry ? fastEntry.label : null, streams };
        }
        if (u.hostname !== "www.freepornvideo.sex" && u.hostname !== "freepornvideo.sex") return empty;
        const watch = u.pathname.match(/^\/xxx\/(\d+)/);
        if (watch && watch[1]) { u.pathname = `/embed/${watch[1]}`; u.search = ""; }
        if (!/^\/embed\/\d+/.test(u.pathname)) return empty;
        const embedUrl = u.toString();
        const pageRes = await fetch(embedUrl, { headers: ua, redirect: "follow", signal: AbortSignal.timeout(12000) });
        if (!pageRes.ok) return empty;
        const setCookies = typeof pageRes.headers.getSetCookie === "function" ? pageRes.headers.getSetCookie() : [];
        const cookie = setCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
        const html = await pageRes.text();
        const grab = (name: string): string | null => {
          const m = html.match(new RegExp(`${name}:\\s*'([^']+)'`)) ?? html.match(new RegExp(`${name}:\\s*"([^"]+)"`));
          return m && m[1] ? m[1] : null;
        };
        const mainPageUrl = grab("video_url");
        const mainLabel = grab("video_url_text");
        const altPageUrl = grab("video_alt_url");
        const altLabel = grab("video_alt_url_text");
        if (!mainPageUrl && !altPageUrl) return empty;
        /* The file endpoint is session-gated: it answers 403 without the
           embed page's cookies, but redirects (302) to a storage URL that
           plays from any client. Follow exactly one hop, server-side.
           The embed's main file is the full-quality original (measured on
           the owner's catalog at 260 MB – 3.7 GB per video), while its
           alt file is a 480p encode roughly 4–20x smaller; on a real
           connection the big file buffers constantly, so the player
           defaults to the alt stream and offers the original as HD. */
        const followGated = async (filePageUrl: string | null): Promise<string | null> => {
          if (!filePageUrl) return null;
          try {
            const fileRes = await fetch(filePageUrl, {
              headers: { ...ua, ...(cookie ? { Cookie: cookie } : {}), Referer: embedUrl },
              redirect: "manual",
              signal: AbortSignal.timeout(12000),
            });
            const loc = fileRes.headers.get("location");
            return loc ? new URL(loc, filePageUrl).toString() : null;
          } catch {
            return null;
          }
        };
        const [mainFile, altFile] = await Promise.all([followGated(mainPageUrl), followGated(altPageUrl)]);
        /* This source offers exactly two files — verified against a
           live embed page: video_url (labelled by video_url_text,
           "Original") and video_alt_url (its 480p encode). The stream
           list is exactly those two, under the source's own labels. */
        const streams: { url: string; label: string; hls: boolean }[] = [];
        if (altFile) streams.push({ url: altFile, label: altLabel ?? "480p", hls: false });
        if (mainFile) streams.push({ url: mainFile, label: mainLabel ?? "Original", hls: false });
        if (altFile) return { fileUrl: altFile, hdFileUrl: mainFile, fastLabel: altLabel, streams };
        return { fileUrl: mainFile, hdFileUrl: null, fastLabel: null, streams };
      } catch {
        return empty;
      }
    },
  }),

  clearHistory: defineAction({
    description: "Clears the viewer's watch history.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.interactions)
        .where(eq(schema.interactions.kind, "history"));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
