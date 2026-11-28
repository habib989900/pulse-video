// Shared catalog + SEO logic for PULSE VIDEO (Vercel port).
//
// Pure TypeScript — no React, no DOM, no Node APIs — so both the Vite
// client (client/src/App.tsx) and the Vercel Serverless Functions
// (api/sitemap.ts, api/robots.ts) import it. The server-side sitemap
// is built from this module plus the saved admin state from the Blob
// store, so it lists exactly what the public site shows: built-in
// videos + admin-added videos, minus deletes, with taxonomy renames
// applied.

/* Types & catalog data (shared by the client and the server).
   The built-in catalog, the admin-state merge (buildEffective) and the
   SEO builders live here so the server-side /sitemap.xml uses exactly
   the same data and URLs as the in-app sitemap — one source of truth. */

export type Video = {
  id: string;
  title: string;
  duration: string;
  durationSec: number;
  views: number;
  age: string;
  days: number;
  rating: number;
  hd: boolean;
  category: string;
  tags: string[];
  creator: string;
  g: [string, string];
  /* Admin-managed fields. Videos added or edited in the admin panel
     carry real values, where null means "not provided" and the UI
     hides that piece. There is no built-in catalog any more (the demo
     catalog was removed): every video on the site is an admin video. */
  embedUrl: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featured: boolean;
  badgeNew: boolean;
  channel: string | null;
  custom: boolean;
  hasViews: boolean;
  hasDate: boolean;
  hasRating: boolean;
};

export const fmtViews = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
export const fmtDur = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const ageFromDays = (d: number) =>
  d <= 0 ? "12 hours ago" : d === 1 ? "1 day ago" : d < 30 ? `${d} days ago` : d < 60 ? "1 month ago" : d < 365 ? `${Math.floor(d / 30)} months ago` : d < 730 ? "1 year ago" : `${Math.floor(d / 365)} years ago`;

/* Demo catalog removed (2026-11-27): the site now runs on imported
   videos only. The built-in demo catalog (24 hand-written + 240
   generated videos, plus demo categories, channels, creators and
   tags) shipped in the bundle and would reappear if the saved admin
   state were ever lost, so it is gone. Taxonomy is derived from the
   effective (imported) videos only — see buildEffective. The exports
   below stay (as empty arrays) so existing imports keep working. */
export const VIDEOS: Video[] = [];
export const CATEGORIES: { name: string; count: string }[] = [];
export const CHANNELS: { name: string; videos: string; creator: string; g: [string, string] }[] = [];
export const CREATORS: { name: string; videos: number; followers: string; g: [string, string] }[] = [];
export const TAGS: { name: string; count: number }[] = [];

const CREATOR_GRADIENTS: [string, string][] = [
  ["#0ea5e9", "#6366f1"], ["#f59e0b", "#ef4444"], ["#10b981", "#0ea5e9"], ["#8b5cf6", "#ec4899"],
  ["#f97316", "#facc15"], ["#06b6d4", "#22c55e"], ["#e11d48", "#7c3aed"], ["#334155", "#0ea5e9"],
];

/* ---------------- Admin panel state ----------------
   Everything the admin panel manages lives in one AdminState object,
   persisted as JSON through the saveAdminState action. The public site
   renders buildEffective(adminState): the built-in catalog with admin
   videos prepended, catalog edits applied as overrides, deletes removed,
   and taxonomy renames/additions/deletions applied. A null AdminState
   (nothing ever saved, or after Reset) reproduces the default site. */

export type AdminVideo = {
  id: string;
  title: string | null;
  description: string | null;
  embedUrl: string | null;
  durationSec: number | null;
  views: number | null;
  days: number | null;
  dateStr: string | null;
  creator: string | null;
  channel: string | null;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featured: boolean;
  badgeNew: boolean;
  rating: number | null;
  hd: boolean;
};

export type TaxOp = { added: string[]; renamed: Record<string, string>; deleted: string[] };
const emptyTax = (): TaxOp => ({ added: [], renamed: {}, deleted: [] });

export type AdminState = {
  texts: Record<string, string>;
  buttons: { id: string; name: string; label: string; link: string }[];
  seo: { siteTitle: string; metaDescription: string; metaKeywords: string; ogTitle: string; ogDescription: string };
  addedVideos: AdminVideo[];
  overrides: Record<string, AdminVideo>;
  deletedIds: string[];
  ads: AdsConfig;
  taxonomy: {
    categories: TaxOp;
    models: TaxOp;
    tags: TaxOp;
    channels: TaxOp;
    channelsAdded: { name: string; creator: string }[];
  };
};

/* Ads the admin places from the panel. One creative per slot:
   - preroll: shown inside the player before a video starts; the
     viewer can skip it after `skipAfterSec` seconds (image or video).
   - homeTop / homeBottom / videoBelow / videoBottom: banner slots on
     the home page and the video page (image + link, or raw ad-network
     HTML pasted by the admin — it renders as-is, exactly like the
     network's own snippet). A slot renders nothing while disabled
     or while it has no content. */
