// Server-side rendering of /sitemap.xml and /robots.txt.
//
// The XML is built from the SAME shared module the client uses
// (lib/catalog.ts: buildEffective + buildSitemapXml) plus the saved
// admin state from the Blob store — so the served sitemap lists
// exactly what the public site shows: built-in videos plus admin
// imports, minus deletes, with taxonomy renames applied. The in-app
// #/sitemap.xml view and the admin Download/Copy buttons call the
// same builders, so all three can never drift apart.
//
// If the admin payload cannot be read (transient store error), the
// sitemap falls back to the built-in catalog rather than failing:
// a crawler gets a valid sitemap, just possibly missing the newest
// imports, and the failure is logged.

import type { VercelRequest } from "@vercel/node";
import { buildEffective, buildRobotsTxt, buildSitemapXml, parseAdminState } from "./catalog.js";
import { getAdminPayload } from "./store.js";

/** Site base (origin + "/") for the incoming request, from the
    forwarded proto/host Vercel sets. Falls back to the live origin
    when the headers are absent (local testing). */
export function siteBaseFromRequest(req: VercelRequest): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() || "https";
  const host = (req.headers.host as string | undefined) || "pulse-video-five.vercel.app";
  return `${proto}://${host}/`;
}

export async function renderSitemapXml(base: string): Promise<string> {
  let payload: string | null = null;
  try {
    payload = await getAdminPayload();
  } catch (err) {
    console.error(
      "[seo] admin payload read failed, serving built-in catalog:",
      err instanceof Error ? err.message : err,
    );
  }
  const eff = buildEffective(parseAdminState(payload));
  return buildSitemapXml(base, eff);
}

export function renderRobotsTxt(base: string): string {
  return buildRobotsTxt(base);
}
