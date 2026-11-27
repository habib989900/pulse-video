// GET /video/:id — the video page with server-injected meta.
//
// The app is hash-routed, so without this the /video/<id> path serves
// the plain shell and every video link unfurls with the generic home
// tags. vercel.json rewrites /video/:id here (before the catch-all);
// this function reads the built index.html, injects the video's
// title/description/OG/canonical/VideoObject JSON-LD from the Blob
// catalog (see lib/seo.ts), and returns it. The client boots normally
// from the injected HTML and routes to the video — only the <head>
// differs. Unknown ids get the plain shell (the client shows its own
// 404); if the shell cannot be read at all, the request falls back to
// fetching the public index.html, then to a redirect home.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildVideoPageMeta, getVideoForPage, injectVideoMeta, siteBaseFromRequest } from "../lib/seo.js";

export const config = { maxDuration: 10 };

async function readShell(req: VercelRequest): Promise<string | null> {
  // includeFiles (vercel.json) bundles dist/index.html with this
  // function at its project-root relative path.
  const candidates = [
    path.join(process.cwd(), "dist", "index.html"),
    "/var/task/dist/index.html",
  ];
  for (const c of candidates) {
    try {
      return await readFile(c, "utf8");
    } catch {
      /* try the next candidate */
    }
  }
  // Last resort: fetch the public shell from this same deployment.
  try {
    const host = (req.headers.host as string | undefined) || "pulse-video-five.vercel.app";
    const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || "https";
    const res = await fetch(`${proto}://${host}/index.html`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return await res.text();
  } catch {
    /* fall through to the redirect */
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const shell = await readShell(req);
  if (!shell) return res.redirect(302, "/");
  const id = typeof req.query.id === "string" ? req.query.id : "";
  let html = shell;
  if (id) {
    try {
      const found = await getVideoForPage(id);
      if (found) {
        const meta = buildVideoPageMeta(siteBaseFromRequest(req), found.video, found.brand);
        html = injectVideoMeta(shell, meta);
      }
    } catch (err) {
      // Meta injection must never break the page: serve the plain
      // shell and log the failure.
      console.error("[page] meta injection failed, serving plain shell:", err instanceof Error ? err.message : err);
    }
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // The meta changes when the admin edits the video, but the shell is
  // the same for every visitor — cache briefly at the edge.
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  return res.status(200).send(html);
}