export type AdCreative = {
  enabled: boolean;
  kind: "image" | "video" | "html";
  mediaUrl: string;
  linkUrl: string;
  html: string;
  skipAfterSec: number;
};
export type AdsConfig = {
  preroll: AdCreative;
  homeTop: AdCreative;
  homeBottom: AdCreative;
  videoBelow: AdCreative;
  videoBottom: AdCreative;
};
const emptyAd = (kind: AdCreative["kind"] = "image"): AdCreative => ({ enabled: false, kind, mediaUrl: "", linkUrl: "", html: "", skipAfterSec: 5 });
export const DEFAULT_ADS: AdsConfig = {
  preroll: emptyAd("image"),
  homeTop: emptyAd(),
  homeBottom: emptyAd(),
  videoBelow: emptyAd(),
  videoBottom: emptyAd(),
};
/* Defensive merge for a stored creative: wrong types fall back to the
   default instead of breaking the player or a banner slot. */
const normAd = (d: AdCreative, p?: Partial<AdCreative>): AdCreative => ({
  enabled: typeof p?.enabled === "boolean" ? p.enabled : d.enabled,
  kind: p?.kind === "image" || p?.kind === "video" || p?.kind === "html" ? p.kind : d.kind,
  mediaUrl: typeof p?.mediaUrl === "string" ? p.mediaUrl : d.mediaUrl,
  linkUrl: typeof p?.linkUrl === "string" ? p.linkUrl : d.linkUrl,
  html: typeof p?.html === "string" ? p.html : d.html,
  skipAfterSec: typeof p?.skipAfterSec === "number" && Number.isFinite(p.skipAfterSec) ? Math.min(30, Math.max(0, Math.floor(p.skipAfterSec))) : d.skipAfterSec,
});

export const DEFAULT_TEXTS: Record<string, string> = {
  siteName: "Pulse Video",
  logoText: "PULSE VIDEO",
  homeH1: "Stream Free Videos in HD",
  secTrending: "Trending now",
  secLatest: "Latest videos",
  secModels: "Popular models",
  secChannels: "Channels",
  secBecause: "Because you watch",
  secTopRated: "Top rated",
  searchPlaceholder: "Search videos, models, tags",
  footerText: "pulsevideo.example · For adults only. You must be 18 or older to use this site.",
  cookieText: "We use cookies to run this site and show ads.",
  termsText: "Terms of Use\n\nBy using this site you confirm you are at least 18 years old, or the age of majority in your country, whichever is higher.\n\nVideos on this site are hosted by third-party services and embedded here for viewing. We do not host video files ourselves and we do not control the content of embedded videos.\n\nYou agree not to misuse the site, attempt to access the admin panel without authorisation, or scrape the site in a way that harms its operation.\n\nAll videos, names and artwork remain the property of their respective owners. If you believe content on this site infringes your rights, contact the site owner and it will be reviewed.\n\nThese terms may change from time to time. Continued use of the site after a change means you accept the updated terms.",
  privacyText: "Privacy Policy\n\nThis site does not require an account and does not ask for your name, email or payment details.\n\nLikes, saves, follows and watch history are stored anonymously on the site's server so the site can show them back to you; they are not linked to any personal identity.\n\nVideos play from third-party video services. When you play a video, that service may receive your IP address and browser information, as if you had visited it directly. This site sends no referrer with video requests.\n\nWe use cookies only to remember your preferences on this device (such as light or dark mode). We do not run advertising trackers of our own.\n\nIf you contact the site owner, your message is used only to answer you. You can ask for your data to be removed at any time.",
};

export const DEFAULT_BUTTONS: AdminState["buttons"] = [
  { id: "next", name: "Next (page / section)", label: "Next", link: "" },
  { id: "showMore", name: "Show more (Latest on home)", label: "Show more", link: "" },
  { id: "seeAll", name: "See all (section links)", label: "See all", link: "" },
  { id: "follow", name: "Follow (model buttons)", label: "Follow", link: "" },
  { id: "like", name: "Like (video page)", label: "Like", link: "" },
  { id: "save", name: "Save / Watch later (video page)", label: "Save", link: "" },
  { id: "watchFull", name: "Watch Full Video (player overlay)", label: "Watch Full Video", link: "" },
];

export const DEFAULT_SEO: AdminState["seo"] = {
  siteTitle: "Pulse Video | Stream Free Videos in HD",
  metaDescription: "Watch free videos in HD — trending, latest and top rated videos, models and channels, updated daily.",
  metaKeywords: "videos, streaming, hd videos, trending videos, models, channels",
  ogTitle: "Pulse Video",
  ogDescription: "Watch free videos in HD — trending, latest and top rated videos, models and channels, updated daily.",
};

