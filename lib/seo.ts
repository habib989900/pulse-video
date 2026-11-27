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
import {
  buildEffective,
  buildRobotsTxt,
  buildSitemapXml,
  isVideoFileUrl,
  isoDateFromDays,
  isoDuration,
  parseAdminState,
  publicUrl,
  resolveEmbed,
  type Video,
} from "./catalog.js";
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

/* ---------------- A8: server-injected per-video meta ----------------
   The app is hash-routed and its per-view meta/JSON-LD is rendered
   by JavaScript, so a crawler or link unfurler that does not run JS
   sees the generic home-page tags for every video link. The served
   sitemap lists real /video/<id> paths — and this module injects the
   matching title, description, OG tags, canonical URL and VideoObject
   JSON-LD into the HTML shell for those paths, server-side, from the
   same Blob catalog the site itself renders. The client still boots
   normally from the injected HTML (same mount point, same scripts)
   and routes to the video; only the <head> differs. If this ever
   regresses on Preview (slow load, broken routing, wrong meta), the
   fix is to remove the /video/:id rewrite in vercel.json — the plain
   shell comes back and nothing else changes. */

export interface VideoPageMeta {
  title: string;
  description: string;
  ogImage: string | null;
  canonical: string;
  brand: string;
  jsonLd: Record<string, unknown>;
}

export function buildVideoPageMeta(base: string, v: Video, brand: string): VideoPageMeta {
  const title = `${v.seoTitle || v.title} | ${brand}`;
  const rawDesc = v.seoDescription || v.description || `Watch ${v.title} — streaming in HD on ${brand}.`;
  const description = rawDesc.replace(/\s+/g, " ").trim().slice(0, 300);
  const ogImage = v.thumbnailUrl && !isVideoFileUrl(v.thumbnailUrl) ? v.thumbnailUrl : `${base}og-image.svg`;
  const canonical = publicUrl(base, `/video/${v.id}`);
  const dur = isoDuration(v.durationSec);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.title,
    description: rawDesc.replace(/\s+/g, " ").trim().slice(0, 2048),
    url: canonical,
    ...(v.thumbnailUrl && !isVideoFileUrl(v.thumbnailUrl) ? { thumbnailUrl: [v.thumbnailUrl] } : {}),
    ...(v.hasDate ? { uploadDate: isoDateFromDays(v.days) } : {}),
    ...(dur ? { duration: dur } : {}),
    ...(v.embedUrl ? { embedUrl: resolveEmbed(v.embedUrl).src } : {}),
    ...(v.hasViews ? { interactionStatistic: { "@type": "InteractionCounter", interactionType: { "@type": "WatchAction" }, userInteractionCount: v.views } } : {}),
    ...(v.creator ? { actor: { "@type": "Person", name: v.creator } } : {}),
    inLanguage: "en",
    isFamilyFriendly: false,
    genre: v.category,
  };
  return { title, description, ogImage, canonical, brand, jsonLd };
}

/** The effective video (if any) for a video page, plus the site brand
    from the saved admin texts. Null when the id is not a video. */
export async function getVideoForPage(videoId: string): Promise<{ video: Video; brand: string } | null> {
  let payload: string | null = null;
  try {
    payload = await getAdminPayload();
  } catch (err) {
    console.error("[seo] admin payload read failed for video page:", err instanceof Error ? err.message : err);
    return null;
  }
  const admin = parseAdminState(payload);
  const eff = buildEffective(admin);
  const video = eff.videos.find((v) => v.id === videoId);
  if (!video) return null;
  return { video, brand: admin.texts.siteName || "Pulse Video" };
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inject per-video meta into the built index.html shell. Every
    replacement targets the exact baseline tags in client/index.html
    and falls back to inserting before </head> when a tag is missing,
    so a changed baseline can never silently serve generic tags. */
export function injectVideoMeta(indexHtml: string, meta: VideoPageMeta): string {
  let html = indexHtml;
  const replaceOrInsert = (pattern: RegExp, replacement: string) => {
    if (pattern.test(html)) html = html.replace(pattern, replacement);
    else html = html.replace("</head>", `${replacement}\n  </head>`);
  };
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escAttr(meta.title)}</title>`);
  replaceOrInsert(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escAttr(meta.description)}" />`,
  );
  replaceOrInsert(
    /<meta property="og:site_name" content="[^"]*" \/>/,
    `<meta property="og:site_name" content="${escAttr(meta.brand)}" />`,
  );
  replaceOrInsert(
    /<meta property="og:type" content="[^"]*" \/>/,
    `<meta property="og:type" content="video.other" />`,
  );
  replaceOrInsert(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escAttr(meta.title)}" />`,
  );
  replaceOrInsert(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escAttr(meta.description)}" />`,
  );
  replaceOrInsert(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${escAttr(meta.canonical)}" />`,
  );
  if (meta.ogImage) {
    replaceOrInsert(
      /<meta property="og:image" content="[^"]*" \/>/,
      `<meta property="og:image" content="${escAttr(meta.ogImage)}" />`,
    );
    replaceOrInsert(
      /<meta name="twitter:card" content="[^"]*" \/>/,
      `<meta name="twitter:card" content="summary_large_image" />`,
    );
    replaceOrInsert(
      /<meta name="twitter:title" content="[^"]*" \/>/,
      `<meta name="twitter:title" content="${escAttr(meta.title)}" />`,
    );
    replaceOrInsert(
      /<meta name="twitter:description" content="[^"]*" \/>/,
      `<meta name="twitter:description" content="${escAttr(meta.description)}" />`,
    );
    replaceOrInsert(
      /<meta name="twitter:image" content="[^"]*" \/>/,
      `<meta name="twitter:image" content="${escAttr(meta.ogImage)}" />`,
    );
  }
  replaceOrInsert(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escAttr(meta.canonical)}" />`,
  );
  const jsonLd = `<script type="application/ld+json">\n      ${JSON.stringify(meta.jsonLd)}\n    </script>`;
  html = html.replace("</head>", `    ${jsonLd}\n  </head>`);
  return html;
}
