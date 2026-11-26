// GET /sitemap.xml — the real, dynamic sitemap.
//
// Previously the vercel.json catch-all rewrite served the SPA HTML
// for this path, so crawlers got no sitemap at all. The rewrites in
// vercel.json now route /sitemap.xml here (before the catch-all).
// Content is built live from the effective catalog (see lib/seo.ts).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderSitemapXml, siteBaseFromRequest } from "../lib/seo.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const xml = await renderSitemapXml(siteBaseFromRequest(req));
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    // Dynamic (admin imports change it), but cheap to cache briefly.
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).send(xml);
  } catch (err) {
    console.error("[sitemap]", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Could not build sitemap" });
  }
}