export const DEFAULT_ADMIN_STATE: AdminState = {
  texts: { ...DEFAULT_TEXTS },
  buttons: DEFAULT_BUTTONS.map((b) => ({ ...b })),
  seo: { ...DEFAULT_SEO },
  addedVideos: [],
  overrides: {},
  deletedIds: [],
  ads: JSON.parse(JSON.stringify(DEFAULT_ADS)) as AdsConfig,
  taxonomy: { categories: emptyTax(), models: emptyTax(), tags: emptyTax(), channels: emptyTax(), channelsAdded: [] },
};

export function parseAdminState(payload: string | null | undefined): AdminState {
  const base = JSON.parse(JSON.stringify(DEFAULT_ADMIN_STATE)) as AdminState;
  if (!payload) return base;
  try {
    const p = JSON.parse(payload) as Partial<AdminState>;
    /* Coercion is logged, not silent: a malformed saved payload must
       never quietly drop the owner's videos. The server-side save
       validation (A3) rejects bad payloads before they are stored;
       this is the last line of defence for anything already saved. */
    if (!Array.isArray(p.addedVideos) && p.addedVideos !== undefined) console.warn("[admin-state] addedVideos is not an array, using []");
    if (!Array.isArray(p.deletedIds) && p.deletedIds !== undefined) console.warn("[admin-state] deletedIds is not an array, using []");
    if (p.overrides !== undefined && (typeof p.overrides !== "object" || p.overrides === null)) console.warn("[admin-state] overrides is not an object, using {}");
    return {
      texts: { ...base.texts, ...(p.texts ?? {}) },
      buttons: DEFAULT_BUTTONS.map((d) => {
        const b = (p.buttons ?? []).find((x) => x.id === d.id);
        return b ? { ...d, label: typeof b.label === "string" ? b.label : d.label, link: typeof b.link === "string" ? b.link : d.link } : { ...d };
      }),
      seo: { ...base.seo, ...(p.seo ?? {}) },
      addedVideos: Array.isArray(p.addedVideos) ? p.addedVideos.map((v) => normalizeAdminVideo(v as Partial<AdminVideo> & { id: string })) : [],
      overrides:
        p.overrides && typeof p.overrides === "object"
          ? Object.fromEntries(Object.entries(p.overrides).map(([k, v]) => [k, normalizeAdminVideo(v as Partial<AdminVideo> & { id: string })]))
          : {},
      deletedIds: Array.isArray(p.deletedIds) ? p.deletedIds : [],
      ads: {
        preroll: normAd(DEFAULT_ADS.preroll, p.ads?.preroll),
        homeTop: normAd(DEFAULT_ADS.homeTop, p.ads?.homeTop),
        homeBottom: normAd(DEFAULT_ADS.homeBottom, p.ads?.homeBottom),
        videoBelow: normAd(DEFAULT_ADS.videoBelow, p.ads?.videoBelow),
        videoBottom: normAd(DEFAULT_ADS.videoBottom, p.ads?.videoBottom),
      },
      taxonomy: {
        categories: { ...emptyTax(), ...(p.taxonomy?.categories ?? {}) },
        models: { ...emptyTax(), ...(p.taxonomy?.models ?? {}) },
        tags: { ...emptyTax(), ...(p.taxonomy?.tags ?? {}) },
        channels: { ...emptyTax(), ...(p.taxonomy?.channels ?? {}) },
        channelsAdded: Array.isArray(p.taxonomy?.channelsAdded) ? p.taxonomy.channelsAdded : [],
      },
    };
  } catch (err) {
    console.warn("[admin-state] payload failed to parse, using defaults:", err instanceof Error ? err.message : err);
    return base;
  }
}

/* Fills a partial AdminVideo (e.g. from the slim public payload,
   which omits fields the listing path never reads) out to a full
   AdminVideo, so buildEffective and the video page can consume slim
   and full payloads through the same code. A no-op for full
   payloads: every field is already present. */
export function normalizeAdminVideo(v: Partial<AdminVideo> & { id: string }): AdminVideo {
  return {
    id: v.id,
    title: v.title ?? null,
    description: v.description ?? null,
    embedUrl: v.embedUrl ?? null,
    durationSec: v.durationSec ?? null,
    views: v.views ?? null,
    days: v.days ?? null,
    dateStr: v.dateStr ?? null,
    creator: v.creator ?? null,
    channel: v.channel ?? null,
    category: v.category ?? null,
    tags: Array.isArray(v.tags) ? [...v.tags] : [],
    thumbnailUrl: v.thumbnailUrl ?? null,
    seoTitle: v.seoTitle ?? null,
    seoDescription: v.seoDescription ?? null,
    featured: v.featured ?? false,
    badgeNew: v.badgeNew ?? false,
    rating: v.rating ?? null,
    hd: v.hd ?? false,
  };
}

