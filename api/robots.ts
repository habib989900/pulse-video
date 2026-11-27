// GET /robots.txt — the real robots file (text/plain).
//
// Previously the vercel.json catch-all rewrite served the SPA HTML
// for this path. The rewrites in vercel.json now route /robots.txt
// here (before the catch-all). Content is the same builder the
// in-app #/robots.txt view uses (see lib/seo.ts).
//
// Speed round, item 3: robots.txt is built from nothing but the
// request origin (no store read, ~100 bytes), so it needs no Blob
// cache — only the long edge TTL it never had: s-maxage=3600 with
// stale-while-revalidate, via both Cache-Control and
// CDN-Cache-Control. (Live baseline 2026-11-27: 200,
// `Cache-Control: public, max-age=300`, no edge caching.)

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderRobotsTxt, siteBaseFromRequest } from "../lib/seo.js";

export const config = { maxDuration: 10 };

const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const txt = renderRobotsTxt(siteBaseFromRequest(req));
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("CDN-Cache-Control", CACHE_CONTROL);
  return res.status(200).send(txt);
}
