// GET /robots.txt — the real robots file (text/plain).
//
// Previously the vercel.json catch-all rewrite served the SPA HTML
// for this path. The rewrites in vercel.json now route /robots.txt
// here (before the catch-all). Content is the same builder the
// in-app #/robots.txt view uses (see lib/seo.ts).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { renderRobotsTxt, siteBaseFromRequest } from "../lib/seo.js";

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const txt = renderRobotsTxt(siteBaseFromRequest(req));
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return res.status(200).send(txt);
}