/* Slim public-listing variant of an AdminState: the same shape (so
   parseAdminState + buildEffective consume it unchanged), but each
   video keeps only what home/list/search pages and the player need —
   id, title, thumbnail, duration, views, age, category, tags,
   creator (model), channel, badges and the embed URL. Dropped per
   video: description, seoTitle, seoDescription, dateStr. Measured
   on the live 2026-11-27 backup (198 videos): the dropped fields
   are 26,916 B of the 209,323 B inner payload (~13% of the served
   233,847 B); the rest is tags/titles/thumbnails the listings
   genuinely need, so the slim variant cannot get much smaller
   without dropping data the cards render. Texts, buttons, SEO,
   taxonomy and deletedIds are kept whole (small, and the site
   cannot render without them). The admin panel must NEVER load or
   save this variant — a save from slim state would persist the
   dropped fields as null and wipe every video description. */
export function toSlimAdminState(admin: AdminState): AdminState {
  const slimVideo = (v: AdminVideo): AdminVideo => ({
    id: v.id,
    title: v.title,
    description: null,
    embedUrl: v.embedUrl,
    durationSec: v.durationSec,
    views: v.views,
    days: v.days,
    dateStr: null,
    creator: v.creator,
    channel: v.channel,
    category: v.category,
    tags: [...v.tags],
    thumbnailUrl: v.thumbnailUrl,
    seoTitle: null,
    seoDescription: null,
    featured: v.featured,
    badgeNew: v.badgeNew,
    rating: v.rating,
    hd: v.hd,
  });
  return {
    texts: { ...admin.texts },
    buttons: admin.buttons.map((b) => ({ ...b })),
    seo: { ...admin.seo },
    addedVideos: admin.addedVideos.map(slimVideo),
    overrides: Object.fromEntries(Object.entries(admin.overrides).map(([k, v]) => [k, slimVideo(v)])),
    deletedIds: [...admin.deletedIds],
    ads: admin.ads ? JSON.parse(JSON.stringify(admin.ads)) as AdsConfig : JSON.parse(JSON.stringify(DEFAULT_ADS)) as AdsConfig,
    taxonomy: JSON.parse(JSON.stringify(admin.taxonomy)) as AdminState["taxonomy"],
  };
}

function gradientFor(seed: string): [string, string] {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return CREATOR_GRADIENTS[Math.abs(h) % CREATOR_GRADIENTS.length] as [string, string];
}

export function dateFromDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function parseDateValue(s: string): { days: number; dateStr: string } | null {
  const t = s.trim();
  if (!t) return null;
  const toDays = (d: Date): { days: number; dateStr: string } | null => {
    if (isNaN(d.getTime())) return null;
    const days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000));
    return { days, dateStr: d.toISOString().slice(0, 10) };
  };
  /* YYYY-MM-DD first: Date() parses it, but an explicit match keeps
     "2024-12-25" from ever being read as MM/DD/YYYY. */
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toDays(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  /* DD/MM/YYYY and DD-MM-YYYY (the CSVs the owner pastes use day-first). */
  m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d.getTime()) && d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1) return toDays(d);
    return null;
  }
  /* Relative dates ("2 weeks ago", "3 days ago", "1 month ago",
     "yesterday", "today", "just now") — the form the source sites
     and the owner's sheets use. */
  const low = t.toLowerCase();
  if (low === "today" || low === "just now" || low === "now") return { days: 0, dateStr: new Date().toISOString().slice(0, 10) };
  if (low === "yesterday") return toDays(new Date(Date.now() - 86_400_000));
  m = low.match(/^(\d+)\s*(day|days|week|weeks|month|months|year|years)\s+ago$/);
  if (m) {
    const n = parseInt(m[1] as string, 10);
    const unit = m[2] as string;
    const days = unit.startsWith("day") ? n : unit.startsWith("week") ? n * 7 : unit.startsWith("month") ? n * 30 : n * 365;
    return toDays(new Date(Date.now() - days * 86_400_000));
  }
  /* Last resort: whatever Date() accepts ("Dec 25, 2024", ISO with a
     time, …). A bare "12/25/2024" lands here as MM/DD/YYYY. */
  return toDays(new Date(t));
}

export function parseDuration(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  /* Trailing "s" ("621s") and "Xm Ys" forms ("10m 21s", "1h 2m 3s"). */
  const unit = t.match(/^(?:(\d+)\s*h(?:ours?|rs?)?\s*)?(?:(\d+)\s*m(?:in(?:utes?)?)?\s*)?(?:(\d+)\s*s(?:ec(?:onds?)?)?)?$/i);
  if (unit && (unit[1] || unit[2] || unit[3])) {
    return (parseInt(unit[1] ?? "0", 10) * 3600) + (parseInt(unit[2] ?? "0", 10) * 60) + parseInt(unit[3] ?? "0", 10);
  }
  const parts = t.split(":").map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => isNaN(p))) return null;
  return parts.reduce((a, p) => a * 60 + p, 0);
}

