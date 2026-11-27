// Cloudflare Worker entry point for the PULSE VIDEO backend.
//
// One Worker serves every server route the Vercel port had as
// separate functions, behind the Pages site's proxy (see
// client/public/_redirects):
//   POST /api/actions   — the 9 RPC actions (+ one-time migrateFromVercel)
//   GET  /sitemap.xml   — dynamic sitemap, KV-cached per origin
//   GET  /robots.txt    — robots file
//   GET  /video/:id     — video page with server-injected meta
//
// There is no 10 s function limit here (unlike Vercel Hobby), but the
// resolver keeps its own ~9 s deadline, and the RPC client times out
// at 15 s, so slow resolves still fail loudly instead of hanging.

import { z } from "zod";
import { ACTIONS } from "./lib/actions.js";
import { bindEnv, type CfEnv } from "./lib/env.js";
import {
  buildVideoPageMeta,
  getVideoForPage,
  injectVideoMeta,
  renderRobotsTxt,
  renderSitemapXmlDetailed,
  siteBaseFromRequest,
} from "./lib/seo.js";
import { getSitemapCache, saveSitemapCache } from "./lib/store.js";

const SITEMAP_TTL_MS = 24 * 60 * 60 * 1000;
const SITEMAP_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

/* Per-IP throttling, in memory per isolate (same budgets as the
   Vercel port). The code check is brute-forceable, so it gets a tight
   budget (5/min); the resolver does outbound fetches, so it gets
   20/min. 429s are explicit — the client shows the message and the
   user retries. */
const hits = new Map<string, number[]>();
function rateLimited(key: string, limit: number, windowMs: number): boolean {
  if (hits.size > 10_000) hits.clear();
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(), ...extra },
  });
}

async function handleActions(req: Request): Promise<Response> {
  let body: { action?: unknown; args?: unknown };
  try {
    body = (await req.json()) as { action?: unknown; args?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const name = typeof body.action === "string" ? body.action : "";
  const def = ACTIONS[name];
  if (!def) return json({ error: `Unknown action: ${name || "(missing)"}` }, 400);
  if (name === "verifyAdminCode" && rateLimited(`code:${clientIp(req)}`, 10, 60_000)) {
    return json({ error: "Too many code attempts — try again in a minute." }, 429);
  }
  if (name === "resolveEmbedFile" && rateLimited(`resolve:${clientIp(req)}`, 20, 60_000)) {
    return json({ error: "Too many resolve requests — try again in a minute." }, 429);
  }
  const parsed = def.request.safeParse(body.args ?? {});
  if (!parsed.success) return json({ error: "Invalid arguments" }, 400);
  try {
    const result = await def.handler(parsed.data as never);
    return json(result);
  } catch (err) {
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === "number" && (status === 400 || status === 429)) {
      return json({ error: err instanceof Error ? err.message : "Request failed" }, status);
    }
    console.error("[actions]", name, err instanceof Error ? err.message : err);
    return json({ error: "Something went wrong" }, 500);
  }
}

async function handleSitemap(req: Request): Promise<Response> {
  const base = siteBaseFromRequest(req);
  let xml: string | null = null;
  let cacheState: "hit" | "miss" = "miss";
  try {
    const cached = await getSitemapCache(base);
    if (cached && Date.now() - cached.builtAt < SITEMAP_TTL_MS) {
      xml = cached.xml;
      cacheState = "hit";
    }
  } catch (err) {
    console.error("[sitemap] cache read failed, building live:", err instanceof Error ? err.message : err);
  }
  if (xml === null) {
    try {
      const built = await renderSitemapXmlDetailed(base);
      xml = built.xml;
      if (built.payloadOk) {
        try {
          await saveSitemapCache(base, xml);
        } catch (err) {
          console.error("[sitemap] cache write failed:", err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error("[sitemap]", err instanceof Error ? err.message : err);
      return json({ error: "Could not build sitemap" }, 500);
    }
  }
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": SITEMAP_CACHE_CONTROL,
      "CDN-Cache-Control": SITEMAP_CACHE_CONTROL,
      "X-PV-Cache": cacheState,
    },
  });
}

function handleRobots(req: Request): Response {
  const txt = renderRobotsTxt(siteBaseFromRequest(req));
  return new Response(txt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": SITEMAP_CACHE_CONTROL,
      "CDN-Cache-Control": SITEMAP_CACHE_CONTROL,
    },
  });
}

async function handleVideoPage(req: Request, id: string): Promise<Response> {
  // The shell lives on the Pages site (the Worker does not serve the
  // SPA itself). Fetch it, inject the video's meta, and return it —
  // the client boots normally from the injected HTML.
  const origin = siteBaseFromRequest(req).replace(/\/$/, "");
  let shell: string | null = null;
  try {
    const res = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) shell = await res.text();
  } catch {
    /* fall through to the redirect */
  }
  if (!shell) return Response.redirect(`${origin}/`, 302);
  let html = shell;
  if (id) {
    try {
      const found = await getVideoForPage(id);
      if (found) {
        const meta = buildVideoPageMeta(siteBaseFromRequest(req), found.video, found.brand);
        html = injectVideoMeta(shell, meta);
      }
    } catch (err) {
      console.error("[page] meta injection failed, serving plain shell:", err instanceof Error ? err.message : err);
    }
  }
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

export default {
  async fetch(request: Request, env: CfEnv): Promise<Response> {
    bindEnv(env);
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (url.pathname === "/api/actions" && request.method === "POST") {
      return handleActions(request);
    }
    if (url.pathname === "/sitemap.xml" && request.method === "GET") {
      return handleSitemap(request);
    }
    if (url.pathname === "/robots.txt" && request.method === "GET") {
      return handleRobots(request);
    }
    if (url.pathname.startsWith("/video/") && request.method === "GET") {
      return handleVideoPage(request, decodeURIComponent(url.pathname.slice("/video/".length)));
    }
    return new Response("Not found", { status: 404 });
  },
};
