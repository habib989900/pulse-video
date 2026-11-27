// GET /sitemap.xml — the real, dynamic sitemap.
//
// Previously the vercel.json catch-all rewrite served the SPA HTML
// for this path, so crawlers got no sitemap at all. The rewrites in
// vercel.json now route /sitemap.xml here (before the catch-all).
// Content is built live from the effective catalog (see lib/seo.ts).
//
// Speed round, item 3: the old handler rebuilt the ~300 KB XML from
// the 233 KB admin payload on EVERY request and still always came
// back X-Vercel-Cache: MISS (live baseline 2026-11-27: 200 in
// 1.078 s, 317,589 B, `Cache-Control: public, max-age=300` — note
// the s-maxage=300 the code set never even appeared in the live
// response header). Two layers now:
//   1. Blob cache: the built XML is stored per origin in the Blob
//      store (lib/store.ts) and served from there; it is rebuilt
//      only on a miss, on TTL expiry (24 h safety valve), or after
//      an admin save/reset wipes it. A cache miss still builds live
//      and re-caches, so the sitemap is never stale past one admin
//      edit — the next request after a save rebuilds it.
//   2. Edge cache: `s-maxage=3600, stale-while-revalidate=86400`
//      via both Cache-Control and CDN-Cache-Control, so the edge
//      serves HITs for an hour and refreshes in the background.
//      `X-PV-Cache: hit|miss` reports the Blob-cache layer (the
//      edge's own verdict is X-Vercel-Cache on the live response).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderSitemapXmlDetailed, siteBaseFromRequest } from "../lib/seo.js";
import { getSitemapCache, saveSitemapCache } from "../lib/store.js";

export const config = { maxDuration: 10 };

/* 24 h: safety valve only — invalidation on admin save is what
   keeps the cache fresh. */
const SITEMAP_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
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
      /* Only cache a build from the real saved payload — never the
         built-in fallback served when the store read fails. A cache
         write failure must never fail the response: the XML is
         already built, so log and serve it. */
      if (built.payloadOk) {
        try {
          await saveSitemapCache(base, xml);
        } catch (err) {
          console.error("[sitemap] cache write failed:", err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error("[sitemap]", err instanceof Error ? err.message : err);
      return res.status(500).json({ error: "Could not build sitemap" });
    }
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("CDN-Cache-Control", CACHE_CONTROL);
  res.setHeader("X-PV-Cache", cacheState);
  return res.status(200).send(xml);
}