export function parseViews(s: string): number | null {
  const m = s.trim().replace(/,/g, "").match(/^([\d.]+)\s*([kKmM])?$/);
  if (!m) return null;
  const n = parseFloat(m[1] as string);
  if (isNaN(n)) return null;
  const mult = m[2] ? (m[2].toLowerCase() === "m" ? 1_000_000 : 1000) : 1;
  return Math.round(n * mult);
}

/* Extracts a playable source from whatever was pasted into an embed field:
   a raw <iframe> embed code yields its src; YouTube watch/shorts/youtu.be
   and Vimeo page URLs become their embed players; direct media files are
   flagged so the player uses a <video> element. */
export function extractEmbedSrc(raw: string): string {
  const s = raw.trim();
  const m = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  return m && m[1] ? m[1].trim() : s;
}

export function resolveEmbed(raw: string): { kind: "iframe" | "file"; src: string } {
  let s = extractEmbedSrc(raw);
  if (s.startsWith("//")) s = `https:${s}`;
  /* A freepornvideo watch-page link (the URL in the browser bar on that
     site) is not the embed player — convert it to the /embed/ player URL,
     otherwise the iframe loads the whole watch page instead of a player. */
  const fpv = s.match(/freepornvideo\.sex\/xxx\/(\d+)/i);
  if (fpv && fpv[1]) return { kind: "iframe", src: `https://www.freepornvideo.sex/embed/${fpv[1]}` };
  /* Same for freepornvideos.xxx: a video-page link (/videos/<id>/…)
     is not the embed player — convert it to the /embed/ player URL. */
  const fx = s.match(/freepornvideos\.xxx\/videos\/(\d+)/i);
  if (fx && fx[1]) return { kind: "iframe", src: `https://www.freepornvideos.xxx/embed/${fx[1]}` };
  /* Same for YouPorn: a watch-page link (/watch/<id>/…) is not the
     embed player — convert it to the /embed/ player URL. */
  const yp = s.match(/youporn\.com\/watch\/(\d+)/i);
  if (yp && yp[1]) return { kind: "iframe", src: `https://www.youporn.com/embed/${yp[1]}/` };
  /* Same for XNXX: a watch-page link (/video-<id>/…) is not the embed
     player — convert it to the /embedframe/ player URL. */
  const xx = s.match(/xnxx\.com\/video-([\w-]+)/i);
  if (xx && xx[1]) return { kind: "iframe", src: `https://www.xnxx.com/embedframe/${xx[1]}` };
  /* Same for perfectgirls.xxx: a video-page link (/video/<id>/…) is
     not the embed player — convert it to the /embed/ player URL. The
     resolver then fetches the video page itself and pulls the direct
     playing link from it, so a pasted video-page link plays natively. */
  const pg = s.match(/perfectgirls\.xxx\/video\/(\d+)/i);
  if (pg && pg[1]) return { kind: "iframe", src: `https://www.perfectgirls.xxx/embed/${pg[1]}` };
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt && yt[1]) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };
  const vm = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm && vm[1]) return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(s)) return { kind: "file", src: s };
  return { kind: "iframe", src: s };
}

/* Imported video data arrives with HTML entities baked into its text
   fields (descriptions like "wife&#039;s … babe &amp; her husband" —
   measured on 98 of the owner's 198 imported videos). React escapes
   text on render, so those entities would show literally on the video
   page, in search and in the SEO description. Decode once, here, where
   admin data becomes site data, and every surface (cards, video page,
   admin lists, sitemap, JSON-LD) shows the real characters. &amp; is
   decoded last so an escaped entity like &amp;#039; stays literal. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _m; } })
    .replace(/&#(\d+);/g, (_m, n: string) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch { return _m; } })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
const decText = (s: string | null): string | null => (s == null ? null : decodeEntities(s));

/* Some sources hand back a video file as a video's "thumbnail" (the
   owner's XNXX import uses XNXX's preview.mp4). An <img> can never
   render it — the card would sit on the loading placeholder forever
   and og:image would point at a movie — so surfaces that show a
   thumbnail check the URL's type first and use a <video> preview (or
   no image at all) for these. */
export const isVideoFileUrl = (u: string): boolean => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u);

function adminToVideo(av: AdminVideo): Video {
  return {
    id: av.id,
    title: decText(av.title) ?? "Untitled video",
    duration: av.durationSec != null ? fmtDur(av.durationSec) : "",
    durationSec: av.durationSec ?? 0,
    views: av.views ?? 0,
    age: av.days != null ? ageFromDays(av.days) : "",
    days: av.days ?? 9999,
    rating: av.rating ?? 0,
    hd: av.hd,
    category: decText(av.category) ?? "Uncategorized",
    tags: (av.tags ?? []).map((t) => decodeEntities(t)),
    creator: decText(av.creator) ?? "",
    g: gradientFor(av.id + (av.title ?? "")),
    embedUrl: av.embedUrl,
    description: decText(av.description),
    thumbnailUrl: av.thumbnailUrl,
    seoTitle: decText(av.seoTitle),
    seoDescription: decText(av.seoDescription),
    featured: av.featured,
    badgeNew: av.badgeNew,
    channel: decText(av.channel),
    custom: true,
    hasViews: av.views != null,
    hasDate: av.days != null,
    hasRating: av.rating != null,
  };
}

export function videoToAdmin(v: Video): AdminVideo {
  return {
    id: v.id,
    title: v.title,
    description: v.custom ? v.description : null,
    embedUrl: v.embedUrl,
    durationSec: v.duration ? v.durationSec : null,
    views: v.hasViews ? v.views : null,
    days: v.hasDate ? v.days : null,
    dateStr: v.hasDate ? dateFromDays(v.days) : null,
    creator: v.creator || null,
    channel: v.channel,
    category: v.category,
    tags: [...v.tags],
    thumbnailUrl: v.thumbnailUrl,
    seoTitle: v.seoTitle,
    seoDescription: v.seoDescription,
    featured: v.featured,
    badgeNew: v.badgeNew,
    rating: v.hasRating ? v.rating : null,
    hd: v.hd,
  };
}

export function emptyAdminVideo(id: string): AdminVideo {
  return {
    id, title: null, description: null, embedUrl: null, durationSec: null, views: null,
    days: 0, dateStr: dateFromDays(0), creator: null, channel: null, category: null,
    tags: [], thumbnailUrl: null, seoTitle: null, seoDescription: null,
    featured: false, badgeNew: true, rating: null, hd: true,
  };
}

/* Merges the saved admin state over the built-in catalog. Every count is
   recomputed from the resulting video list, so admin pages and the public
   site always agree. */
export function buildEffective(admin: AdminState | null) {
  const tax = admin?.taxonomy;
  const catRen = tax?.categories.renamed ?? {};
  const modRen = tax?.models.renamed ?? {};
  const tagRen = tax?.tags.renamed ?? {};
  const chRen = tax?.channels.renamed ?? {};
  const ren = (map: Record<string, string>, v: string) => map[v] ?? v;
  const deletedIds = new Set(admin?.deletedIds ?? []);
  const overrides = admin?.overrides ?? {};

  type EffChannel = { name: string; videos: string; creator: string; g: [string, string] };
  const channels: EffChannel[] = [];
  for (const ch of CHANNELS) {
    if ((tax?.channels.deleted ?? []).includes(ch.name)) continue;
    channels.push({ name: ren(chRen, ch.name), videos: "0", creator: ren(modRen, ch.creator), g: ch.g });
  }
  for (const ca of tax?.channelsAdded ?? []) {
    if (!channels.some((c) => c.name === ca.name)) channels.push({ name: ca.name, videos: "0", creator: ren(modRen, ca.creator), g: gradientFor(ca.name) });
  }

  const vids: Video[] = [];
  for (const v of VIDEOS) {
    if (deletedIds.has(v.id)) continue;
    const ov = overrides[v.id];
    if (ov) {
      /* An override replaces a catalog video, but taxonomy renames
         still apply to it: renaming "Travel" must rename it
         everywhere the term appears, including admin-edited videos. */
      const ovv = adminToVideo(ov);
      ovv.category = ren(catRen, ovv.category);
      ovv.creator = ren(modRen, ovv.creator);
      ovv.tags = ovv.tags.map((t) => ren(tagRen, t));
      vids.push(ovv);
      continue;
    }
    vids.push({ ...v, category: ren(catRen, v.category), creator: ren(modRen, v.creator), tags: v.tags.map((t) => ren(tagRen, t)) });
  }
  /* Imported videos used to skip the rename mapping entirely — a
     renamed category/model/tag only changed on built-in videos, so
     the admin panel and the public site disagreed. Same mapping here. */
  const added = (admin?.addedVideos ?? []).map((av) => {
    const v = adminToVideo(av);
    v.category = ren(catRen, v.category);
    v.creator = ren(modRen, v.creator);
    v.tags = v.tags.map((t) => ren(tagRen, t));
    return v;
  });
  const videos = [...added, ...vids].sort((a, b) => Number(b.featured) - Number(a.featured));

  for (const v of videos) {
    if (v.channel) v.channel = ren(chRen, v.channel);
    else v.channel = channels.find((c) => c.creator !== "" && c.creator === v.creator)?.name ?? null;
    if (v.channel && !channels.some((c) => c.name === v.channel)) {
      channels.push({ name: v.channel, videos: "0", creator: v.creator, g: gradientFor(v.channel) });
    }
  }
  for (const ch of channels) ch.videos = String(videos.filter((v) => v.channel === ch.name || (ch.creator !== "" && v.creator === ch.creator)).length);

  const catNames: string[] = [];
  for (const c of CATEGORIES) {
    if ((tax?.categories.deleted ?? []).includes(c.name)) continue;
    const n = ren(catRen, c.name);
    if (!catNames.includes(n)) catNames.push(n);
  }
  for (const n of tax?.categories.added ?? []) if (!catNames.includes(n)) catNames.push(n);
  for (const v of videos) if (!catNames.includes(v.category)) catNames.push(v.category);
  const categories = catNames.map((name) => ({ name, count: String(videos.filter((v) => v.category === name || v.tags.includes(name.toLowerCase())).length) }));

  type EffCreator = { name: string; videos: number; followers: string; g: [string, string] };
  const creators: EffCreator[] = [];
  for (const c of CREATORS) {
    if ((tax?.models.deleted ?? []).includes(c.name)) continue;
    creators.push({ name: ren(modRen, c.name), videos: 0, followers: c.followers, g: c.g });
  }
  for (const n of tax?.models.added ?? []) if (!creators.some((c) => c.name === n)) creators.push({ name: n, videos: 0, followers: "0", g: gradientFor(n) });
  for (const v of videos) if (v.creator && !creators.some((c) => c.name === v.creator)) creators.push({ name: v.creator, videos: 0, followers: "0", g: gradientFor(v.creator) });
  for (const c of creators) c.videos = videos.filter((v) => v.creator === c.name).length;
  /* Most videos first, so the Models page ("Models Having Most
     Videos"), the home strip and the admin list all lead with the
     models that actually have videos instead of burying them behind
     empty entries. Stable sort: ties keep catalog order. */
  creators.sort((a, b) => b.videos - a.videos);
  /* Same for channels: busiest first on the Channels page and home. */
  channels.sort((a, b) => Number(b.videos) - Number(a.videos));

  const tagNames: string[] = [];
  for (const t of TAGS) {
    if ((tax?.tags.deleted ?? []).includes(t.name)) continue;
    const n = ren(tagRen, t.name);
    if (!tagNames.includes(n)) tagNames.push(n);
  }
  for (const n of tax?.tags.added ?? []) if (!tagNames.includes(n)) tagNames.push(n);
  for (const v of videos) for (const t of v.tags) if (!tagNames.includes(t)) tagNames.push(t);
  const tags = tagNames.map((name) => ({ name, count: videos.filter((v) => v.tags.includes(name) || v.category.toLowerCase() === name).length }));

  return { videos, categories, creators, channels, tags };
}

/* Junk tags stripped at import (exact matches only): single generic
   words the source sites attach to nearly every video. They add
   hundreds of near-empty tag pages to the sitemap and dilute the
   real tags. */
export const JUNK_TAGS = ["buy", "bought", "total", "part", "lady", "movie", "very", "woman", "first"];

export const slugify = (s: string) => {
  const clean = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  /* Non-Latin names (no [a-z0-9] at all) would sanitise to "" — fall
     back to a percent-encoded slug so the URL still resolves. */
  return clean || encodeURIComponent(s.trim().toLowerCase().replace(/\s+/g, "-"));
};

/* ---------------- SEO: sitemap & robots generation ----------------
   The sitemap is generated from the live effective catalog (built-in
   videos plus everything the admin panel added, minus deletes), so a
   newly added video, category, model, channel or tag appears in it
   automatically.

   Every published URL is a real path under the site root — never a
   hash fragment. Crawlers strip everything from "#" onward, so the
   old …#/video/… locations all collapsed to the home page and the
   sitemap was useless to them. The app itself is hash-routed (this
   runtime serves a single HTML entry), but on load it also resolves
   these path URLs back to the matching view (see pathRoute below),
   so each published URL opens the page it names wherever the host
   serves the app for that path. For the same reason robots.txt must
   never contain a "#": in robots.txt "#" starts a comment, so a line
   like "Disallow: /#/history" is parsed as "Disallow: /" — a block
   of the entire site. Hash routes are never sent to a server and
   cannot be disallowed there anyway, so the file simply allows
   everything and points at the sitemap. */

/* The site root (directory form) for an origin+pathname base: strips
   a trailing file segment such as index.html and ends with "/". */
const siteRoot = (base: string) => base.replace(/[^/?#]+\.[a-z0-9]+$/i, "").replace(/\/?$/, "/");

/* Canonical public URL of a route ("/video/<id>", "/categories/<slug>",
   "/" for home): a fragment-free path URL under the site root. */
export const publicUrl = (base: string, route: string) => `${siteRoot(base)}${route.replace(/^\//, "")}`;

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/* ISO date (YYYY-MM-DD) for a video whose age is tracked in days. */
export const isoDateFromDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() - Math.max(0, Math.floor(days))); return d.toISOString().slice(0, 10); };

/* ISO-8601 duration (PT#H#M#S) for structured data. */
export const isoDuration = (sec: number) => {
  if (!sec || sec <= 0) return undefined;
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
};

export type SitemapData = { videos: Video[]; categories: { name: string }[]; creators: { name: string }[]; channels: { name: string }[]; tags: { name: string; count: number }[] };

export function buildSitemapXml(base: string, d: SitemapData): string {
  const today = new Date().toISOString().slice(0, 10);
  /* A video's lastmod is its real date when known, otherwise the tag
     is omitted entirely: stamping every dateless video "today" would
     lie to crawlers on every fetch. Listing pages keep today. Two
     different names can sanitise to the same slug (e.g. "Rock & Roll"
     and "Rock and Roll"); the second URL is skipped so the sitemap
     never lists the same location twice. */
  const seen = new Set<string>();
  const url = (route: string, lastmod: string | null, freq: string, prio: string, extra?: string | null) => {
    const loc = publicUrl(base, route);
    if (seen.has(loc)) return "";
    seen.add(loc);
    return `  <url>\n    <loc>${xmlEsc(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>${extra ? `\n${extra}` : ""}\n  </url>`;
  };
  const out: string[] = [
    url("/", today, "daily", "1.0"),
    url("/most-popular", today, "daily", "0.8"),
    url("/latest-updates", today, "daily", "0.8"),
    url("/top-rated", today, "weekly", "0.7"),
    url("/longest", today, "weekly", "0.6"),
    url("/categories", today, "weekly", "0.8"),
    url("/models", today, "weekly", "0.8"),
    url("/channels", today, "weekly", "0.7"),
    url("/tags", today, "weekly", "0.7"),
  ];
  for (const v of d.videos) out.push(url(`/video/${v.id}`, v.hasDate ? isoDateFromDays(v.days) : null, "weekly", "0.9", videoSitemapBlock(base, v)));
  for (const c of d.categories) out.push(url(`/categories/${slugify(c.name)}`, today, "weekly", "0.7"));
  for (const c of d.creators) out.push(url(`/models/${slugify(c.name)}`, today, "weekly", "0.7"));
  for (const c of d.channels) out.push(url(`/channels/${slugify(c.name)}`, today, "weekly", "0.6"));
  /* Tag pages with fewer than 2 videos are near-empty listing pages:
     they bloat the sitemap (the old sitemap was 88% tag pages) and
     dilute crawl budget. */
  for (const t of d.tags) if (t.count >= 2) out.push(url(`/tag/${slugify(t.name)}`, today, "weekly", "0.6"));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${out.filter(Boolean).join("\n")}\n</urlset>\n`;
}

/* Google Video Sitemap entry for one video: a <video:video> block
   inside the video page's <url> entry, so crawlers can index the
   video itself even though the site is hash-routed and its JSON-LD is
   client-rendered — the served sitemap is the crawler-visible part of
   the VideoObject system. Only videos with a real image thumbnail
   get one: a .mp4 "thumbnail" is a movie, not an image, and
   thumbnail_loc must be an absolute image URL. player_loc is the
   page where the video plays — never a signed/expiring storage file
   URL. family_friendly is "no": the site declares an adult rating
   in its meta. */
export function videoSitemapBlock(base: string, v: Video): string | null {
  const thumb = v.thumbnailUrl;
  if (!thumb || isVideoFileUrl(thumb) || !/^https?:\/\//i.test(thumb)) return null;
  const title = v.title.replace(/\s+/g, " ").trim().slice(0, 100);
  const desc = (v.description?.replace(/\s+/g, " ").trim() || `Watch ${v.title} — streaming in HD on Pulse Video.`).slice(0, 2048);
  const lines = [
    `    <video:thumbnail_loc>${xmlEsc(thumb)}</video:thumbnail_loc>`,
    `    <video:title>${xmlEsc(title)}</video:title>`,
    `    <video:description>${xmlEsc(desc)}</video:description>`,
    `    <video:player_loc>${xmlEsc(publicUrl(base, `/video/${v.id}`))}</video:player_loc>`,
  ];
  if (v.durationSec > 0) lines.push(`    <video:duration>${Math.floor(v.durationSec)}</video:duration>`);
  if (v.hasDate) lines.push(`    <video:publication_date>${isoDateFromDays(v.days)}</video:publication_date>`);
  lines.push(`    <video:family_friendly>no</video:family_friendly>`);
  return `  <video:video>\n${lines.join("\n")}\n  </video:video>`;
}

export function buildRobotsTxt(base: string): string {
  /* No "#" anywhere in this file, not even in comments: "#" starts a
     comment in robots.txt, so the previous "Disallow: /#/…" lines were
     each read as "Disallow: /" and blocked the whole site. Private
     views (admin, history, profile, search) are hash routes — they
     are never sent to a server, so robots.txt cannot disallow them;
     the app keeps them out of the index with noindex meta instead. */
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${publicUrl(base, "/sitemap.xml")}`,
    "",
  ].join("\n");
}
