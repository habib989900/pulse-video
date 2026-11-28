import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { cardThumbUrl, fullThumbUrl, previewUrlFor } from "./thumb";
import {
  buildEffective, buildRobotsTxt, buildSitemapXml, fmtDur, fmtViews, isVideoFileUrl,
  isoDateFromDays, isoDuration, parseAdminState, publicUrl, resolveEmbed, slugify,
} from "../../lib/catalog";
import type { AdCreative, AdminState, Video } from "../../lib/catalog";

/* The admin panel is a separate chunk, loaded only when #/panel opens —
   the public site never downloads it. */
const AdminPanel = lazy(() => import("./AdminPanel").then((m) => ({ default: m.AdminPanel })));



const FEED_TABS = ["For you", "Trending", "New", "Top rated", "Longest"] as const;
const LETTERS = ["Popular", "0-9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#"];
const LANGS: { code: string; name: string }[] = [
  { code: "en", name: "English" }, { code: "es", name: "Español" }, { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" }, { code: "pt", name: "Português" }, { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" }, { code: "pl", name: "Polski" }, { code: "ru", name: "Русский" },
  { code: "tr", name: "Türkçe" }, { code: "ja", name: "日本語" }, { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" }, { code: "ar", name: "العربية" }, { code: "hi", name: "हिन्दी" },
  { code: "id", name: "Bahasa Indonesia" }, { code: "vi", name: "Tiếng Việt" }, { code: "th", name: "ไทย" },
  { code: "cs", name: "Čeština" }, { code: "sv", name: "Svenska" },
];
const LANG_CODES = new Set(LANGS.map((l) => l.code));

/* ---------------- Icons (inline SVG, Lucide-style paths) ---------------- */

const P: Record<string, string> = {
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a13.6 13.6 0 0 1 0 18M12 3a13.6 13.6 0 0 0 0 18",
  menu: "M4 6h16M4 12h16M4 18h10",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m7 4v5l3 2",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2m14-16.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  hash: "M9 3 7 21M17 3l-2 18M4 8h17M3 16h17",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  like: "M7 10v12H4a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h3Zm0 0 4.2-7.5c1.9 0 3.3 1.6 3 3.4L13.5 10H20a2 2 0 0 1 2 2.4l-1.2 7.6a2 2 0 0 1-2 1.7H7",
  dislike: "M17 14V2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3Zm0 0-4.2 7.5c-1.9 0-3.3-1.6-3-3.4L10.5 14H4a2 2 0 0 1-2-2.4L3.2 4A2 2 0 0 1 5.2 2.3H17",
  bookmark: "M6 3h12v18l-6-4-6 4Z",
  share: "M12 3v13m0-13L8 7m4-4 4 4M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7",
  comment: "M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z",
  download: "M12 3v12m0 0 4-4m-4 4-4-4M4 21h16",
  flag: "M5 21V4c4-2 7 2 12 0v9c-5 2-8-2-12 0",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 21a2 2 0 0 0 3.4 0",
  x: "M6 6l12 12M18 6 6 18",
  volume: "M11 5 6 9H3v6h3l5 4Zm4.5 2.5a5 5 0 0 1 0 9M18.5 5a9 9 0 0 1 0 14",
  mute: "M11 5 6 9H3v6h3l5 4Zm10 0-6 14M15 5l6 14",
  expand: "M8 3H3v5m18-5h-5m5 13v5h-5M3 16v5h5",
  compress: "M9 4v5H4m16 0h-5V4M4 15h5v5m6 0v-5h5",
  chevD: "m6 9 6 6 6-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  shield: "M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z",
  check: "m4 12.5 5 5L20 6.5",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13",
  pip: "M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Zm8 7h9v6h-9z",
  rewind: "M11 17l-5-5 5-5M18 17l-5-5 5-5",
  forward: "m13 17 5-5-5-5M6 17l5-5-5-5",
  theater: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm2 4.5h14",
  funnel: "M4 5h16l-6 7v5l-4 2v-7Z",
  back: "M19 12H5m0 0 6-6m-6 6 6 6",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4",
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  moon: "M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z",
};

const FILLED: Record<string, string> = {
  play: "M8 5.4v13.2c0 .8.9 1.3 1.6.9l10-6.6c.6-.4.6-1.4 0-1.8l-10-6.6c-.7-.4-1.6.1-1.6.9Z",
  pause: "M7 5h3.4v14H7zM13.6 5H17v14h-3.4z",
  star: "M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9Z",
  crown: "M5.4 18.6h13.2M4.2 8.4l4 3.3L12 6.4l3.8 5.3 4-3.3-1.4 9.2H5.6Z",
  heart: "M12 20.7C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.5 5c1.7 0 3.4.9 4.5 2.4C13.1 5.9 14.8 5 16.5 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.8Z",
  home: "M12 3.2 2.8 11h2.7v9h5v-6h3v6h5v-9h2.7Z",
  cat: "M12 3.4c1.9 0 3 .7 3.7 1.5 1.2-.5 2.6-1.2 4-1.5-.2 1.7-.9 3.2-1.9 4.4.6 1.2 1 2.6 1 4.2a7.3 7.3 0 1 1-14.6 0c0-1.6.4-3 1-4.2C4.2 6.6 3.5 5.1 3.3 3.4c1.4.3 2.8 1 4 1.5.7-.8 1.8-1.5 3.7-1.5Z",
};

export function Icon({ n, size = 22, className = "", tone = "default" }: { n: string; size?: number; className?: string; tone?: "default" | "accent" | "gold" }) {
  const glow = tone === "accent" ? "drop-shadow-[0_0_7px_rgba(91,141,239,.55)]" : tone === "gold" ? "drop-shadow-[0_0_7px_rgba(245,158,11,.5)]" : "";
  const f = FILLED[n];
  if (f) {
    const fill = tone === "accent" ? "url(#pg)" : tone === "gold" ? "url(#gg)" : "currentColor";
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} className={`${glow} ${className}`} aria-hidden="true">
        <path d={f} fillRule="evenodd" clipRule="evenodd" />
      </svg>
    );
  }
  const stroke = tone === "accent" ? "url(#pg)" : tone === "gold" ? "url(#gg)" : "currentColor";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={`${glow} ${className}`} aria-hidden="true">
      <path d={P[n] ?? ""} />
    </svg>
  );
}

function GradientDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="100%" stopColor="#5b8def" />
        </linearGradient>
        <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="55%" stopColor="#5b8def" />
          <stop offset="100%" stopColor="#1a56db" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LogoHeart({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="mx-0.5 shrink-0 drop-shadow-[0_2px_7px_rgba(91,141,239,.65)]" aria-hidden="true">
      <path d="M12 20.7C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.5 5c1.7 0 3.4.9 4.5 2.4C13.1 5.9 14.8 5 16.5 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.8Z" fill="url(#hg)" />
      <ellipse cx="8.4" cy="8.4" rx="2.7" ry="1.7" fill="#ffffff" opacity=".55" transform="rotate(-24 8.4 8.4)" />
    </svg>
  );
}

/* ---------------- SVG thumbnail art (no emoji) ---------------- */

const MOTIFS: Record<string, string[]> = {
  Travel: ["M4 19 10 8l4 6 3-4 3 9Z", "M17.5 5.5a2.5 2.5 0 1 0 0 .01Z", "M3 21h18"],
  Cooking: ["M4 15a8 6.5 0 0 1 16 0Z", "M2.5 18.5h19", "M12 8.5V6.8", "M10.5 5.2a1.6 1.6 0 1 1 3 0"],
  Fitness: ["M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"],
  Music: ["M9 18.5V6l10-2v11.5", "M6.5 18.5a2.8 2.5 0 1 0 0 .01ZM16.5 15.5a2.8 2.5 0 1 0 0 .01Z"],
  Documentary: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.5 9h17M3.5 15h17", "M9 3.5a13 13 0 0 1 0 17M15 3.5a13 13 0 0 0 0 17"],
  Gaming: ["M6 8h12a5 5 0 0 1 5 5c0 2.8-2.2 5-5 5-1.5 0-2.6-.6-3.6-1.7H9.6C8.6 17.4 7.5 18 6 18a5 5 0 0 1-5-5 5 5 0 0 1 5-5Z", "M7.5 11v4M5.5 13h4", "M16.5 11.5h.01M18.8 14h.01"],
  DIY: ["M14.5 5.5a4 4 0 0 1 5.3 5.3L9 21.6a2 2 0 0 1-2.8 0l-2.4-2.4a2 2 0 0 1 0-2.8L14.5 5.5Z", "M13 7l4 4"],
  Photography: ["M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 20 20.5H4A1.5 1.5 0 0 1 2.5 19V9.5A1.5 1.5 0 0 1 4 8Z", "M12 16.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z"],
  Art: ["M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-.8-.6-1.3-.6-2.1 0-.9.7-1.6 1.9-1.6H18a3.5 3.5 0 0 0 3.5-3.5C21.5 7 17.2 3.5 12 3.5Z", "M7.5 10.5h.01M10.5 7h.01M15.5 7.5h.01M8 15h.01"],
  Tech: ["M7 7h10v10H7z", "M10 2.5V7M14 2.5V7M10 17v4.5M14 17v4.5M2.5 10H7M2.5 14H7M17 10h4.5M17 14h4.5", "M10.5 10.5h3v3h-3z"],
  Gardening: ["M12 21v-8", "M12 13C12 9 9.5 6.5 5.5 6.5c0 4 2.5 6.5 6.5 6.5Z", "M12 11c0-3.5 2.2-5.7 6-5.7 0 3.8-2.2 6-6 5.7Z", "M5 21h14"],
  Comedy: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8 14.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4", "M9 9.5h.01M15 9.5h.01"],
};
const MOTIF_FALLBACK = ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M10 8.8v6.4L15.5 12Z"];

/* Per-tag glyphs: the scene is chosen by the video's own first tag first, so two
   videos in the same category rarely share a glyph. */
const TAG_GLYPHS: Record<string, string[]> = {
  "seasonal": ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"],
  "zero waste": ["M12 3.5 15 8H9Z", "M15 8a6.5 6.5 0 0 1 1 7.5l2.2-1-1 3.4-3.6-1.4A6.5 6.5 0 0 1 8.5 15L6 16.5l.8-3.6 2.7 1.6A6.5 6.5 0 0 1 9 8"],
  "garden": ["M12 21v-8", "M12 13C12 9 9.5 6.5 5.5 6.5c0 4 2.5 6.5 6.5 6.5Z", "M12 11c0-3.5 2.2-5.7 6-5.7 0 3.8-2.2 6-6 5.7Z"],
  "makeover": ["m3.5 11 8.5-7 8.5 7", "M6 9.5V20h12V9.5", "M10.5 20v-5h3v5"],
  "budget": ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "M12 6.5v11M15 8.6c-.6-.8-1.7-1.2-3-1.2-1.8 0-3 .9-3 2.2 0 2.9 6.1 1.5 6.1 4.4 0 1.3-1.3 2.2-3.1 2.2-1.3 0-2.5-.5-3.1-1.3"],
  "tutorial": ["M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.7A1.7 1.7 0 0 0 5 19.7Z", "M5 18.5V4.5", "M9 8h6M9 11.5h4"],
  "city guide": ["M5 21V8.5L12 4l7 4.5V21", "M9.5 21v-4h5v4", "M9 10.5h.01M15 10.5h.01M12 13.5h.01"],
  "walking tour": ["M13 3.5a1.8 1.8 0 1 0 0 .01Z", "m10 21 1.2-4.5L9 13l1-4.5 3.5 2L15 14", "m11.2 16.5-2 4.5M13.5 10.5l2.5-1 2 3"],
  "quick meals": ["M12 20.5a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M12 7v5l3.5 2"],
  "baking": ["M4 20.5h16M5 20.5c0-4 3-6 7-6s7 2 7 6", "M12 14.5c0-3 1-5.5 4-7", "M8.5 8.5c1-1.8 4-2.2 5.5-.8"],
  "home workout": ["M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"],
  "strength": ["M7 8.5 4 12l3 3.5M17 8.5 20 12l-3 3.5", "M7 12h10", "m10 5-1.5 7L10 19M14 5l1.5 7L14 19"],
  "lofi": ["M4 15a8 8 0 0 1 16 0Z", "M2.5 18.5h19", "M9 8c0-2 6-2 6 0"],
  "jazz": ["M14 4.5v9.8a3.8 3.8 0 1 1-2-3.2V7L8.5 8.5V16a3.8 3.8 0 1 1-2-3.2V6.8Z"],
  "history": ["M4 21h16M5.5 21v-9M10 21v-9M14 21v-9M18.5 21v-9", "m3 12 9-7.5L21 12Z", "M5 8.8h14"],
  "explained": ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "M9.5 9.2A2.6 2.6 0 1 1 12 12.5v1", "M12 16.8h.01"],
  "speedrun": ["M5 19.5a9 9 0 1 1 14 0", "M12 12l4.5-4.5", "M12 12h.01", "M9 3.5h6"],
  "live": ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M8.2 8.2a5.5 5.5 0 0 0 0 7.6M15.8 8.2a5.5 5.5 0 0 1 0 7.6M5.6 5.6a9.4 9.4 0 0 0 0 12.8M18.4 5.6a9.4 9.4 0 0 1 0 12.8"],
  "woodwork": ["M4 20 14.5 9.5M14.5 9.5 20 4l-1 6.5L12.5 12", "m13 11-2.5 2.5L17 20l2.5-2.5Z"],
  "restoration": ["M14.5 5.5a4 4 0 0 1 5.3 5.3L9 21.6a2 2 0 0 1-2.8 0l-2.4-2.4a2 2 0 0 1 0-2.8L14.5 5.5Z", "M13 7l4 4"],
  "street": ["M4 20.5 9 10l4 6 3-4 4 8.5Z", "M17.5 5.5a2.5 2.5 0 1 0 0 .01Z"],
  "composition": ["M4 4h16v16H4z", "M9.5 4v16M4 9.5h16M4 15h5.5M14.5 15H20M14.5 9.5H20"],
  "digital art": ["M5 19.5 18.5 6a2 2 0 0 0-2.8-2.8L5 16.7Z", "m14 7 3 3", "M4 21.5c1-3.5 1.8-5 3.5-6.5L9 18c-1.5 1.7-3 2.5-5 3.5Z"],
  "portrait": ["M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M5 20.5c.8-3.4 3.6-5 7-5s6.2 1.6 7 5"],
  "desk setup": ["M3.5 5h17v10h-17z", "M9.5 19.5h5M12 15v4.5", "M7 18.8h10"],
  "tech": ["M7 7h10v10H7z", "M10 2.5V7M14 2.5V7M10 17v4.5M14 17v4.5M2.5 10H7M2.5 14H7M17 10h4.5M17 14h4.5"],
  "comedy": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8 14.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4", "M9 9.5h.01M15 9.5h.01"],
  "sketch": ["M4.5 6.5h15M4.5 12h15M4.5 17.5h9", "M18.5 15.5 21 18l-2.5 2.5L16 18Z"],
  "documentary": ["M4 5.5h16v13H4z", "M4 9.5h16M8 5.5v13M16 5.5v13"],
  "nature": ["M6 20.5c0-8 5-13.5 13-14.5C18 14.5 13.5 20 6 20.5Z", "M6 20.5C8 15 11.5 11 16 8.5"],
  "science": ["M10 3h4M11 3v6L5.8 18a2 2 0 0 0 1.8 3h8.8a2 2 0 0 0 1.8-3L13 9V3", "M8 15h8"],
  "4k": ["M7 15.5v-7L4 15.5h3Zm0 0h3.5M14 8.5v7m0-3.5 3.5-3.5M14 12l4 3.5"],
  "asmr": ["M4 10v4h3l5 4.5v-13L7 10H4Z", "M15.5 9.5a4 4 0 0 1 0 5M18 7a8 8 0 0 1 0 10"],
  "beginner": ["M12 21v-9", "M12 12C12 8.8 9.8 6.5 6 6.5c0 3.8 2.2 6 6 5.5Z", "M12 10.5c0-3 1.8-4.8 5-4.8 0 3.2-1.8 5-5 4.8Z", "M6 21h12"],
  "vlog": ["M3.5 8.5A1.5 1.5 0 0 1 5 7h9a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 14 17H5a1.5 1.5 0 0 1-1.5-1.5Z", "m15.5 10.5 5-2.5v8l-5-2.5"],
  "workout": ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "m8.5 12.5 2.5 2.5 4.5-5.5"],
  "gaming": ["M6 8h12a5 5 0 0 1 5 5c0 2.8-2.2 5-5 5-1.5 0-2.6-.6-3.6-1.7H9.6C8.6 17.4 7.5 18 6 18a5 5 0 0 1-5-5 5 5 0 0 1 5-5Z", "M7.5 11v4M5.5 13h4"],
  "yoga": ["M12 5.5a1.9 1.9 0 1 0 0 .01Z", "M12 9.5c-1 2.5-3 4-5.5 4.5 2 1.5 4 2 5.5 2s3.5-.5 5.5-2C15 13.5 13 12 12 9.5Z", "M5 20.5c2.5-1.5 4.5-2 7-2s4.5.5 7 2"],
  "timelapse": ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "M12 6.5V12l4 2.5", "M18.5 3.5 21 6l-2.5 2.5"],
  "photography": ["M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 20 20.5H4A1.5 1.5 0 0 1 2.5 19V9.5A1.5 1.5 0 0 1 4 8Z", "M12 16.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z"],
};

function Motif({ v, big }: { v: Video; big?: boolean }) {
  const paths = TAG_GLYPHS[v.tags[0] ?? ""] ?? MOTIFS[v.category] ?? MOTIF_FALLBACK;
  const seed = v.id.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const cx = 18 + (seed % 60);
  const cy = 14 + (seed % 30);
  /* Per-video variant: rotation, scale, position, stroke and backdrop shapes all
     derive from the video id, so no two cards share the same scene. */
  const rot = (seed % 25) - 12;
  const sw = 1.45 + ((seed >> 9) % 50) / 100;
  const ridge = 34 + (seed % 14);
  const dots = [0, 1, 2, 3].map((i) => ({ x: 8 + ((seed >> (i * 3)) % 84), y: 6 + ((seed >> (i * 4 + 1)) % 12), r: 0.7 + ((seed >> i) % 10) / 12 }));
  /* Three distinct scene layouts rotate per video: centred emblem, left emblem
     with a backdrop ring, or flipped right emblem over diagonal rays. */
  const variant = seed % 3;
  const layout = variant === 0
    ? { dx: 38, dy: 16.1, scale: 1, flip: 1 }
    : variant === 1
      ? { dx: 10, dy: 13.5, scale: 1.3, flip: 1 }
      : { dx: 54, dy: 18.5, scale: 0.92, flip: -1 };
  return (
    <svg viewBox="0 0 100 56.25" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx={cx} cy={cy} r={big ? 17 : 15} fill="#ffffff" opacity="0.10" />
      <circle cx={100 - cx * 0.7} cy={50 - cy * 0.5} r={big ? 10 : 8} fill="#000000" opacity="0.14" />
      {variant === 1 && <circle cx={76} cy={26} r={15} fill="none" stroke="#ffffff" strokeWidth="1.4" opacity="0.30" />}
      {variant === 2 && <g stroke="#ffffff" strokeWidth="1.1" opacity="0.22"><path d="M6 50 30 6" /><path d="M18 52 40 8" /><path d="M30 54 50 12" /></g>}
      {variant === 0 && <rect x={6} y={7} width={88} height={42} rx={5} fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.16" />}
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#ffffff" opacity="0.35" />)}
      <g transform={`translate(${layout.dx} ${layout.dy}) rotate(${rot} 12 12) scale(${layout.flip * layout.scale} ${layout.scale})`} fill="none" stroke="#ffffff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" opacity="0.92">
        {paths.map((d, i) => <path key={i} d={d} />)}
      </g>
      <path d={`M0 56.25 30 ${ridge}l22 10 20-12 28 12v8.25Z`} fill="#000000" opacity="0.18" />
    </svg>
  );
}

export function Thumb({ v, rank, wide, badge, priority }: { v: Video; rank?: number; wide?: boolean; badge?: string; priority?: boolean }) {
  /* Until the photo arrives, the tile's placeholder is ONLY a plain
     white background with the site logo centered on it — no tile art,
     no gradient, no motif behind the name (the owner asked for the
     pre-load image/art to be removed entirely). The photo fades in
     over it once loaded; a video with no photo, or one whose photo
     fails, keeps the white placeholder with the logo. */
  const [imgState, setImgState] = useState<"loading" | "ok" | "err">("loading");
  /* .xxx-style hover preview: for freepornvideos.xxx videos the source
     publishes a short preview clip; hovering the card plays it muted
     over the thumbnail. Other hosts have no preview clip. */
  const [hovered, setHovered] = useState(false);
  const preview = previewUrlFor(v);
  useEffect(() => { setImgState("loading"); }, [v.id, v.thumbnailUrl]);
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl [container-type:inline-size] ${wide ? "w-[84vw] max-w-[460px] sm:w-[430px]" : "w-full"}`} style={{ aspectRatio: "16/9", background: "#ffffff" }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {imgState !== "ok" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-1" aria-hidden="true">
          <span className="font-display thumb-name flex items-center justify-center font-black tracking-tight">
            <span className="text-[var(--accent)]">PULSE</span>
            <LogoHeart size={15} />
            <span className="text-black">VIDEO</span>
          </span>
        </span>
      )}
      {v.thumbnailUrl && imgState !== "err" && (isVideoFileUrl(v.thumbnailUrl) ? (
        /* The "thumbnail" is itself a video file (e.g. an XNXX
           preview.mp4): play it as a muted looping preview — an <img>
           would error and leave the placeholder up forever. */
        <video referrerPolicy="no-referrer" src={v.thumbnailUrl} width={640} height={360} muted loop autoPlay playsInline preload="metadata" onLoadedData={() => setImgState("ok")} onError={() => setImgState("err")} className={`absolute inset-0 h-full w-full object-cover ${priority ? "transition-none" : "transition-opacity duration-300"} ${imgState === "ok" ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
      ) : (
        <img src={cardThumbUrl(v.thumbnailUrl) ?? v.thumbnailUrl} alt="" width={392} height={294} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} onLoad={() => setImgState("ok")} onError={(e) => { const full = fullThumbUrl((e.currentTarget as HTMLImageElement).src); if (full && (e.currentTarget as HTMLImageElement).src !== full) { (e.currentTarget as HTMLImageElement).src = full; return; } setImgState("err"); }} className={`absolute inset-0 h-full w-full object-cover ${priority ? "transition-none" : "transition-opacity duration-300"} ${imgState === "ok" ? "opacity-100" : "opacity-0"}`} />
      ))}
      {hovered && preview && imgState === "ok" && (
        <video referrerPolicy="no-referrer" src={preview} muted loop autoPlay playsInline preload="auto" onCanPlay={(e) => { e.currentTarget.style.opacity = "1"; }} style={{ opacity: 0, transition: "opacity .3s" }} className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
      )}
      {rank != null && <span className="font-display absolute left-2 top-1 text-[42px] font-black leading-none text-[var(--accent)] drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]">{rank}</span>}
      {badge && <span className="absolute left-2 top-2 rounded-md bg-[var(--accent)] px-2 py-0.5 text-[11px] font-black tracking-wide text-white shadow">{badge}</span>}
      {v.hd && <span className="absolute bottom-2 left-2 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-black tracking-wide text-black shadow-md ring-1 ring-black/10">4K</span>}
      {v.duration && <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white shadow ring-1 ring-white/20">{v.duration}</span>}
    </div>
  );
}

function VideoCard({ v, onOpen, wide, rank, badge, hideMeta, priority, liked, onToggleLike, onOpenListing }: { v: Video; onOpen: (v: Video) => void; wide?: boolean; rank?: number; badge?: string; hideMeta?: boolean; priority?: boolean; liked?: boolean; onToggleLike?: () => void; onOpenListing?: (l: Listing) => void }) {
  const cardBadge = badge ?? (v.featured ? "FEATURED" : v.badgeNew ? "NEW" : undefined);
  /* .xxx shows the channel first, then every model, under the title —
     each a link to that model/channel page. */
  const models = [...new Set([v.creator, ...v.models].filter(Boolean))];
  const channel = v.channel;
  const wideCls = wide ? "w-[84vw] max-w-[460px] sm:w-[430px]" : "";
  return (
    <div className="group w-full text-left">
      <div className="relative">
        <button type="button" onClick={() => onOpen(v)} className="block w-full text-left transition duration-150 active:scale-[0.97] active:opacity-75" aria-label={`Watch: ${v.title}`}>
          <Thumb v={v} rank={rank} wide={wide} badge={cardBadge} priority={priority} />
        </button>
        {onToggleLike && (
          <button type="button" aria-label={liked ? "Unlike video" : "Like video"} aria-pressed={!!liked} onClick={(e) => { e.stopPropagation(); onToggleLike(); }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow transition active:scale-90">
            <Icon n="heart" size={17} tone={liked ? "accent" : "default"} />
          </button>
        )}
      </div>
      <button type="button" onClick={() => onOpen(v)} className={`mt-2 line-clamp-2 block text-left text-[13px] font-semibold leading-[1.35] text-white sm:text-sm ${wideCls}`}>{v.title}</button>
      {models.length > 0 && (
        <div className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-[13px] ${wideCls}`}>
          {channel && (onOpenListing ? (
            <button type="button" onClick={() => onOpenListing({ kind: "channel", name: channel })} className="font-semibold text-[var(--dim)] transition hover:text-[var(--accent)]">{channel}</button>
          ) : (
            <span className="font-semibold text-[var(--dim)]">{channel}</span>
          ))}
          {models.map((m) => (onOpenListing ? (
            <button key={m} type="button" onClick={() => onOpenListing({ kind: "creator", name: m })} className="font-medium text-[var(--accent)] transition hover:underline">{m}</button>
          ) : (
            <span key={m} className="font-medium text-[var(--accent)]">{m}</span>
          )))}
        </div>
      )}
      {!hideMeta && (v.hasRating || v.hasViews || v.hasDate) && (
        <span className={`mt-0.5 block text-xs text-[var(--dim)] sm:text-[13px] ${wideCls}`}>
          {v.hasRating && <span className="font-bold text-[var(--accent)]">{v.rating}%</span>}
          {v.hasRating && (v.hasViews || v.hasDate) ? " · " : null}
          {v.hasViews && `${fmtViews(v.views)} views`}
          {v.hasViews && v.hasDate ? " · " : null}
          {v.hasDate && v.age}
        </span>
      )}
    </div>
  );
}

/* Fullscreen that also works inside app frames. The site is shown
   inside the Muse app's frame, and a frame that does not grant the
   fullscreen permission makes every requestFullscreen() call reject —
   the button then looks dead and the video never gets big (the native
   controls' own fullscreen button is greyed out by the same policy,
   which is what the owner kept reporting). So the toggle walks a
   ladder: standard requestFullscreen on the player box, the
   webkit-prefixed variant, the iPhone video element's own fullscreen,
   and finally an in-page expanded mode — the box fixed over the whole
   app viewport, which needs no permission and always makes the video
   fill the screen the app gives it. The same button (then showing the
   compress icon) or Esc leaves either mode. Fullscreen shows ONLY the
   player box (the video and its control bar) — the box is the
   fullscreen element, so the title, tags, suggestions and every other
   page element stay out of it. Entering also tries to lock the screen
   to landscape (see lockLandscape); where that is unavailable and the
   expanded mode is what ran, a portrait viewport gets the box rotated
   90° instead (`rotated`), so the video still plays landscape. */
type FsBoxEl = HTMLDivElement & { webkitRequestFullscreen?: () => void | Promise<void> };
type FsVideoEl = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsRequester = (this: HTMLElement) => Promise<void> | undefined;
type FsOrientation = { lock?: (orientation: string) => Promise<void> | undefined; unlock?: () => void };

/* Auto-rotate on fullscreen (owner's rule, 2026-11-26): entering
   fullscreen tries to lock the screen to landscape, so the video plays
   sideways even while the phone is held portrait. The lock API only
   exists on some browsers (Android Chrome with a fullscreen element
   and a user gesture) and rejects everywhere else — iOS Safari has no
   lock at all — so every failure is swallowed and the in-page expanded
   mode below covers the rest by rotating the player box itself when
   the viewport is portrait. Leaving fullscreen unlocks again. */
function lockLandscape() {
  try {
    const so = (window.screen?.orientation ?? null) as unknown as FsOrientation | null;
    if (so && typeof so.lock === "function") {
      const p = so.lock("landscape");
      if (p && typeof p.catch === "function") p.catch(() => { /* lock not permitted on this device/browser */ });
    }
  } catch { /* orientation lock unavailable here */ }
}
function unlockOrientation() {
  try {
    const so = (window.screen?.orientation ?? null) as unknown as FsOrientation | null;
    if (so && typeof so.unlock === "function") so.unlock();
  } catch { /* nothing was locked */ }
}

function fsActiveElement(): Element | null {
  const doc = document as FsDoc;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function usePlayerFullscreen(boxRef: RefObject<HTMLDivElement | null>, videoRef?: RefObject<HTMLVideoElement | null>) {
  const [nativeFs, setNativeFs] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const onChange = () => {
      const active = fsActiveElement();
      setNativeFs(active === boxRef.current);
      /* Entering this box's fullscreen: try to swing the screen to
         landscape. Leaving fullscreen entirely: release the lock so
         the phone goes back to following how it is held. */
      if (active === boxRef.current) lockLandscape();
      else if (!active) unlockOrientation();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [boxRef]);
  useEffect(() => {
    if (!expanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); };
  }, [expanded]);
  /* In-page expanded mode cannot ask the device to rotate, so when
     the viewport is portrait the box itself is rotated 90° instead
     (the caller applies the transform from `rotated`): the video
     still ends up landscape, filling the screen the app gives it.
     Turning the phone sideways flips this off and the plain
     full-viewport box takes over. */
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    if (!expanded) { setPortrait(false); return; }
    const update = () => setPortrait(window.innerHeight > window.innerWidth);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); };
  }, [expanded]);
  const rotated = expanded && portrait;
  const big = nativeFs || expanded;
  const toggle = async () => {
    if (nativeFs || fsActiveElement()) {
      const doc = document as FsDoc;
      const exit = (document.exitFullscreen ?? doc.webkitExitFullscreen) as ((this: Document) => Promise<void> | undefined) | undefined;
      if (typeof exit === "function") {
        try {
          const p = exit.call(document);
          if (p && typeof p.catch === "function") await p;
        } catch { /* already out of fullscreen */ }
      }
      setNativeFs(false);
      unlockOrientation();
      return;
    }
    if (expanded) { setExpanded(false); return; }
    const box = boxRef.current as FsBoxEl | null;
    if (box) {
      const req = (box.requestFullscreen ?? box.webkitRequestFullscreen) as FsRequester | undefined;
      if (typeof req === "function") {
        try {
          const p = req.call(box);
          if (p && typeof p.catch === "function") await p;
        } catch { /* permission denied by the app frame — fall through */ }
        if (fsActiveElement() === box) { lockLandscape(); return; }
        /* Older webkit builds report fullscreen a beat late. */
        await new Promise((r) => setTimeout(r, 80));
        if (fsActiveElement() === box) { lockLandscape(); return; }
      }
    }
    const vid = videoRef?.current as FsVideoEl | null | undefined;
    if (vid && typeof vid.webkitEnterFullscreen === "function") {
      try { vid.webkitEnterFullscreen(); return; } catch { /* fall through to expanded mode */ }
    }
    setExpanded(true);
  };
  return { big, expanded, rotated, toggle: () => { void toggle(); }, collapse: () => setExpanded(false) };
}

/* Rotating loading spinner shown over the player until playback
   actually starts, and again whenever the video stalls to buffer.
   Pointer-events are off so taps still reach the video / play button
   underneath. */
function PlayerSpinner({ label = "Loading video" }: { label?: string }) {
  return (
    <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" role="status" aria-label={label}>
      <svg className="pv-spinner" width="52" height="52" viewBox="0 0 50 50" fill="none" aria-hidden="true">
        <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,.25)" strokeWidth="5" />
        <path d="M45 25a20 20 0 0 0-20-20" style={{ stroke: "var(--accent)" }} strokeWidth="5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/* A banner ad slot, driven by the admin Ads config. Renders nothing
   while the slot is off or has no content: an image (linked when the
   admin set a click URL) or raw ad-network HTML pasted by the admin,
   which runs exactly as pasted — that is how networks deliver. */
function AdSlot({ ad, label }: { ad: AdCreative | undefined; label: string }) {
  if (!ad?.enabled) return null;
  if (ad.kind === "html") {
    if (!ad.html.trim()) return null;
    return <div aria-label={label} className="mt-4 overflow-hidden rounded-xl" dangerouslySetInnerHTML={{ __html: ad.html }} />;
  }
  if (ad.kind !== "image" || !ad.mediaUrl.trim()) return null;
  const img = <img src={ad.mediaUrl} alt="Advertisement" loading="lazy" referrerPolicy="no-referrer" className="w-full rounded-xl" />;
  return (
    <div aria-label={label} className="mt-4">
      <span className="mb-1 block text-right text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">Ad</span>
      {ad.linkUrl.trim() ? <a href={ad.linkUrl} target="_blank" rel="noopener noreferrer sponsored">{img}</a> : img}
    </div>
  );
}

/* The skippable pre-roll ad: image or video, filling the player box.
   The Skip button appears only after the admin's countdown
   (default 5s); a finished video ad also ends the pre-roll. Tapping
   the creative opens its link in a new tab. While this shows, the
   player underneath stays paused — the viewer cannot start the video
   until the ad is skipped or finishes. */
function PrerollAd({ ad, onDone }: { ad: AdCreative; onDone: () => void }) {
  const total = Math.max(0, Math.min(30, Math.floor(ad.skipAfterSec || 5)));
  const [left, setLeft] = useState(total);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const canSkip = left <= 0;
  const openLink = () => { if (ad.linkUrl.trim()) window.open(ad.linkUrl, "_blank", "noopener"); };
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-black" role="region" aria-label="Advertisement">
      <button type="button" onClick={openLink} className="relative min-h-0 flex-1 overflow-hidden" aria-label="Advertisement — tap to open">
        {ad.kind === "video" && ad.mediaUrl.trim() ? (
          <video src={ad.mediaUrl} autoPlay muted playsInline onEnded={onDone} onError={() => setLeft(0)} className="h-full w-full object-contain" />
        ) : (
          <img src={ad.mediaUrl} alt="Advertisement" className="h-full w-full object-contain" />
        )}
      </button>
      <div className="flex shrink-0 items-center justify-between bg-black px-3 py-2.5 text-white">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Advertisement</span>
        {canSkip ? (
          <button type="button" onClick={onDone} className="rounded-full bg-white px-4 py-2 text-sm font-black text-black transition active:scale-95">Skip Ad</button>
        ) : (
          <span className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">Skip in {left}s</span>
        )}
      </div>
    </div>
  );
}

/* Playback speeds offered by the speed menu in both players. */
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/* A speed menu that looks and feels like the existing quality gear
   menu: same dark popover, same check mark on the active choice. */
function SpeedMenu({ speed, open, onToggle, onSelect }: { speed: number; open: boolean; onToggle: () => void; onSelect: (s: number) => void }) {
  return (
    <span className="relative">
      <button type="button" aria-label={`Playback speed ${speed}x`} aria-haspopup="menu" aria-expanded={open} onClick={onToggle} className="p-1.5 text-sm font-bold">{speed}x</button>
      {open && (
        <span role="menu" aria-label="Playback speed" className="absolute bottom-full right-0 z-20 mb-2 block w-44 overflow-hidden rounded-xl bg-[#17171c] py-1 text-left shadow-xl ring-1 ring-white/15">
          <span className="block px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">Playback speed</span>
          {SPEED_OPTIONS.map((s) => (
            <button key={s} type="button" role="menuitemradio" aria-checked={speed === s} onClick={() => onSelect(s)} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold transition hover:bg-white/10">
              <span className="flex w-4 shrink-0 justify-center">{speed === s && <Icon n="check" size={15} />}</span>{s === 1 ? "Normal" : `${s}x`}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/* Controls auto-hide (YouTube-style): while playing and no menu is
   open, the control bar fades out ~3s after the last mouse/touch
   activity and comes back on the next movement or tap. Paused, or
   with a menu open, the controls stay visible. `poke` is wired to the
   player box's mousemove/touchstart and also resets the timer. */
function useAutoHideControls(active: boolean, menuOpen: boolean) {
  const [hidden, setHidden] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const poke = useCallback(() => {
    setHidden(false);
    window.clearTimeout(timer.current);
    if (active && !menuOpen) timer.current = window.setTimeout(() => setHidden(true), 3000);
  }, [active, menuOpen]);
  useEffect(() => {
    if (!active || menuOpen) { window.clearTimeout(timer.current); setHidden(false); return; }
    timer.current = window.setTimeout(() => setHidden(true), 3000);
    return () => window.clearTimeout(timer.current);
  }, [active, menuOpen]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { hidden, poke };
}

/* Double-tap / double-click seek: one tap toggles play, but the toggle
   is held ~300ms so a second tap on the same half can seek instead —
   left half -10s, right half +10s — with a brief "-10s"/"+10s" flash.
   A second tap on the other half is treated as a fresh first tap. */
function useTapSeek(onSeek: (seconds: number) => void, onToggle: () => void) {
  const [flash, setFlash] = useState<{ side: "left" | "right"; text: string; key: number } | null>(null);
  const lastTap = useRef<{ t: number; side: "left" | "right" } | null>(null);
  const pending = useRef<number | undefined>(undefined);
  const flashTimer = useRef<number | undefined>(undefined);
  const seekRef = useRef(onSeek);
  seekRef.current = onSeek;
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;
  useEffect(() => () => { window.clearTimeout(pending.current); window.clearTimeout(flashTimer.current); }, []);
  const handleTap = (clientX: number, rect: DOMRect) => {
    const side = clientX - rect.left < rect.width / 2 ? "left" : "right";
    const now = Date.now();
    const last = lastTap.current;
    if (last && now - last.t < 300 && last.side === side) {
      window.clearTimeout(pending.current);
      lastTap.current = null;
      const sec = side === "left" ? -10 : 10;
      seekRef.current(sec);
      setFlash({ side, text: `${sec > 0 ? "+" : "-"}${Math.abs(sec)}s`, key: now });
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 700);
      return;
    }
    lastTap.current = { t: now, side };
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => { toggleRef.current(); }, 300);
  };
  return { handleTap, flash };
}

/* The "-10s" / "+10s" flash shown on a double-tap seek. */
function SeekFlash({ flash }: { flash: { side: "left" | "right"; text: string; key: number } | null }) {
  if (!flash) return null;
  return (
    <span key={flash.key} className={`pv-seek-flash pointer-events-none absolute top-1/2 z-30 flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/70 px-3 py-1.5 text-sm font-bold text-white ${flash.side === "left" ? "left-4" : "right-4"}`} aria-hidden="true">
      <Icon n={flash.side === "left" ? "rewind" : "forward"} size={16} />{flash.text}
    </span>
  );
}

/* Keyboard shortcuts must not fire while the viewer is typing, picking
   from a select, or sitting on a control that uses the key itself
   (Space/Enter on a button, arrows on a range slider). */
function shortcutTargetBlocked(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return true;
  return false;
}

/* Real 16:9 player for admin-added videos that carry an embed source.
   Catalog videos (no embed) keep the SVG-art player.
   Playback note: freepornvideo.sex (a KVS player) only serves its video
   file to a request carrying the session cookies the embed page set —
   verified directly: the same signed file URL returns 403 without those
   cookies and 302 with them, and the 302 target (a storage URL) then
   plays from any client with no cookies at all. Browsers and app webviews
   that block third-party cookies inside cross-site iframes therefore load
   the embed's player shell but never the video. So for that host the
   resolveEmbedFile action fetches the embed page server-side, follows the
   one gated hop, and hands back the storage URLs, which play here in a
   native <video> player.
   Speed: the embed's main file is the full-quality original (measured at
   260 MB – 3.7 GB per video on the owner's catalog), so playback starts
   on the embed's fast alt stream (480p, ~4–20x smaller).
   Resolutions (owner's rule, 2026-11-26): the quality menu — the gear
   on the player and the pills under it — lists EVERY stream the
   source offers for the video, under the source's own labels, and
   nothing it does not offer. freepornvideo publishes exactly two
   files (480p alt + the "Original" main). XNXX publishes two MP4s
   (240p/360p on the owner's video) plus an HLS master playlist
   (setVideoHLS) whose variants run to 1080p; the resolver merges
   both into one ascending list (MP4 wins at a shared height) and the
   playlist streams play through hls.js where the browser has no
   native HLS. Switching streams keeps the viewer's place.
   Attempt order (owner's rule, 2026-11-28): a video is tried as m3u8
   first, then mp4, and only then the source's embed player — inside
   each format the resolution closest to 480p goes first, so playback
   still starts at the familiar fast quality. A stream that errors
   moves to the next untried stream in that order (proxied, then
   direct); the embed iframe is the last resort, after every stream
   has failed and one re-resolve. A source with no playlists
   (freepornvideo, freepornvideos.xxx) simply starts at its mp4.
   Stability: the playing URL is PINNED in state — every like/save/history
   save invalidates all queries server-side, and each fresh resolve mints
   a new signed URL; feeding that straight into <video src> restarted
   playback from zero mid-watch. A refetch may only replace the pinned
   URL after the viewer switches quality, the chain moves to the next
   stream, or the one re-resolve after the chain is exhausted (a
   signed URL can expire mid-watch): then the player re-resolves once,
   re-arms the chain from its first stream, resumes at the same
   position, and only when the chain is exhausted again falls back to
   the source iframe — sandboxed without top-navigation or popups, so
   the embed's ad scripts cannot throw the viewer off the page. Under
   the iframe a bar opens the same embed in a new tab (first-party
   there, so its cookies work).
   XNXX embeds (added 2026-11-26, after the owner hit its "Blocked
   content. Contact the site owner to fix" refusal on a newly added
   video): that host's player blocks playback inside third-party frames
   outright, but its embed page names the direct MP4 files
   (setVideoUrlLow / setVideoUrlHigh), which answer 206 video/mp4 to a
   cookie-less request — so resolveEmbedFile resolves XNXX embeds the
   same way and they play in this same native player, starting on the
   low file, with every published resolution in the quality menu. */

/* Video proxy (Cloudflare Worker pulse-video-proxy, 2026-11-27):
   resolved streams play through the proxy so privacy browsers
   (DuckDuckGo / Via / Soul) that block the source storage hosts as
   third-party trackers still play them — the video then comes from a
   neutral host, and HLS playlists are rewritten by the proxy so
   masters, variants and segments all flow through it too. Only hosts
   the proxy itself allows are wrapped (mirror of its allowlist);
   anything else plays direct, and a proxied stream that errors falls
   back to its direct URL once (see onVideoError). */
const VIDEO_PROXY = "https://pulse-video-proxy.sakibhabib890.workers.dev/";
const PROXY_HOSTS = /\.freepornvideo\.sex$|\.fpvcdn\.com$|\.ypncdn\.com$|\.xnxx-cdn\.com$|\.xnxx\.com$/i;
function proxiedStreamUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !PROXY_HOSTS.test(u.hostname)) return raw;
    return VIDEO_PROXY + "?u=" + encodeURIComponent(raw);
  } catch {
    return raw;
  }
}
/* Resolution height behind a stream label ("480p" → 480, "4k" →
   2160); labels with no height ("Original") sort last. */
function streamHeight(label: string): number {
  const m = label.match(/(\d{3,4})p/);
  if (m && m[1]) return parseInt(m[1], 10);
  if (/4k/i.test(label)) return 2160;
  return Number.POSITIVE_INFINITY;
}
function EmbedPlayer({ v, preroll }: { v: Video; preroll?: AdCreative }) {
  const emb = v.embedUrl ? resolveEmbed(v.embedUrl) : null;
  /* Embeds the resolveEmbedFile action can turn into direct files:
     freepornvideo (/embed/<id>), freepornvideos.xxx (/embed/<id>),
     XNXX (/embedframe/<id>), YouPorn (/embed/<id>) and
     perfectgirls.xxx (/embed/<id> — resolved from its video page:
     the page names the direct get_file links, which 302 to an HLS
     master with 360p/480p/720p; its storage sends ACAO: * and plays
     with no Referer, so it plays direct with no proxy) and joysporn.com
     (/view/<id> — its page carries signed per-quality MP4 URLs on
     vstor.top, 206 with no Referer). XNXX's own
     player refuses playback inside third-party frames ("Blocked
     content. Contact the site owner to fix"), so its videos must go
     through the same server-side resolution as the gated KVS embeds —
     the iframe below is only the fallback when resolution fails.
     freepornvideos.xxx offers 480p/720p/4k direct files; YouPorn
     resolves to HLS 480p/240p only — its direct MP4s demand a
     youporn.com Referer, which this site never sends. */
  const isGatedIframe = !!emb && emb.kind === "iframe" && (() => { try { const u = new URL(emb.src); return /(^|\.)freepornvideo\.sex$/i.test(u.hostname) || (/(^|\.)xnxx\.com$/i.test(u.hostname) && u.pathname.startsWith("/embedframe/")) || (/(^|\.)freepornvideos\.xxx$/i.test(u.hostname) && u.pathname.startsWith("/embed/")) || (/(^|\.)youporn\.com$/i.test(u.hostname) && u.pathname.startsWith("/embed/")) || (/(^|\.)perfectgirls\.xxx$/i.test(u.hostname) && u.pathname.startsWith("/embed/")) || (/(^|\.)joysporn\.com$/i.test(u.hostname) && u.pathname.startsWith("/view/")); } catch { return false; } })();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [fileFailed, setFileFailed] = useState(false);
  /* The stream the viewer picked, by LABEL: the quality menu offers
     every stream the source actually has (see resolveEmbedFile), and
     labels stay stable across re-resolves while the signed URLs
     behind them rotate. null = the source's default (fast) stream. */
  const [selLabel, setSelLabel] = useState<string | null>(null);
  const [pinned, setPinned] = useState<{ url: string; directUrl: string | null; viaProxy: boolean; label: string; hls: boolean; nonce: number } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [retries, setRetries] = useState(0);
  /* Skippable pre-roll ad (admin Ads config): shown once per video,
     covering the player box, before the viewer can start playback.
     While it shows, the video underneath stays paused and the iframe
     fallback is not mounted at all (its own player could otherwise
     start audio behind the ad). */
  const [prerollDone, setPrerollDone] = useState(false);
  const playAfterPreroll = useRef(false);
  const prerollAd = preroll && preroll.enabled && preroll.mediaUrl.trim() && (preroll.kind === "image" || preroll.kind === "video") ? preroll : null;
  const showPreroll = !!prerollAd && !prerollDone;
  const showPrerollRef = useRef(showPreroll);
  showPrerollRef.current = showPreroll;
  /* Fatal HLS network errors retry the load in place, at most twice —
     the old code retried forever and never reached the fallback. */
  const hlsNetRetries = useRef(0);
  /* Labels already attempted for this video in the m3u8 → mp4 chain:
     a stream that errored is never tried twice in one pass. Reset per
     video (see the v.id effect) and when a re-resolve mints fresh
     signed URLs for every stream. */
  const triedLabelsRef = useRef<Set<string>>(new Set());
  /* A re-resolve mints fresh signed URLs, but the pinned-stream effect
     would otherwise adopt the chain's first stream from the STALE data
     the moment the retry nonce changes (a background refetch keeps the
     old data until it lands). While armed, adoption waits until the
     query's data is actually newer than the data the failure came
     from; if the re-resolve itself fails, the player goes to the
     embed instead of waiting forever. */
  const freshAdoptRef = useRef<{ armed: boolean; dataAt: number }>({ armed: false, dataAt: 0 });
  /* Custom control-bar state for the native player. The video element
     no longer uses the browser's built-in controls: their fullscreen
     button (bottom-right of the bar, next to the volume icon — the one
     the owner circled in his screenshot) is greyed out by the app
     frame's fullscreen policy and cannot be wired to anything. Our own
     bar puts a working fullscreen button in that exact spot instead. */
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  /* Loading spinner state: `waiting` tracks the video element's own
     buffering (waiting/playing events); `started` keeps the spinner
     off the untouched poster + play button — it appears once playback
     has been asked for, stays until frames actually play, and returns
     whenever playback stalls mid-watch. */
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(true);
  /* On-screen quality settings menu (gear in the control bar). It
     drives the same selected-stream state as the quality pills under
     the player, so both controls always agree. */
  const [qMenuOpen, setQMenuOpen] = useState(false);
  /* Playback speed (same menu as the catalog player): applied to the
     element's playbackRate, re-applied on metadata load in case the
     element reloaded. */
  const [speed, setSpeed] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  /* Picture-in-Picture (native player only): tracked from the
     element's enter/leavepictureinpicture events; the button is
     hidden entirely where the browser has no PiP. */
  const [pipActive, setPipActive] = useState(false);
  const pipSupported = useMemo(() => { try { return !!document.pictureInPictureEnabled && typeof document.createElement("video").requestPictureInPicture === "function"; } catch { return false; } }, []);
  /* Theater mode (desktop only): full-viewport-width 16:9 player. */
  const [theater, setTheater] = useState(false);
  /* Seek bar: buffered ranges (fractions of duration) and the hover
     position/time for the tooltip. */
  const [buffered, setBuffered] = useState<{ s: number; e: number }[]>([]);
  const [seekHover, setSeekHover] = useState<{ pct: number; time: number } | null>(null);
  const seekBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  /* HLS streams (the extra resolutions some sources publish as
     playlists) play natively in Safari; everywhere else the hls.js
     attach effect below drives the same <video> element. The
     playlists and their segments are served with
     Access-Control-Allow-Origin: * (verified against the live CDN),
     and the pinned master URL runs through the video proxy, which
     rewrites the playlist so every segment flows through it too. */
  const nativeHls = useMemo(() => { try { return document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== ""; } catch { return false; } }, []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeRef = useRef<{ t: number; playing: boolean } | null>(null);
  useEffect(() => {
    setLoaded(false); setFileFailed(false); setSelLabel(null);
    setPinned(null); setRetryNonce(0); setRetries(0); resumeRef.current = null;
    hlsNetRetries.current = 0;
    triedLabelsRef.current = new Set();
    freshAdoptRef.current = { armed: false, dataAt: 0 };
    setPrerollDone(false); playAfterPreroll.current = false;
    /* A18: leaving a video always leaves in-page expanded fullscreen,
       so the next video never starts with the player covering it. */
    collapseFullscreen();
    setPlaying(false); setCurTime(0); setDuration(0);
    setStarted(false); setWaiting(true); setQMenuOpen(false);
    setSpeed(1); setSpeedMenuOpen(false); setPipActive(false); setTheater(false);
    setBuffered([]); setSeekHover(null);
  }, [v.id]);
  useEffect(() => {
    const el = videoRef.current;
    if (el) { el.volume = volume / 100; el.muted = muted; }
  }, [volume, muted]);
  /* Fullscreen is ours, not the embed's — see usePlayerFullscreen:
     the control-bar button grows the player box itself (real fullscreen
     where the app frame allows it, in-page expanded mode where it does
     not). There is deliberately no floating overlay button: the
     control bar's button is the only fullscreen control. */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const { big: isFs, expanded, rotated, toggle: toggleFullscreen, collapse: collapseFullscreen } = usePlayerFullscreen(boxRef, videoRef);
  /* Controls auto-hide: bar fades ~3s after the last activity while
     playing, never while paused or while the quality/speed menu is open. */
  const hide = useAutoHideControls(playing, qMenuOpen || speedMenuOpen);
  /* Seek-bar hover tooltip: the state used to update only on the seek
     button's own mousemove — but the control bar is pointer-events-none
     while auto-hidden, so a pointer already sitting over the button
     when the bar fades back in never fires a mousemove on it (the live
     test hovered three times and saw no tooltip). The hover is now
     tracked from the player box's own mousemove (which always fires)
     against the button's rect, and re-checked from the last known
     pointer position whenever the bar becomes visible again. */
  const updateSeekHover = useCallback((clientX: number, clientY: number) => {
    if (!(duration > 0)) { setSeekHover(null); return; }
    const r = seekBtnRef.current?.getBoundingClientRect();
    if (!r) { setSeekHover(null); return; }
    if (clientX < r.left || clientX > r.right || clientY < r.top - 8 || clientY > r.bottom + 8) { setSeekHover(null); return; }
    const pct = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    setSeekHover({ pct, time: (pct / 100) * duration });
  }, [duration]);
  useEffect(() => {
    if (hide.hidden) return;
    const p = lastPointer.current;
    if (p) updateSeekHover(p.x, p.y);
  }, [hide.hidden, updateSeekHover]);
  const fileQ = useQuery({
    queryKey: ["embedFile", v.id],
    queryFn: () => api.resolveEmbedFile({ embedUrl: emb ? emb.src : "" }),
    enabled: isGatedIframe,
    staleTime: 5 * 60_000,
    /* A single blip on a flaky mobile connection used to drop the
       viewer straight into the source's embed player: the resolve
       never retried. Two retries (a few seconds) ride out a stall;
       a genuinely unresolvable embed still falls back after them. */
    retry: 2,
  });
  /* Attempt order (owner's rule, 2026-11-28): a video is tried as
     m3u8 first, then mp4, and only then the source's embed player.
     Inside each format the resolution closest to 480p goes first, so
     playback still starts at the familiar fast quality. This order
     drives only the automatic chain (first stream + what an error
     moves to next); the quality menu still lists every stream the
     source offers, in the source's own order. */
  const attemptOrder = useMemo(() => {
    const list = fileQ.data?.streams ?? [];
    const byFormat = (a: (typeof list)[number], b: (typeof list)[number]) =>
      (a.hls === b.hls ? 0 : a.hls ? -1 : 1) ||
      Math.abs(streamHeight(a.label) - 480) - Math.abs(streamHeight(b.label) - 480) ||
      streamHeight(a.label) - streamHeight(b.label);
    return [...list].sort(byFormat);
  }, [fileQ.data]);
  /* Pin the stream the viewer actually watches. A background refetch
     (likes, saves and history all invalidate every query) returns a
     freshly signed URL for the same file — swapping it in would restart
     playback, so a new URL is adopted only for a quality switch, for
     the next stream in the m3u8 → mp4 chain after an error, or for the
     one re-resolve after the chain is exhausted (whose fresh URLs are
     adopted only once the new data has actually landed — see
     freshAdoptRef). */
  useEffect(() => {
    if (!isGatedIframe || fileFailed) return;
    /* A re-resolve that itself failed leaves no fresh data to adopt:
       the embed player is the last resort, not an endless wait. */
    if (freshAdoptRef.current.armed && fileQ.isError) {
      freshAdoptRef.current = { armed: false, dataAt: 0 };
      setFileFailed(true);
      return;
    }
    const d = fileQ.data;
    if (!d) return;
    /* While a re-resolve is in flight, do not adopt from the stale
       data the nonce bump just exposed — wait for the fresh data. */
    if (freshAdoptRef.current.armed && !(fileQ.dataUpdatedAt > freshAdoptRef.current.dataAt)) return;
    if (freshAdoptRef.current.armed) {
      /* Fresh data landed after the re-resolve: the chain restarts
         from its first stream with the fresh URLs. */
      freshAdoptRef.current = { armed: false, dataAt: 0 };
      triedLabelsRef.current = new Set();
    }
    const list = d.streams.length > 0 ? d.streams : d.fileUrl ? [{ url: d.fileUrl, label: d.fastLabel ?? "Video", hls: false }] : [];
    if (list.length === 0) return;
    const order = attemptOrder.length > 0 ? attemptOrder : list;
    const chosen = list.find((s) => s.label === selLabel) ?? order.find((s) => !triedLabelsRef.current.has(s.label)) ?? order[0];
    if (!chosen) return;
    /* Adopt the pin when the retry nonce changed even if the URL is
       identical (a re-resolve mints a fresh signed URL for the same
       file): the resume position is preserved via resumeRef. */
    if (!pinned || pinned.label !== chosen.label || pinned.nonce !== retryNonce) {
      const el = videoRef.current;
      if (el && pinned) resumeRef.current = { t: el.currentTime || 0, playing: !el.paused };
      triedLabelsRef.current.add(chosen.label);
      /* Play through the video proxy where the host allows it (see
         proxiedStreamUrl); directUrl is kept so a proxy failure can
         fall back to the direct file at the same position. */
      const proxied = proxiedStreamUrl(chosen.url);
      setPinned({ url: proxied, directUrl: chosen.url, viaProxy: proxied !== chosen.url, label: chosen.label, hls: chosen.hls, nonce: retryNonce });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileQ.data, fileQ.isError, selLabel, retryNonce, fileFailed, isGatedIframe, attemptOrder]);
  if (!emb) return null;
  /* A video-file "thumbnail" (XNXX preview.mp4) is not a usable poster
     or <img> — browsers reject it as a poster and error it as an image.
     The native player's own first frame covers that case instead. */
  const posterUrl = v.thumbnailUrl && !isVideoFileUrl(v.thumbnailUrl) ? v.thumbnailUrl : undefined;
  const nativeSrc = emb.kind === "file" ? emb.src : !fileFailed && pinned ? pinned.url : null;
  const resolving = isGatedIframe && !nativeSrc && !fileFailed && fileQ.isPending && fileQ.fetchStatus !== "idle";
  /* Every stream the source offers for this video, lowest first.
     The gear menu and the pills under the player list exactly these
     — a resolution the source does not publish never appears. */
  const streams = isGatedIframe ? (fileQ.data?.streams ?? []) : [];
  const multiStream = streams.length > 1;
  const activeLabel = pinned?.label ?? null;
  /* With hls.js driving the element, the .m3u8 URL must NOT sit in
     the src attribute (the browser would fail it as a media file) —
     the attach effect below owns the element instead. */
  const useHlsJs = !!pinned?.hls && !nativeHls;
  const onVideoError = () => {
    if (emb.kind === "file" || !isGatedIframe) return;
    /* The proxy sits between the viewer and the storage host: if the
       proxied stream itself errors, try the direct file once at the
       same position before moving on to the next format. */
    if (pinned?.viaProxy && pinned.directUrl && pinned.url !== pinned.directUrl) {
      const el = videoRef.current;
      if (el) resumeRef.current = { t: el.currentTime || 0, playing: !el.paused };
      setPinned({ ...pinned, url: pinned.directUrl, viaProxy: false });
      return;
    }
    /* m3u8 → mp4 → embed (owner's rule, 2026-11-28): the pinned
       stream failed, so move to the next stream the source offers
       that has not been tried yet — every playlist first, then every
       file — resuming at the same position. Only when every stream
       has failed does the player spend its one re-resolve, and only
       after that the source's embed player. */
    if (pinned) triedLabelsRef.current.add(pinned.label);
    const next = attemptOrder.find((s) => !triedLabelsRef.current.has(s.label));
    if (next) {
      const el = videoRef.current;
      if (el) resumeRef.current = { t: el.currentTime || 0, playing: !el.paused };
      setSelLabel(next.label);
      return;
    }
    if (retries >= 1) { setFileFailed(true); return; }
    /* The signed storage URL most likely expired — re-resolve once and
       resume where the viewer was instead of dumping them into the
       iframe (or worse, restarting the video from the beginning). The
       fresh resolve re-arms the whole chain from its first stream. */
    const el = videoRef.current;
    if (el) resumeRef.current = { t: el.currentTime || 0, playing: !el.paused };
    freshAdoptRef.current = { armed: true, dataAt: fileQ.dataUpdatedAt ?? 0 };
    setSelLabel(null);
    setRetries(1);
    setRetryNonce((n) => n + 1);
    void queryClient.invalidateQueries({ queryKey: ["embedFile", v.id] });
  };
  /* Attach hls.js whenever the pinned stream is a playlist and the
     browser cannot play HLS itself. A fatal network error retries
     the load once in place; anything else fatal takes the player's
     normal path (one re-resolve, then the iframe fallback). */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !pinned || !pinned.hls || nativeHls) return;
    let hls: import("hls.js").default | null = null;
    let cancelled = false;
    void import("hls.js").then((mod) => {
      if (cancelled || !videoRef.current) return;
      const Hls = mod.default;
      if (!Hls.isSupported()) { onVideoError(); return; }
      hls = new Hls();
      hls.loadSource(pinned.url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (hlsNetRetries.current < 2) { hlsNetRetries.current += 1; hls?.startLoad(); return; }
        }
        onVideoError();
      });
    }).catch(() => onVideoError());
    hlsNetRetries.current = 0;
    return () => { cancelled = true; if (hls) hls.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned?.url, pinned?.hls, nativeHls]);
  const onLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume / 100; el.muted = muted; el.playbackRate = speed;
    if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    setCurTime(el.currentTime || 0);
    if (playAfterPreroll.current) {
      /* Skipped the pre-roll before the stream had resolved: start
         the video now that it can play, instead of leaving the viewer
         on a paused poster with one more tap to go. */
      playAfterPreroll.current = false;
      resumeRef.current = null;
      setStarted(true);
      void el.play().catch(() => { /* autoplay policy — viewer taps play */ });
      return;
    }
    const r = resumeRef.current;
    if (!r) { setPlaying(!el.paused); return; }
    resumeRef.current = null;
    if (r.t > 0) { try { el.currentTime = r.t; } catch { /* position not seekable yet */ } }
    if (r.playing) void el.play().catch(() => { /* autoplay policy — viewer taps play */ });
    else setPlaying(false);
  };
  const togglePlay = () => {
    /* The pre-roll owns the screen while it shows: no play/pause
       behind it (keyboard Space/K reaches here even though the
       overlay covers the buttons). */
    if (showPrerollRef.current) return;
    const el = videoRef.current;
    if (!el) return;
    setQMenuOpen(false);
    if (el.paused || el.ended) { setStarted(true); void el.play().catch(() => { /* autoplay policy — viewer taps again */ }); }
    else el.pause();
  };
  /* Skipping the pre-roll starts the video: immediately when the
     element already exists, or as soon as it can play when the stream
     is still resolving (see onLoadedMetadata). */
  const skipPreroll = () => {
    setPrerollDone(true);
    const el = videoRef.current;
    if (el && nativeSrc) { setStarted(true); void el.play().catch(() => { /* autoplay policy — viewer taps play */ }); }
    else playAfterPreroll.current = true;
  };
  const seekTo = (clientX: number, bar: HTMLElement) => {
    const el = videoRef.current;
    if (!el || !(duration > 0)) return;
    const r = bar.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
    try { el.currentTime = t; } catch { /* position not seekable yet */ }
    setCurTime(t);
  };
  /* Relative seek (double-tap, keyboard) and volume step, both
     clamped to the media's own bounds. */
  const seekBy = (sec: number) => {
    const el = videoRef.current;
    if (!el) return;
    const base = Number.isFinite(el.currentTime) ? el.currentTime : curTime;
    const d = el.duration;
    const t = Math.min(Math.max(0, base + sec), Number.isFinite(d) && d > 0 ? d : base + sec);
    try { el.currentTime = t; } catch { /* position not seekable yet */ }
    setCurTime(t);
  };
  const changeVolume = (delta: number) => {
    setVolume((vol) => Math.min(100, Math.max(0, vol + delta)));
    setMuted(false);
  };
  const togglePip = async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await el.requestPictureInPicture();
    } catch { /* PiP denied or unavailable — the button just does nothing */ }
  };
  const updateBuffered = () => {
    const el = videoRef.current;
    if (!el || !(duration > 0)) return;
    try {
      const out: { s: number; e: number }[] = [];
      for (let i = 0; i < el.buffered.length; i++) out.push({ s: el.buffered.start(i) / duration, e: el.buffered.end(i) / duration });
      setBuffered(out);
    } catch { /* buffered ranges unreadable here */ }
  };
  /* Double-tap left/right halves to seek ∓10s; a single tap still
     toggles play (held ~300ms so the second tap can win). */
  const tap = useTapSeek(seekBy, togglePlay);
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (curTime / duration) * 100)) : 0;
  /* The spinner means "playback was asked for and frames are not
     moving yet" — never "paused". It used to be `waiting && started`
     with the center button suppressed while it showed: pausing during
     a stall left `waiting` set, so the big center button never came
     back and tapping it could not resume (the owner's report). Now a
     pause clears `waiting`, the spinner requires the element to be in
     a playing state, and the center button renders whenever the video
     is paused, above the spinner — one tap on it (or on the video, or
     on the control bar's play button) calls play() on the element and
     playback continues from the same position. */
  const showSpinner = waiting && started && playing;
  /* Keep the element's rate in step with the speed menu, including
     after a stream switch remounts the element. */
  useEffect(() => { const el = videoRef.current; if (el) el.playbackRate = speed; }, [speed, nativeSrc]);
  const togglePlayRef = useRef<() => void>(() => {});
  useEffect(() => { togglePlayRef.current = togglePlay; });
  const fsRef = useRef<() => void>(() => {});
  useEffect(() => { fsRef.current = toggleFullscreen; });
  /* PiP button state follows the element's own events (the viewer can
     also leave PiP from the floating window itself). */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    el.addEventListener("enterpictureinpicture", onEnter);
    el.addEventListener("leavepictureinpicture", onLeave);
    return () => { el.removeEventListener("enterpictureinpicture", onEnter); el.removeEventListener("leavepictureinpicture", onLeave); };
  }, [nativeSrc]);
  /* Esc leaves theater mode (fullscreen's own Esc is handled by
     usePlayerFullscreen). */
  useEffect(() => {
    if (!theater) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !expanded) setTheater(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [theater, expanded]);
  /* Theater is 100vw wide — and 100vw includes the vertical
     scrollbar's width, so the page overflowed horizontally and showed
     a bottom scrollbar (verified live). While theater is on, lock
     horizontal overflow on the document and restore it on exit. */
  useEffect(() => {
    if (!theater) return;
    const de = document.documentElement;
    const b = document.body;
    const prevDe = de.style.overflowX;
    const prevB = b.style.overflowX;
    de.style.overflowX = "hidden";
    b.style.overflowX = "hidden";
    return () => { de.style.overflowX = prevDe; b.style.overflowX = prevB; };
  }, [theater]);
  /* Keyboard shortcuts — native player only; the sandboxed iframe
     fallback cannot be driven from here, so shortcuts stay inert
     there (its own fullscreen button still works). Space/K play-pause,
     arrows ∓5s, J/L ∓10s, arrows up/down volume, F fullscreen, M mute,
     digits 0-9 jump to 0-90% of duration. */
  useEffect(() => {
    if (!nativeSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (shortcutTargetBlocked(e)) return;
      const el = videoRef.current;
      if (!el) return;
      const k = e.key;
      if (k === "Escape") {
        if (qMenuOpen) { setQMenuOpen(false); return; }
        if (speedMenuOpen) { setSpeedMenuOpen(false); return; }
        return;
      }
      if (k === " " || k === "k" || k === "K") {
        if (k === " " && (e.target as HTMLElement | null)?.tagName === "BUTTON") return;
        e.preventDefault();
        togglePlayRef.current();
      } else if (k === "ArrowLeft") { e.preventDefault(); seekBy(-5); }
      else if (k === "ArrowRight") { e.preventDefault(); seekBy(5); }
      else if (k === "j" || k === "J") seekBy(-10);
      else if (k === "l" || k === "L") seekBy(10);
      else if (k === "ArrowUp") { e.preventDefault(); changeVolume(10); }
      else if (k === "ArrowDown") { e.preventDefault(); changeVolume(-10); }
      else if (k === "f" || k === "F") fsRef.current();
      else if (k === "m" || k === "M") setMuted((m) => !m);
      else if (/^[0-9]$/.test(k)) {
        const d = el.duration;
        if (Number.isFinite(d) && d > 0) {
          try { el.currentTime = (Number(k) / 10) * d; } catch { /* position not seekable yet */ }
          setCurTime(el.currentTime || 0);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeSrc, qMenuOpen, speedMenuOpen]);
  return (
    <>
      <div ref={boxRef} onMouseMove={(e) => { hide.poke(); lastPointer.current = { x: e.clientX, y: e.clientY }; updateSeekHover(e.clientX, e.clientY); }} onTouchStart={hide.poke} className={`pv-darkzone pv-fs relative overflow-hidden bg-black ${expanded ? "fixed inset-0 z-[85] m-0 h-[100dvh] w-full" : theater ? "mt-3 rounded-none" : "-mx-4 mt-3 sm:mx-0 sm:rounded-xl"}`} style={expanded ? (rotated ? { width: "100dvh", height: "100dvw", left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(90deg)" } : undefined) : theater ? { aspectRatio: "16/9", width: "100vw", marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)" } : { aspectRatio: "16/9" }}>
        {nativeSrc ? (
          <>
            <video key={`${nativeSrc}:${pinned?.nonce ?? 0}`} ref={videoRef} referrerPolicy="no-referrer" src={useHlsJs ? undefined : nativeSrc} playsInline preload="auto" poster={posterUrl} onClick={(e) => tap.handleTap(e.clientX, e.currentTarget.getBoundingClientRect())} onPlay={() => { setPlaying(true); setStarted(true); }} onPause={() => { setPlaying(false); setWaiting(false); }} onEnded={() => { setPlaying(false); setWaiting(false); }} onWaiting={() => setWaiting(true)} onPlaying={() => { setPlaying(true); setWaiting(false); }} onCanPlay={() => { const el = videoRef.current; if (el && !el.paused) setWaiting(false); }} onProgress={updateBuffered} onTimeUpdate={() => { const el = videoRef.current; if (el) setCurTime(el.currentTime || 0); updateBuffered(); }} onDurationChange={() => { const el = videoRef.current; if (el && Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration); }} onError={onVideoError} onLoadedMetadata={onLoadedMetadata} className="absolute inset-0 h-full w-full" aria-label={v.title} />
            {showSpinner && <PlayerSpinner />}
            <SeekFlash flash={tap.flash} />
            {!playing && (
              <button type="button" aria-label={curTime > 0 ? "Resume video" : "Play video"} onClick={togglePlay} className="absolute left-1/2 top-1/2 z-30 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-black shadow-lg ring-1 ring-black/10 transition active:scale-90">
                <Icon n="play" size={28} />
              </button>
            )}
            {/* The site's own control bar. Its fullscreen button sits at
                the bar's right end, next to the volume control — exactly
                where the browser's (policy-greyed) button used to be —
                and is the player's only fullscreen control. */}
            <div className={`absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 text-white transition-opacity duration-300 ${hide.hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}>
              <div className="flex items-center gap-3 [&_button]:transition [&_button]:active:scale-90">
                <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay} className="p-1"><Icon n={playing ? "pause" : "play"} size={20} /></button>
                <span className="text-sm font-medium tabular-nums">{fmtDur(Math.floor(curTime))} / {fmtDur(Math.floor(duration))}</span>
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} className="p-1.5"><Icon n={muted || volume === 0 ? "mute" : "volume"} size={20} /></button>
                  <input aria-label="Volume" type="range" min={0} max={100} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="hidden w-16 accent-[var(--accent)] sm:block" />
                  {/* Playback speed, same menu style as the quality gear. */}
                  <SpeedMenu speed={speed} open={speedMenuOpen} onToggle={() => { setSpeedMenuOpen((o) => !o); setQMenuOpen(false); }} onSelect={(s) => { setSpeed(s); setSpeedMenuOpen(false); }} />
                  {/* Quality settings, on the video screen itself: the
                      gear opens a small menu over the player listing
                      every stream the source offers for this video;
                      picking one flips the same state as the pills
                      under the player, and the switch keeps the
                      viewer's place (see the pinned-stream effect). */}
                  {multiStream && (
                    <span className="relative">
                      <button type="button" aria-label="Quality settings" aria-haspopup="menu" aria-expanded={qMenuOpen} onClick={() => { setQMenuOpen((o) => !o); setSpeedMenuOpen(false); }} className="p-1.5"><Icon n="settings" size={20} /></button>
                      {qMenuOpen && (
                        <span role="menu" aria-label="Playback quality" className="absolute bottom-full right-0 z-20 mb-2 block w-48 overflow-hidden rounded-xl bg-[#17171c] py-1 text-left shadow-xl ring-1 ring-white/15">
                          <span className="block px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">Quality</span>
                          {streams.map((s) => (
                            <button key={s.label} type="button" role="menuitemradio" aria-checked={activeLabel === s.label} onClick={() => { setSelLabel(s.label); setQMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold transition hover:bg-white/10">
                              <span className="flex w-4 shrink-0 justify-center">{activeLabel === s.label && <Icon n="check" size={15} />}</span>{s.label}
                            </button>
                          ))}
                        </span>
                      )}
                    </span>
                  )}
                  {/* Picture-in-Picture (native player only, hidden
                      where the browser has no PiP). */}
                  {pipSupported && (
                    <button type="button" aria-label={pipActive ? "Exit picture-in-picture" : "Picture-in-picture"} aria-pressed={pipActive} onClick={() => { void togglePip(); }} className="p-1.5"><Icon n="pip" size={20} /></button>
                  )}
                  {/* Theater mode, desktop only; Esc (or the button)
                      returns to normal. Fullscreen from theater is fine. */}
                  <button type="button" aria-label={theater ? "Exit theater mode" : "Theater mode"} aria-pressed={theater} onClick={() => setTheater((t) => !t)} className="hidden p-1.5 md:block"><Icon n="theater" size={20} /></button>
                  <button type="button" aria-label={isFs ? "Exit fullscreen" : "Fullscreen"} aria-pressed={isFs} onClick={toggleFullscreen} className="p-1.5"><Icon n={isFs ? "compress" : "expand"} size={20} /></button>
                </span>
              </div>
              <button type="button" aria-label="Seek" ref={seekBtnRef} onClick={(e) => seekTo(e.clientX, e.currentTarget)} onMouseEnter={(e) => updateSeekHover(e.clientX, e.clientY)} onMouseMove={(e) => { if (!(duration > 0)) return; const r = e.currentTarget.getBoundingClientRect(); const pct = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)); setSeekHover({ pct, time: (pct / 100) * duration }); }} onMouseLeave={() => setSeekHover(null)} className="group/seek relative mt-1 block h-4 w-full">
                {seekHover && (
                  <span className="pointer-events-none absolute -top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-xs font-bold text-white shadow" style={{ left: `${Math.min(96, Math.max(4, seekHover.pct))}%` }}>{fmtDur(Math.floor(seekHover.time))}</span>
                )}
                <span className="relative block h-1 w-full rounded bg-white/30 transition-all group-hover/seek:h-2">
                  <span className="absolute inset-0 overflow-hidden rounded" aria-hidden="true">
                    {buffered.map((b, i) => (
                      <span key={i} className="absolute top-0 h-full rounded bg-white/45" style={{ left: `${b.s * 100}%`, width: `${Math.max(0, (b.e - b.s) * 100)}%` }} />
                    ))}
                    <span className="block h-full rounded bg-[var(--accent)]" style={{ width: `${progressPct}%` }} />
                  </span>
                  <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${progressPct}%` }} aria-hidden="true" />
                </span>
              </button>
            </div>
          </>
        ) : resolving ? (
          <>
            {posterUrl && <img src={posterUrl} alt="" referrerPolicy="no-referrer" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50" />}
            <PlayerSpinner />
          </>
        ) : showPreroll ? null : (
          <>
            {/* The pre-load poster is decoration only: it must never
                take clicks meant for the embed's own play/pause
                buttons inside the iframe (it covers the whole frame
                until the iframe reports loaded, and a missed load
                event would otherwise leave every tap dead). */}
            {!loaded && posterUrl && <img src={posterUrl} alt="" referrerPolicy="no-referrer" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50" />}
            {!loaded && <PlayerSpinner />}
            <iframe src={emb.src} title={v.title} onLoad={() => setLoaded(true)} className="absolute inset-0 h-full w-full" allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" {...(isGatedIframe ? { sandbox: "allow-scripts allow-same-origin allow-presentation" } : {})} />
            {/* Same treatment as the native player: no floating button —
                a bottom control bar whose only control is the fullscreen
                toggle at its right end (the embed's own play/volume
                controls stay inside the iframe). The bar itself lets
                clicks through to the iframe; only the button takes them. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-end bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 text-white">
              <button type="button" aria-label={isFs ? "Exit fullscreen" : "Fullscreen"} aria-pressed={isFs} onClick={toggleFullscreen} className="pointer-events-auto p-1.5 transition active:scale-90"><Icon n={isFs ? "compress" : "expand"} size={20} /></button>
            </div>
          </>
        )}
        {showPreroll && prerollAd && <PrerollAd ad={prerollAd} onDone={skipPreroll} />}
      </div>
      {nativeSrc && multiStream && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[var(--dim)]" role="group" aria-label="Playback quality">
          <span>Quality:</span>
          {streams.map((s) => (
            <button key={s.label} type="button" aria-pressed={activeLabel === s.label} onClick={() => setSelLabel(s.label)} className={`rounded-full px-3.5 py-1.5 font-bold transition active:scale-95 ${activeLabel === s.label ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text)]"}`}>{s.label}</button>
          ))}
          <span>Every resolution this video's source offers. Switching keeps your place.</span>
        </div>
      )}
      {emb.kind === "iframe" && !nativeSrc && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--dim)]">
          <span>Video not playing here?</span>
          <a href={emb.src} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--accent)]">Open the player in a new tab</a>
          <span>— some sources block playback inside apps, but the same link plays in your browser.</span>
        </div>
      )}
    </>
  );
}

/* Logo rendered from the editable logo text: first word in accent pink,
   the heart mark, then the rest in white — identical to the built-in logo
   while the text is the default "PULSE VIDEO". */
function LogoText({ text, size = 19 }: { text: string; size?: number }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "PULSE";
  const rest = words.slice(1).join(" ");
  return (
    <span className="font-display flex items-center font-black tracking-tight" style={{ fontSize: size }}>
      <span className="text-[var(--accent)]">{first}</span>
      {rest && (<><LogoHeart size={size + 2} /><span className="text-white">{rest}</span></>)}
    </span>
  );
}

function Avatar({ name, g, size = 112, photo }: { name: string; g: [string, string]; size?: number; photo?: string | null }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  /* A real model photo replaces the gradient initials — square with
     4 visible corners, like the rest of the site's model photos. */
  if (photo) return <img src={photo} alt="" loading="lazy" className="shrink-0 rounded-[12px] object-cover ring-1 ring-white/15" style={{ width: `min(${size}px, 20vw)`, height: `min(${size}px, 20vw)` }} aria-hidden="true" />;
  return (
    <span className="font-display flex items-center justify-center rounded-[12px] font-black text-white shrink-0 ring-1 ring-white/15" style={{ width: `min(${size}px, 20vw)`, height: `min(${size}px, 20vw)`, background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`, fontSize: `min(${Math.round(size * 0.32)}px, 6.4vw)` }} aria-hidden="true">
      {initials}
    </span>
  );
}

function Pagination({ page, total, onChange, nextLabel = "Next" }: { page: number; total: number; onChange: (p: number) => void; nextLabel?: string }) {
  if (total <= 1) return null;
  const nums: (number | "…")[] = [];
  const win = [1, page - 1, page, page + 1, total].filter((v, i, a) => v >= 1 && v <= total && a.indexOf(v) === i).sort((a, b) => a - b);
  win.forEach((v, i) => { if (i > 0 && v - (win[i - 1] as number) > 1) nums.push("…"); nums.push(v); });
  return (
    <nav className="mt-9 flex flex-wrap items-center justify-center gap-2.5" aria-label="Pages">
      {nums.map((p, i) => p === "…" ? (
        <span key={`e${i}`} className="px-1 text-[var(--dim)]">…</span>
      ) : (
        <button key={p} type="button" aria-label={`Page ${p}`} aria-current={page === p ? "page" : undefined} onClick={() => onChange(p)} className={`h-10 min-w-10 rounded-xl px-2 text-sm font-bold transition active:scale-95 ${page === p ? "bg-white text-black" : "bg-[var(--surface2)] text-white"}`}>{p}</button>
      ))}
      <button type="button" aria-label="Next page" disabled={page >= total} onClick={() => onChange(Math.min(total, page + 1))} className="h-10 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">{nextLabel}</button>
    </nav>
  );
}

function NextButton({ onClick, disabled, label = "Next" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  if (disabled) return null;
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <button type="button" onClick={onClick} aria-label={label === "Next" ? "Next page" : label} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-4 font-display text-base font-black text-white shadow-[0_8px_24px_rgba(244,63,94,.35)] transition active:scale-[0.98] sm:mx-auto sm:max-w-[440px]">
        {label} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

/* ---------------- Main App ---------------- */

type Tab = "home" | "categories" | "tags" | "creators" | "profile" | "channels";
type Listing = { kind: "tag" | "category" | "creator" | "channel" | "feed" | "search"; name: string };
type Filters = { len: string; quality: string; added: string; incl: string[]; excl: string[] };
const NO_FILTERS: Filters = { len: "Any", quality: "Any", added: "Any time", incl: [], excl: [] };
const PAGE_SIZE = 12;

/* The reverse of publicUrl, used once on load — kept here
   because it reads window.location (client-only). */
const pathRoute = (): string | null => {
  const segs = window.location.pathname.split("/").filter((s) => s.length > 0);
  const last = segs[segs.length - 1] ?? "";
  const prev = segs[segs.length - 2] ?? "";
  const pairHeads = ["video", "categories", "models", "channels", "tag", "search"];
  if (pairHeads.includes(prev) && last) {
    let slug = last;
    try { slug = decodeURIComponent(last); } catch { /* keep the raw segment */ }
    return `/${prev}/${slug}`;
  }
  const singleHeads = ["most-popular", "top-rated", "latest-updates", "longest", "categories", "models", "channels", "tags", "creators", "profile", "history", "sitemap.xml", "robots.txt"];
  if (singleHeads.includes(last)) return `/${last}`;
  return null;
};


/* Admin tokens are `exp.signature` with exp a plain ms timestamp.
   A token whose exp already passed is dead — the server refuses it. */
function tokenExpired(t: string | null): boolean {
  if (!t) return true;
  const exp = Number(t.split(".")[0]);
  return !Number.isFinite(exp) || exp <= Date.now();
}
function isAdminSessionError(msg: string): boolean {
  return msg.includes("Admin session");
}

export function App() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("home");
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const queryRef = useRef(query);
  queryRef.current = query;
  const [, setFeed] = useState<(typeof FEED_TABS)[number]>("For you");
  const [chip, setChip] = useState("All");
  const [letter, setLetter] = useState("Popular");
  const [modelPage, setModelPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [current, setCurrent] = useState<Video | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [speed, setSpeed] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [artTheater, setArtTheater] = useState(false);
  /* Skippable pre-roll for the catalog (non-embed) player: the ad
     overlay shows on the first play tap; its Skip button starts the
     video for real. Reset whenever another video opens. */
  const [artPrerollShown, setArtPrerollShown] = useState(false);
  const [artPrerollDone, setArtPrerollDone] = useState(false);
  const [artSeekHover, setArtSeekHover] = useState<{ pct: number; time: number } | null>(null);
  const artSeekBtnRef = useRef<HTMLButtonElement | null>(null);
  const artLastPointer = useRef<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [cookieChoice, setCookieChoice] = useState<string | null>(() => { try { return window.localStorage.getItem("pv-cookie"); } catch { return null; } });
  /* Light/dark theme: dark is the default; the choice persists in
     localStorage and is re-applied to <html data-theme> on every change
     (an inline script in index.html applies it before first paint). */
  const [theme, setTheme] = useState<"dark" | "light">(() => { try { return window.localStorage.getItem("pv-theme") === "light" ? "light" : "dark"; } catch { return "dark"; } });
  useEffect(() => {
    if (theme === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try { window.localStorage.setItem("pv-theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);
  const [descOpen, setDescOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsOverflow, setTagsOverflow] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [sortBy, setSortBy] = useState("Newest");
  const [hideWatched, setHideWatched] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Filters>(NO_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(NO_FILTERS);
  const [listPage, setListPage] = useState(1);
  const [bioOpen, setBioOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [notFound, setNotFound] = useState(false);
  /* Route waiting on the admin catalog: a direct link to an imported
     video (or category/model/channel/tag) cannot resolve until
     getAdminState returns. While it is still loading the page shows a
     spinner instead of a 404 — the old behaviour flashed "Page not
     found" for ~15–20 s on cold starts before the re-resolve landed. */
  const [routePending, setRoutePending] = useState(false);
  const [authView, setAuthView] = useState<"login" | "signup" | null>(null);
  const [historyView, setHistoryView] = useState(false);
  const [adminView, setAdminView] = useState(false);
  const [legalView, setLegalView] = useState<"terms" | "privacy" | null>(null);
  const [fileView, setFileView] = useState<"sitemap" | "robots" | null>(null);
  const [adminMountKey, setAdminMountKey] = useState(0);
  /* Admin session token: issued by the server (verifyAdminCode) when
     the admin code typed into the search box matches the code the
     server holds — the code itself is never in this bundle. The token
     rides in sessionStorage so a reload keeps the session, and every
     admin save/reset presents it; the server re-checks it on each
     call, so the panel route alone can change nothing. */
  const [adminToken, setAdminTokenState] = useState<string | null>(() => { try { const t = window.sessionStorage.getItem("pv-admin-token"); if (t && tokenExpired(t)) { window.sessionStorage.removeItem("pv-admin-token"); return null; } return t; } catch { return null; } });
  const adminTokenRef = useRef<string | null>(adminToken);
  const setAdminToken = (t: string | null) => {
    adminTokenRef.current = t;
    setAdminTokenState(t);
    try { if (t) window.sessionStorage.setItem("pv-admin-token", t); else window.sessionStorage.removeItem("pv-admin-token"); } catch { /* storage unavailable */ }
  };
  const [ageOk, setAgeOk] = useState(false);
  const [lang, setLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const artFs = usePlayerFullscreen(playerRef);
  /* Catalog player controls auto-hide: same 3s rule as the native
     player, never while paused or while the speed menu is open. */
  const artHide = useAutoHideControls(playing, speedMenuOpen);
  /* Art-player seek tooltip: same fix as the native player — the bar
     is pointer-events-none while auto-hidden, so the hover is tracked
     from the player box's own mousemove against the button's rect and
     re-checked from the last known pointer position whenever the bar
     becomes visible again. */
  const artDurSec = current?.durationSec ?? 0;
  const updateArtSeekHover = useCallback((clientX: number, clientY: number) => {
    if (!(artDurSec > 0)) { setArtSeekHover(null); return; }
    const r = artSeekBtnRef.current?.getBoundingClientRect();
    if (!r) { setArtSeekHover(null); return; }
    if (clientX < r.left || clientX > r.right || clientY < r.top - 8 || clientY > r.bottom + 8) { setArtSeekHover(null); return; }
    const pct = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    setArtSeekHover({ pct, time: (pct / 100) * artDurSec });
  }, [artDurSec]);
  useEffect(() => {
    if (artHide.hidden) return;
    const p = artLastPointer.current;
    if (p) updateArtSeekHover(p.x, p.y);
  }, [artHide.hidden, updateArtSeekHover]);
  /* Leaving a video (or opening another) always leaves expanded mode,
     so the next page never starts with the player covering it. */
  useEffect(() => { artFs.collapse(); setArtTheater(false); setSpeedMenuOpen(false); setArtSeekHover(null); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);
  const scrollMem = useRef(new Map<string, number>());
  const wantRestore = useRef(false);
  /* Set by nav() before it changes the hash. A hash assignment also fires
     popstate in the browser, and that popstate must NOT be mistaken for
     browser Back — only a popstate with no forward navigation in flight
     is a real Back that may restore scroll. */
  const forwardNav = useRef(false);
  const loadTimer = useRef<number | undefined>(undefined);
  const searchTimer = useRef<number | undefined>(undefined);

  const stateQ = useQuery({ queryKey: ["state"], queryFn: () => api.getState({}), staleTime: 5 * 60_000, refetchOnWindowFocus: false });

  /* Admin-managed content: the saved admin state merged over the built-in
     catalog. These local names shadow the module-level catalog constants
     everywhere inside the component, so every list, count and page renders
     the effective (admin-aware) data. */
  const adminQ = useQuery({ queryKey: ["admin"], queryFn: () => api.getAdminStateSlim(), staleTime: 10 * 60_000, refetchOnWindowFocus: false });
  /* The admin panel (and the video-page description) need the FULL payload:
     slim drops descriptions, so saving from slim state would persist them
     as null. The full query loads lazily, only when the panel is open or
     a video page is showing. */
  const adminFullQ = useQuery({ queryKey: ["admin-full"], queryFn: () => api.getAdminState({}), enabled: adminView || current !== null, staleTime: 10 * 60_000, refetchOnWindowFocus: false });
  const adminState = useMemo(() => parseAdminState(adminFullQ.data?.payload ?? adminQ.data?.payload), [adminQ.data, adminFullQ.data]);
  const eff = useMemo(() => buildEffective(adminState), [adminState]);
  const VIDEOS = eff.videos;
  const CATEGORIES = eff.categories;
  const CREATORS = eff.creators;
  const CHANNELS = eff.channels;
  const TAGS = eff.tags;
  const byId = (id: string) => VIDEOS.find((v) => v.id === id);
  /* The hash-routing effect is registered once on mount, so its applyHash
     closure would forever see the first render's catalog (from before the
     admin state finished loading). Route lookups therefore read through
     this ref, which always holds the latest effective data. */
  const effRef = useRef(eff);
  effRef.current = eff;
  const texts = adminState.texts;
  const ads = adminState.ads;
  const seo = adminState.seo;
  const btnLabel = (id: string, fallback: string) => adminState.buttons.find((b) => b.id === id)?.label || fallback;
  const likes = stateQ.data?.likes ?? [];
  const saves = stateQ.data?.saves ?? [];
  const follows = stateQ.data?.follows ?? [];
  const history = stateQ.data?.history ?? [];

  /* ---- Admin save honesty + stale-panel tracking (A4/A23/A1/A12) ---- */
  const [saveError, setSaveError] = useState("");
  const [staleBanner, setStaleBanner] = useState(false);
  const [otherTabOpen, setOtherTabOpen] = useState(false);
  /* The server payload the panel last loaded from or saved: a refetch
     that returns something else while the panel holds unsaved edits
     means the data changed elsewhere (another tab, another device). */
  const panelPayloadRef = useRef<string | null | undefined>(undefined);
  const panelDirtyRef = useRef(false);
  const handlePanelDirty = useCallback((d: boolean) => { panelDirtyRef.current = d; }, []);
  /* A dead session drops back to the code entry (the search box) — the
     panel route alone must never open anything. */
  const expireAdminSession = () => {
    setAdminToken(null);
    setAdminView(false);
    setSaveError("");
    flash("Admin session expired — type the admin code in the search box to open the panel again");
    window.location.hash = "#/";
  };
  const reloadPanel = () => {
    void adminFullQ.refetch().then((r) => {
      panelPayloadRef.current = r.data?.payload ?? null;
      setStaleBanner(false);
      setAdminMountKey((k) => k + 1);
    });
  };
  const keepPanelEdits = () => {
    setStaleBanner(false);
    panelPayloadRef.current = adminFullQ.data?.payload ?? null;
  };
  useEffect(() => {
    if (!adminView) { panelPayloadRef.current = undefined; setStaleBanner(false); return; }
    const p = adminFullQ.data?.payload ?? null;
    if (panelPayloadRef.current === undefined) { panelPayloadRef.current = p; return; }
    if (p === panelPayloadRef.current) return;
    if (panelDirtyRef.current) { setStaleBanner(true); return; }
    /* No unsaved edits — the panel can adopt the new data. */
    panelPayloadRef.current = p;
    setAdminMountKey((k) => k + 1);
  }, [adminFullQ.data, adminView]);
  /* Two open admin tabs can silently overwrite each other (last save
     wins): when this panel opens it pings, and any other open panel
     answers — an answer within ~500ms raises the warning. */
  useEffect(() => {
    if (!adminView) { setOtherTabOpen(false); return; }
    const openedAt = Date.now();
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("pv-admin-tab");
      ch.onmessage = (e) => {
        if (e.data === "ping") { ch?.postMessage("pong"); setOtherTabOpen(true); }
        else if (e.data === "pong" && Date.now() - openedAt < 500) setOtherTabOpen(true);
      };
      ch.postMessage("ping");
    } catch { /* BroadcastChannel unavailable — no cross-tab warning */ }
    return () => { try { ch?.close(); } catch { /* already closed */ } };
  }, [adminView]);

  const toggle = useMutation({
    mutationFn: async (a: { kind: "like" | "save" | "follow"; itemKey: string }) => await api.toggleInteraction(a),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }),
    onError: (e) => setNotice(e instanceof Error ? e.message : "Something went wrong"),
  });
  const record = useMutation({
    mutationFn: async (itemKey: string) => await api.recordHistory({ itemKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }),
  });
  const clearHist = useMutation({
    mutationFn: async () => await api.clearHistory({ token: adminTokenRef.current ?? "" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }),
  });
  const saveAdmin = useMutation({
    mutationFn: async (st: AdminState) => await api.saveAdminState({ payload: JSON.stringify(st), token: adminTokenRef.current ?? "" }),
    onSuccess: (_d, st) => {
      /* Success is announced only here, after the server confirmed the
         write — never at the call site. */
      panelPayloadRef.current = JSON.stringify(st);
      setSaveError("");
      flash("Admin changes saved");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Could not save admin changes";
      if (isAdminSessionError(msg)) { expireAdminSession(); return; }
      /* The failed edits must not linger as if saved: remounting the
         panel from the last server-confirmed state drops them. */
      setSaveError(msg);
      setAdminMountKey((k) => k + 1);
    },
  });
  const resetAdmin = useMutation({
    mutationFn: async () => await api.resetAdminState({ token: adminTokenRef.current ?? "" }),
    onSuccess: () => {
      /* Reset deletes the stored payload, so the next fetch is null. */
      panelPayloadRef.current = null;
      setSaveError("");
      qc.invalidateQueries({ queryKey: ["admin"] });
      flash("All admin changes reset — defaults restored");
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Could not reset admin changes";
      if (isAdminSessionError(msg)) { expireAdminSession(); return; }
      setSaveError(msg);
      setAdminMountKey((k) => k + 1);
    },
  });

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(""), 2600); };

  /* The site's own address without the hash route — the base every
     sitemap URL is built on. */
  const siteBase = () => (window.location.origin && window.location.origin !== "null" ? `${window.location.origin}${window.location.pathname}` : "");
  const downloadTextFile = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /* The app does NOT scroll the window: the SDK shell scrolls the
     [data-generated-space-root] container (position: fixed; overflow: auto).
     window.scrollTo alone therefore never moved the page — every scroll
     helper must target that container first. */
  const getScroller = (): HTMLElement | null =>
    document.querySelector<HTMLElement>("[data-generated-space-root]") ??
    (document.scrollingElement as HTMLElement | null);
  const readScroll = (): number => getScroller()?.scrollTop ?? window.scrollY;
  const scrollToY = (y: number, instant: boolean) => {
    const sc = getScroller();
    if (sc) {
      if (instant) { try { sc.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior }); } catch { /* older browser */ } }
      sc.scrollTop = y;
    }
    window.scrollTo(0, y);
  };

  /* Instant jump to the very top: the real scroll container, the window, the
     document and the main page container all reset, with no smooth animation
     that could be interrupted. Forward navigation ALWAYS uses this; only
     browser Back restores scroll. */
  const scrollTopInstant = () => {
    scrollToY(0, true);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const mainEl = document.getElementById("main");
    if (mainEl) mainEl.scrollTop = 0;
  };

  const nav = (path: string) => {
    /* An explicit click navigation always starts at the top — cancel any
       pending back-scroll restore so it cannot override this navigation. */
    wantRestore.current = false;
    forwardNav.current = true;
    scrollTopInstant();
    setNavLoading(true);
    window.clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(() => setNavLoading(false), 450);
    const hash = lang !== "en" ? `#/${lang}${path}` : `#${path}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    /* The hash change renders the new view a beat later — land on its top. */
    requestAnimationFrame(() => scrollTopInstant());
    window.setTimeout(() => scrollTopInstant(), 60);
  };
  const resetViews = () => { setNotFound(false); setRoutePending(false); setAuthView(null); setHistoryView(false); setAdminView(false); setFileView(null); setLegalView(null); };
  const openVideo = (v: Video) => {
    resetViews();
    setCurrent(v);
    /* Embed videos start playing as soon as their page opens (the iframe
       or <video> element is the player), so opening one counts as a watch. */
    if (v.embedUrl) record.mutate(v.id);
    setPlaying(false);
    setProgress(0);
    setDescOpen(false);
    setCommentsOpen(false);
    nav(`/video/${v.id}`);
    scrollTopInstant();
  };
  const startPlayback = () => {
    if (!current) return;
    /* The pre-roll owns the first play: show the ad instead of
       starting the video; its Skip button starts playback for real. */
    if (artPrerollPending) { if (!artPrerollShown) setArtPrerollShown(true); return; }
    /* Resuming at the very end restarts from the beginning — with the
       progress left at 100 the ticker would end playback again within
       a frame, which reads as "the resume button does nothing". */
    if (!playing && progress >= 100) setProgress(0);
    if (!playing) record.mutate(current.id);
    setPlaying(!playing);
  };
  const skipArtPreroll = () => {
    if (!current) return;
    setArtPrerollDone(true);
    setArtPrerollShown(false);
    if (!playing && progress >= 100) setProgress(0);
    if (!playing) record.mutate(current.id);
    setPlaying(true);
  };
  /* A new video gets a fresh pre-roll. */
  const artPrerollAd = ads.preroll && ads.preroll.enabled && ads.preroll.mediaUrl.trim() && (ads.preroll.kind === "image" || ads.preroll.kind === "video") ? ads.preroll : null;
  const artPrerollPending = !!artPrerollAd && !artPrerollDone;
  useEffect(() => { setArtPrerollShown(false); setArtPrerollDone(false); }, [current?.id]);
  /* Relative seek for the catalog (fake) player: double-tap and
     keyboard J/L and arrows. */
  const seekArtBy = (sec: number) => {
    if (!current) return;
    setProgress((p) => Math.min(100, Math.max(0, p + (sec / current.durationSec) * 100)));
  };
  /* Double-tap left/right halves to seek ∓10s on the catalog player;
     a single tap still toggles play (held ~300ms so the second tap
     can win). The center button keeps its instant resume. */
  const artTap = useTapSeek(seekArtBy, startPlayback);
  const switchLang = (code: string) => {
    setLang(code);
    setLangOpen(false);
    const raw = window.location.hash.replace(/^#\/?/, "");
    const segs = raw.split("/").filter((s) => s.length > 0);
    if (segs[0] && LANG_CODES.has(segs[0])) segs.shift();
    const path = "/" + segs.join("/");
    setNavLoading(true);
    window.clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(() => setNavLoading(false), 450);
    forwardNav.current = true;
    window.location.hash = code === "en" ? `#${path}` : `#/${code}${path}`;
    flash(`Language set to ${LANGS.find((l) => l.code === code)?.name ?? code} — some pages stay in English`);
  };
  const goTab = (t: Tab) => {
    setPlaying(false);
    resetViews();
    setTab(t);
    setCurrent(null);
    setListing(null);
    setDrawer(false);
    setQuery("");
    if (t === "home") setFeed("For you");
    nav(t === "home" ? "/" : t === "creators" ? "/models" : `/${t}`);
    scrollTopInstant();
  };
  const openListing = (l: Listing) => {
    setPlaying(false);
    resetViews();
    setListing(l);
    setCurrent(null);
    setTab("home");
    setDrawer(false);
    if (l.kind === "search") setQuery(l.name);
    const feedRoutes: Record<string, string> = { Trending: "/most-popular", "Top rated": "/top-rated", New: "/latest-updates", Longest: "/longest" };
    const route = l.kind === "feed" ? (feedRoutes[l.name] ?? "/") : l.kind === "category" ? `/categories/${slugify(l.name)}` : l.kind === "creator" ? `/models/${slugify(l.name)}` : l.kind === "channel" ? `/channels/${slugify(l.name)}` : l.kind === "search" ? `/search/${slugify(l.name)}` : `/tag/${slugify(l.name)}`;
    nav(route);
    scrollTopInstant();
  };
  const openAuth = (v: "login" | "signup") => { resetViews(); setAuthView(v); setDrawer(false); setAgeOk(false); nav(v === "login" ? "/login" : "/signup"); scrollTopInstant(); };
  const openHistory = () => { resetViews(); setHistoryView(true); setCurrent(null); setListing(null); setDrawer(false); nav("/history"); scrollTopInstant(); };
  const openLegal = (v: "terms" | "privacy") => { resetViews(); setLegalView(v); setCurrent(null); setListing(null); setTab("home"); setDrawer(false); nav(v === "terms" ? "/terms" : "/privacy"); scrollTopInstant(); };

  /* The admin panel's only door: typing the admin code into the site's
     search box. The code lives only on the server — the client sends
     what was typed to verifyAdminCode and opens the panel only when
     the server confirms the match and issues a session token; every
     save/reset then presents that token and is re-checked server-side.
     There is no admin link anywhere on the public site, and the
     #/panel hash (handled in applyHash below) merely restores a panel
     whose token this browser already holds — the route alone opens
     nothing and changes nothing. */
  const showAdmin = () => { setAdminView(true); setNotFound(false); setAuthView(null); setHistoryView(false); setCurrent(null); setListing(null); setAdminMountKey((k) => k + 1); };
  const goAdmin = () => {
    showAdmin();
    if (window.location.hash !== "#/panel") { forwardNav.current = true; window.location.hash = "#/panel"; }
    scrollTopInstant();
  };
  const tryAdminCode = async (raw: string): Promise<boolean> => {
    try {
      const r = await api.verifyAdminCode({ code: raw });
      if (r.admin && r.token) { setAdminToken(r.token); return true; }
    } catch { /* server unreachable — treat the text as a normal search */ }
    return false;
  };

  const titleCase = (s: string) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const applyHash = () => {
    let raw = window.location.hash.replace(/^#\/?/, "");
    const segs = raw.split("/").filter((s) => s.length > 0);
    if (segs[0] && LANG_CODES.has(segs[0]) && segs[0] !== "en") { setLang(segs[0]); segs.shift(); raw = segs.join("/"); }
    const [head = "", ...rest] = raw.split("/");
    const slug = decodeURIComponent(rest.join("/") || "");
    const fromSlug = (s: string) => titleCase(s.replace(/-/g, " "));
    const clear = () => { setNotFound(false); setRoutePending(false); setAuthView(null); setHistoryView(false); setAdminView(false); setFileView(null); setLegalView(null); setCurrent(null); setListing(null); setTab("home"); };
    /* A lookup that misses may only mean the admin catalog has not
       loaded yet (imported videos/categories/models/tags live there,
       not in the built-in catalog). While it is still loading, wait
       for it instead of flashing a 404; once it has loaded (or the
       load failed), a miss is a real 404. Route heads that can never
       come from admin data (membership, unknown heads) 404 at once. */
    const miss = () => { if (!adminReadyRef.current) setRoutePending(true); else setNotFound(true); };
    /* The #/panel route only restores a panel session this browser has
       already verified with the server (its token sits in
       sessionStorage). There is deliberately no #/admin route and no
       link to the panel anywhere on the public site. */
    if (head === "panel") {
      const t = adminTokenRef.current;
      if (t && tokenExpired(t)) {
        setAdminToken(null);
        flash("Admin session expired — type the admin code in the search box to open the panel again");
        clear();
        return;
      }
      if (t) { showAdmin(); return; }
      clear();
      return;
    }
    if (head === "") { clear(); setListing(null); setCurrent(null); setTab("home"); setFeed("For you"); return; }
    if (head === "login" || head === "signup") { clear(); setAuthView(head); setCurrent(null); setListing(null); return; }
    /* Premium/membership is gone (owner's rule: everything plays
       free) — the old route is a plain 404 like any unknown page. */
    if (head === "membership") { clear(); setNotFound(true); setCurrent(null); setListing(null); return; }
    if (head === "terms" || head === "privacy") { clear(); setLegalView(head); return; }
    if (head === "history") { clear(); setHistoryView(true); setCurrent(null); setListing(null); return; }
    if (head === "categories" && !slug) { clear(); setTab("categories"); setListing(null); setCurrent(null); return; }
    if (head === "categories" && slug) { clear(); const c = effRef.current.categories.find((x) => slugify(x.name) === slug); if (c) { setListing({ kind: "category", name: c.name }); setCurrent(null); setTab("home"); } else miss(); return; }
    if (head === "models" && !slug) { clear(); setTab("creators"); setListing(null); setCurrent(null); return; }
    if (head === "models" && slug) { clear(); const c = effRef.current.creators.find((x) => slugify(x.name) === slug); if (c) { setListing({ kind: "creator", name: c.name }); setCurrent(null); setTab("home"); } else miss(); return; }
    if (head === "channels" && !slug) { clear(); setTab("channels"); setListing(null); setCurrent(null); return; }
    if (head === "channels" && slug) { clear(); const c = effRef.current.channels.find((x) => slugify(x.name) === slug); if (c) { setListing({ kind: "channel", name: c.name }); setCurrent(null); setTab("home"); } else miss(); return; }
    if (head === "tags" || head === "creators" || head === "profile") { clear(); setTab(head === "creators" ? "creators" : head); setListing(null); setCurrent(null); return; }
    if (head === "video") { clear(); const v = effRef.current.videos.find((x) => x.id === slug); if (v) setCurrent(v); else miss(); return; }
    if (head === "most-popular" || head === "top-rated" || head === "latest-updates" || head === "longest") { clear(); const f = head === "most-popular" ? "Trending" : head === "top-rated" ? "Top rated" : head === "latest-updates" ? "New" : "Longest"; setFeed(f); setListing({ kind: "feed", name: f }); setCurrent(null); setTab("home"); return; }
    if (head === "search") { clear(); if (slug) { const q = fromSlug(slug); setListing({ kind: "search", name: q }); setQuery(q); setCurrent(null); setTab("home"); } return; }
    if (head === "tag") { clear(); if (slug) { const t = effRef.current.tags.find((x) => slugify(x.name) === slug); if (t) { setListing({ kind: "tag", name: t.name }); setCurrent(null); setTab("home"); } else miss(); } return; }
    /* Generated SEO files, rendered as pages so the owner can open,
       copy or download them: #/sitemap.xml and #/robots.txt. */
    if (head === "sitemap.xml" || head === "robots.txt") { clear(); setFileView(head === "sitemap.xml" ? "sitemap" : "robots"); setCurrent(null); setListing(null); setTab("home"); return; }
    setNotFound(true);
  };

  /* Tags under the player: collapsed to a single line, with a See more
     toggle shown only when the tags actually overflow that line. */
  useEffect(() => { setTagsOpen(false); }, [current?.id]);
  useEffect(() => {
    if (tagsOpen) return;
    const measure = () => { const el = tagsRef.current; if (el) setTagsOverflow(el.scrollHeight > el.clientHeight + 4); };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, [current?.id, tagsOpen]);

  useEffect(() => {
    /* We manage scroll ourselves: forward navigation goes to the top,
       browser Back restores. The browser must not restore on its own. */
    try { window.history.scrollRestoration = "manual"; } catch { /* older browser */ }
    /* A stored admin token whose exp already passed is dead — drop it
       (sessionStorage + state) so #/panel cannot restore a session
       the server would refuse. */
    if (adminTokenRef.current && tokenExpired(adminTokenRef.current)) setAdminToken(null);
    applyHash();
    /* Opened directly at a published path URL (from the sitemap, a
       canonical or a shared link) with no hash route set: translate
       the path into the hash route it names; the hashchange listener
       then applies it like any other navigation. */
    if (!window.location.hash.replace(/^#\/?/, "")) {
      const pr = pathRoute();
      if (pr) { forwardNav.current = true; window.location.hash = `#${pr}`; }
    }
    /* If the shell kept the admin fragment on the outer page's address
       instead of this page's own hash, a same-origin parent still lets
       us read it — send it to the server for verification like any
       typed code, and open the panel only on a confirmed match. A
       cross-origin parent throws on access; that case is covered by
       typing the code into the site's search box instead. */
    try {
      if (window.parent !== window && window.parent.location.hash) {
        const frag = window.parent.location.hash;
        void tryAdminCode(frag).then((ok) => { if (ok) goAdmin(); });
      }
    } catch { /* cross-origin parent — nothing to read */ }
    scrollTopInstant();
    const onHash = () => {
      const wasForward = forwardNav.current;
      forwardNav.current = false;
      applyHash();
      /* A hash change is a new page unless it came from browser Back
         (popstate sets wantRestore first) — never keep the old scroll.
         A forward navigation started by nav() always lands at the top,
         even though its hash assignment also fired popstate. */
      if (wasForward) wantRestore.current = false;
      if (!wantRestore.current) {
        scrollTopInstant();
        requestAnimationFrame(() => scrollTopInstant());
      }
    };
    const onPop = () => { if (!forwardNav.current) wantRestore.current = true; };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onPop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A deep link to an admin-added video/category/model/tag cannot
     resolve on the very first pass, before getAdminState returns.
     While the admin data is still loading, applyHash waits
     (routePending) instead of 404ing; once the data lands — or the
     load fails — the route is re-resolved, and a miss then is a
     real 404. */
  const adminReadyRef = useRef(false);
  useEffect(() => { adminReadyRef.current = !!adminQ.data; }, [adminQ.data]);
  const notFoundRef = useRef(false);
  useEffect(() => { notFoundRef.current = notFound; }, [notFound]);
  const routePendingRef = useRef(false);
  useEffect(() => { routePendingRef.current = routePending; }, [routePending]);
  useEffect(() => {
    if ((adminQ.data || adminQ.isError) && (notFoundRef.current || routePendingRef.current)) applyHash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminQ.data, adminQ.isError]);

  useEffect(() => {
    if (!playing || !current) return;
    const t = setInterval(() => {
      setProgress((p) => {
        const next = p + (speed * 100) / current.durationSec / 4;
        if (next >= 100) { setPlaying(false); return 100; }
        return next;
      });
    }, 250);
    return () => clearInterval(t);
  }, [playing, current, speed]);

  /* Esc leaves theater mode on the catalog player (fullscreen's own
     Esc is handled by usePlayerFullscreen). */
  useEffect(() => {
    if (!artTheater) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !artFs.expanded) setArtTheater(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [artTheater, artFs.expanded]);
  /* Same 100vw overflow lock as the native player while the art
     player's theater mode is on (see above). */
  useEffect(() => {
    if (!artTheater) return;
    const de = document.documentElement;
    const b = document.body;
    const prevDe = de.style.overflowX;
    const prevB = b.style.overflowX;
    de.style.overflowX = "hidden";
    b.style.overflowX = "hidden";
    return () => { de.style.overflowX = prevDe; b.style.overflowX = prevB; };
  }, [artTheater]);
  /* Keyboard shortcuts for the catalog (art) player — same set as the
     native player. The embed player registers its own; only one player
     is ever mounted, so they never double-fire. The listener is
     registered once: everything it reads goes through refs, so it
     never re-binds when play state, progress or theater mode change. */
  const artKeyCurrentRef = useRef(current);
  artKeyCurrentRef.current = current;
  const artKeySpeedMenuRef = useRef(speedMenuOpen);
  artKeySpeedMenuRef.current = speedMenuOpen;
  const artKeyTheaterRef = useRef(artTheater);
  artKeyTheaterRef.current = artTheater;
  const artKeyFsRef = useRef(artFs);
  artKeyFsRef.current = artFs;
  const startPlaybackRef = useRef(startPlayback);
  startPlaybackRef.current = startPlayback;
  const seekArtByRef = useRef(seekArtBy);
  seekArtByRef.current = seekArtBy;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = artKeyCurrentRef.current;
      if (!cur || cur.embedUrl) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (shortcutTargetBlocked(e)) return;
      const k = e.key;
      if (k === "Escape") {
        if (artKeySpeedMenuRef.current) { setSpeedMenuOpen(false); return; }
        if (artKeyTheaterRef.current) { setArtTheater(false); return; }
        return;
      }
      if (k === " " || k === "k" || k === "K") {
        if (k === " " && (e.target as HTMLElement | null)?.tagName === "BUTTON") return;
        e.preventDefault();
        startPlaybackRef.current();
      } else if (k === "ArrowLeft") { e.preventDefault(); seekArtByRef.current(-5); }
      else if (k === "ArrowRight") { e.preventDefault(); seekArtByRef.current(5); }
      else if (k === "j" || k === "J") seekArtByRef.current(-10);
      else if (k === "l" || k === "L") seekArtByRef.current(10);
      else if (k === "ArrowUp") { e.preventDefault(); setVolume((vol) => Math.min(100, vol + 10)); setMuted(false); }
      else if (k === "ArrowDown") { e.preventDefault(); setVolume((vol) => Math.max(0, vol - 10)); setMuted(false); }
      else if (k === "f" || k === "F") artKeyFsRef.current.toggle();
      else if (k === "m" || k === "M") setMuted((m) => !m);
      else if (/^[0-9]$/.test(k)) setProgress(Number(k) * 10);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Typing in the header search creates a real history entry (hash push) + loading bar + title change. */
  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    const q = query.trim();
    if (!q) return;
    /* The admin code typed into search opens the panel instead of a
       search — the owner's way in when the shell's address bar cannot
       set this page's hash. The check runs on the server (the code is
       not in this bundle): once typing settles, the text goes to
       verifyAdminCode, and only a server-confirmed match opens the
       panel; the text is cleared at once so it never lingers in the
       box or becomes a search history entry. A non-match falls through
       to the normal search. Only a plausible code is ever checked
       (one token, 6+ chars), so half-typed text never burns the
       server's per-minute code-attempt budget; retyping the same text
       while already on its search page still re-checks it; and a
       confirmed match opens the panel whenever the box still holds
       that same text, even if more typing happened meanwhile. */
    const plausible = q.length >= 6 && !/\s/.test(q);
    const alreadyThere = listing?.kind === "search" && listing.name.toLowerCase() === q.toLowerCase();
    searchTimer.current = window.setTimeout(() => {
      /* The search navigates at once; the admin-code check runs in
         parallel and only a confirmed match diverts to the panel. */
      if (!alreadyThere) openListing({ kind: "search", name: q });
      if (plausible) void tryAdminCode(q).then((ok) => { if (ok && queryRef.current.trim() === q) { setQuery(""); setSearchDraft(""); goAdmin(); } });
    }, 650);
    return () => { window.clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const newest = useMemo(() => [...VIDEOS].sort((a, b) => a.days - b.days), [VIDEOS]);
  const trending = useMemo(() => [...VIDEOS].sort((a, b) => b.views - a.views).slice(0, 10), [VIDEOS]);
  const latestHome = useMemo(() => {
    /* A chip matches the same rule as a category listing page (the
       video's category, or one of its tags), so a chip never lands on
       an empty section while its listing page has videos. */
    const base = chip === "All" ? newest : newest.filter((v) => v.category === chip || v.tags.includes(chip.toLowerCase()));
    return showAll ? base : base.slice(0, 24);
  }, [newest, chip, showAll]);
  /* Home category chips: the categories that actually have videos,
     busiest first — the built-in list's first entries are dead ends
     whenever the real catalog lives in other categories. Falls back
     to the first catalog categories when nothing has a count yet. */
  const chipNames = useMemo(() => {
    const withVideos = [...CATEGORIES].filter((c) => Number(c.count) > 0).sort((a, b) => Number(b.count) - Number(a.count)).slice(0, 11).map((c) => c.name);
    return ["All", ...(withVideos.length ? withVideos : CATEGORIES.slice(0, 11).map((c) => c.name))];
  }, [CATEGORIES]);
  const topRated = useMemo(() => [...VIDEOS].sort((a, b) => b.rating - a.rating), [VIDEOS]);
  const upNext = current ? VIDEOS.filter((v) => v.id !== current.id && (v.category === current.category || v.creator === current.creator)).concat(VIDEOS.filter((v) => v.id !== current.id)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6) : [];
  const suggested = current ? [...VIDEOS].filter((v) => v.id !== current.id && !upNext.some((u) => u.id === v.id)).sort((a, b) => b.rating - a.rating).slice(0, 5) : [];
  const moreLikeThis = current ? VIDEOS.filter((v) => v.id !== current.id && v.category === current.category).slice(0, 8) : [];
  /* Videos matched by shared tags and title words — the section
     below "More like this". Each shared tag scores 2, each shared
     significant title word scores 1; ties break by views. Videos
     already in "More like this" are left out so the section adds
     fresh picks instead of repeating the row above. */
  const tagTitleMatches = current ? (() => {
    const stop = new Set(["the", "and", "with", "for", "from", "your", "you", "this", "that", "video", "videos", "free", "watch", "online", "best", "full", "part", "vol", "hd"]);
    const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !stop.has(w));
    const curTags = new Set(current.tags.map((t) => t.toLowerCase()));
    const curWords = new Set(words(current.title));
    const seen = new Set(moreLikeThis.map((v) => v.id));
    return VIDEOS
      .filter((v) => v.id !== current.id && !seen.has(v.id))
      .map((v) => {
        const sharedTags = v.tags.filter((t) => curTags.has(t.toLowerCase())).length;
        const sharedWords = words(v.title).filter((w) => curWords.has(w)).length;
        return { v, score: sharedTags * 2 + sharedWords };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.v.views - a.v.views)
      .slice(0, 6)
      .map((x) => x.v);
  })() : [];
  /* Each category's cover: the most-viewed video in that category
     (first one with a thumbnail), so the Categories tab shows the
     popular video's thumbnail instead of a text row. */
  const topByCategory = useMemo(() => {
    const m = new Map<string, Video>();
    for (const c of CATEGORIES) {
      /* Same rule as the category count and the category listing:
         the video's category, or one of its tags — otherwise a
         category like Anal (1 video filed under it, 40 more tagged
         with it) would pick a thumbnail-less video and the card
         would show only the white placeholder. */
      const pool = VIDEOS.filter((v) => v.category === c.name || v.tags.includes(c.name.toLowerCase()));
      const withThumb = [...pool].sort((a, b) => b.views - a.views).find((v) => v.thumbnailUrl);
      const top = withThumb ?? [...pool].sort((a, b) => b.views - a.views)[0];
      if (top) m.set(c.name, top);
    }
    return m;
  }, [CATEGORIES, VIDEOS]);
  /* "Because you watch" follows the last watched video's category —
     unless that video has no real category (imports land in
     "Uncategorized"), where its first tag names the section instead,
     so the heading never reads "Because you watch Uncategorized". */
  const histVid = history[0] ? byId(history[0]) : undefined;
  const becauseCat = histVid ? (histVid.category !== "Uncategorized" ? histVid.category : (histVid.tags[0] ? titleCase(histVid.tags[0]) : "Travel")) : "Travel";
  const becauseList = useMemo(() => {
    const match = (v: Video) => v.category === becauseCat || v.tags.includes(becauseCat.toLowerCase());
    const inCat = VIDEOS.filter(match).sort((a, b) => b.views - a.views);
    const rest = VIDEOS.filter((v) => !match(v)).sort((a, b) => b.views - a.views);
    return [...inCat, ...rest].slice(2, 10);
  }, [becauseCat, VIDEOS]);
  const becauseTag = current?.tags[0] ?? becauseCat;

  const listingVideos = (l: Listing): Video[] => {
    if (l.kind === "search") { const q = l.name.toLowerCase(); return VIDEOS.filter((v) => v.title.toLowerCase().includes(q) || v.category.toLowerCase() === q || v.tags.some((t) => t.includes(q)) || v.creator.toLowerCase().includes(q)); }
    if (l.kind === "tag") { const q = l.name.toLowerCase(); return VIDEOS.filter((v) => v.tags.includes(q) || v.category.toLowerCase() === q); }
    if (l.kind === "category") return VIDEOS.filter((v) => v.category === l.name || v.tags.includes(l.name.toLowerCase()));
    if (l.kind === "creator") return VIDEOS.filter((v) => v.creator === l.name);
    if (l.kind === "channel") { const ch = CHANNELS.find((c) => c.name === l.name); return ch ? VIDEOS.filter((v) => v.creator === ch.creator || v.channel === ch.name) : []; }
    if (l.name === "Trending") return [...VIDEOS].sort((a, b) => b.views - a.views);
    if (l.name === "New") return [...VIDEOS].sort((a, b) => a.days - b.days);
    if (l.name === "Top rated") return [...VIDEOS].sort((a, b) => b.rating - a.rating);
    if (l.name === "Longest") return [...VIDEOS].sort((a, b) => b.durationSec - a.durationSec);
    return VIDEOS;
  };
  const listingCount = (_l: Listing, list: Video[]): string => `${list.length} video${list.length === 1 ? "" : "s"}`;
  const listingHeading = (l: Listing): string => {
    if (l.kind === "feed") return l.name === "Trending" ? "Most Viewed Videos" : l.name === "Top rated" ? "Top Rated Videos" : l.name === "New" ? "New Videos" : "Longest Videos";
    if (l.kind === "tag") return `Videos tagged “${l.name}”`;
    if (l.kind === "search") return `${l.name} Videos`;
    if (l.kind === "creator" || l.kind === "channel") return l.name;
    return `${l.name} Videos`;
  };
  const listingSegment = (l: Listing): string => l.kind === "search" ? "Search" : l.kind === "tag" ? "Tags" : l.kind === "category" ? "Categories" : l.kind === "creator" ? "Models" : l.kind === "channel" ? "Channels" : "Browse";
  const listingBack = (l: Listing) => { if (l.kind === "search" || l.kind === "tag") goTab("tags"); else if (l.kind === "creator") goTab("creators"); else if (l.kind === "category") goTab("categories"); else if (l.kind === "channel") goTab("channels"); else goTab("home"); };
  const relatedFor = (l: Listing): string[] => {
    const pool = Array.from(new Set(listingVideos(l).flatMap((v) => v.tags)));
    const fill = TAGS.map((t) => t.name).filter((t) => !pool.includes(t));
    return [...pool, ...fill].filter((t) => t.toLowerCase() !== l.name.toLowerCase()).slice(0, 8);
  };
  const sortOptionsFor = (l: Listing): string[] => {
    if (l.kind === "feed" && l.name !== "Longest") return ["Newest", "Top rated", "Popular"];
    if (l.kind === "search") return ["Most relevant", "Newest", "Trending", "Top rated", "Longest"];
    return ["Newest", "Popular", "Trending", "Top rated", "Longest"];
  };
  const defaultSortFor = (l: Listing): string => {
    if (l.kind === "search") return "Most relevant";
    if (l.kind === "feed") return l.name === "Trending" ? "Popular" : l.name === "Top rated" ? "Top rated" : l.name === "Longest" ? "Longest" : "Newest";
    return "Newest";
  };

  useEffect(() => {
    if (listing) setSortBy(defaultSortFor(listing));
    setHideWatched(false); setFiltersOpen(false); setDraftFilters(NO_FILTERS); setAppliedFilters(NO_FILTERS); setListPage(1); setBioOpen(false);
    if (listing?.kind === "search") setSearchDraft(listing.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.kind, listing?.name]);

  const viewKey = adminView ? "admin" : legalView ? `legal:${legalView}` : notFound ? "404" : authView ? `auth:${authView}` : historyView ? "history" : current ? `video:${current.id}` : listing ? `list:${listing.kind}:${listing.name}:${listPage}` : `tab:${tab}`;
  useEffect(() => {
    const onScroll = () => scrollMem.current.set(viewKey, readScroll());
    const sc = getScroller();
    if (sc) sc.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { if (sc) sc.removeEventListener("scroll", onScroll); window.removeEventListener("scroll", onScroll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
  useEffect(() => {
    if (wantRestore.current) {
      /* Browser Back only: return to where the previous list was scrolled. */
      wantRestore.current = false;
      const y = scrollMem.current.get(viewKey);
      if (y) { requestAnimationFrame(() => scrollToY(y, false)); return; }
    }
    /* Every forward view change — tab, listing, video, page number — opens
       at the very top, instantly. */
    scrollTopInstant();
    const r = requestAnimationFrame(() => scrollTopInstant());
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  useEffect(() => {
    const brand = texts.siteName || "Pulse Video";
    document.title =
      adminView ? `Admin Panel | ${brand}` :
      legalView ? `${legalView === "terms" ? "Terms of Use" : "Privacy Policy"} — ${brand}` :
      routePending ? `Loading… — ${brand}` :
      notFound ? `Page not found — ${brand}` :
      authView === "login" ? "Log in - pulsevideo" :
      authView === "signup" ? "Create your account - pulsevideo" :
      historyView ? "History - pulsevideo" :
      current ? (current.seoTitle || `${current.title} | ${brand}`) :
      listing ? (listing.kind === "feed"
        ? `${listing.name === "Trending" ? "Top Trending Videos" : listing.name === "Top rated" ? "Top Rated Collection" : listing.name === "New" ? "Just Added Videos" : "Longest Videos"} | ${brand}`
        : listing.kind === "tag" ? `Tag: ${listing.name} — Videos | ${brand}`
        : listing.kind === "search" ? `Search: ${listing.name} | ${brand}`
        : listing.kind === "creator" ? `${listing.name} Videos — Model | ${brand}`
        : listing.kind === "channel" ? `${listing.name} — Channel | ${brand}`
        : `${listing.name} Videos — Category | ${brand}`) :
      fileView === "sitemap" ? `Sitemap | ${brand}` :
      fileView === "robots" ? `robots.txt | ${brand}` :
      tab === "home" ? (seo.siteTitle || `${brand} | Stream Free Videos in HD`) :
      tab === "categories" ? `Explore Video Categories | ${brand}` :
      tab === "tags" ? `Browse Tags A–Z | ${brand}` :
      tab === "creators" ? `Models Having Most Videos | ${brand}` :
      tab === "channels" ? `Top Rated Channels | ${brand}` :
      `Your Library | ${brand}`;
  }, [current, listing, tab, notFound, routePending, authView, historyView, adminView, fileView, legalView, texts.siteName, seo.siteTitle]);

  /* Dynamic SEO: every view gets its own meta description, Open Graph
     and Twitter cards, canonical URL, robots directive and JSON-LD
     structured data, all derived from that view's own data. A video's
     own SEO fields (set in the admin panel) win on its page; listing
     pages describe themselves from their name and live video count;
     the admin SEO settings remain the site-wide fallback. Private
     views (admin, auth, history, profile, search results, 404 and the
     generated SEO files) are noindexed and carry no canonical. */
  useEffect(() => {
    const brand = texts.siteName || "Pulse Video";
    const setMeta = (attr: string, key: string, content: string | null) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (content == null || content === "") { if (el) el.remove(); return; }
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    const feedRoutes: Record<string, string> = { Trending: "/most-popular", "Top rated": "/top-rated", New: "/latest-updates", Longest: "/longest" };
    const route =
      legalView ? (legalView === "terms" ? "/terms" : "/privacy") :
      adminView ? "/panel" :
      authView ? `/${authView}` :
      historyView ? "/history" :
      fileView ? (fileView === "sitemap" ? "/sitemap.xml" : "/robots.txt") :
      current ? `/video/${current.id}` :
      listing ? (listing.kind === "feed" ? (feedRoutes[listing.name] ?? "/") : listing.kind === "category" ? `/categories/${slugify(listing.name)}` : listing.kind === "creator" ? `/models/${slugify(listing.name)}` : listing.kind === "channel" ? `/channels/${slugify(listing.name)}` : listing.kind === "search" ? `/search/${slugify(listing.name)}` : `/tag/${slugify(listing.name)}`) :
      tab === "home" ? "/" : tab === "creators" ? "/models" : `/${tab}`;
    const origin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "";
    const base = origin ? `${origin}${window.location.pathname}` : "";
    /* Canonical/OG/JSON-LD URLs use the same fragment-free path form
       as the sitemap: a "#" URL is stripped by crawlers and would
       point every page's canonical at the home page. */
    const pageUrl = publicUrl(base, route);
    const noindex = adminView || !!authView || historyView || notFound || routePending || !!fileView || tab === "profile" || listing?.kind === "search";

    let desc = seo.metaDescription;
    if (current) {
      desc = current.seoDescription || current.description ||
        `${current.title} — watch in HD${current.hd ? " & 4K" : ""} on ${brand}. ${current.category} video${current.creator ? ` featuring ${current.creator}` : ""}${current.tags.length ? `. Tags: ${current.tags.slice(0, 6).join(", ")}` : ""}.`;
    } else if (listing) {
      const n = listingVideos(listing).length;
      desc =
        listing.kind === "category" ? `${listing.name} videos — watch ${n} free ${listing.name} videos in HD on ${brand}, updated daily.` :
        listing.kind === "creator" ? `${listing.name} videos — watch ${n} videos featuring model ${listing.name} in HD on ${brand}.` :
        listing.kind === "channel" ? `${listing.name} channel — watch ${n} videos from ${listing.name} in HD on ${brand}.` :
        listing.kind === "tag" ? `Videos tagged "${listing.name}" — ${n} free videos in HD on ${brand}.` :
        listing.kind === "search" ? `Search results for "${listing.name}" on ${brand}.` :
        `${listing.name} videos — watch free videos in HD on ${brand}, updated daily.`;
    } else if (!notFound && !adminView && !authView && !historyView) {
      if (tab === "categories") desc = `Browse all video categories on ${brand} — ${CATEGORIES.length} categories of free HD videos.`;
      else if (tab === "tags") desc = `Browse videos by tag on ${brand} — ${TAGS.length} tags from A to Z.`;
      else if (tab === "creators") desc = `Models on ${brand} — ${CREATORS.length} models with free HD videos.`;
      else if (tab === "channels") desc = `Channels on ${brand} — ${CHANNELS.length} channels of free HD videos.`;
      else if (tab === "profile") desc = `Your library on ${brand} — your liked, saved and followed videos.`;
    }

    const ogTitle = current ? (current.seoTitle || current.title) : (seo.ogTitle || document.title);
    const ogDesc = current ? desc : (seo.ogDescription || desc);
    /* A video-file thumbnail (preview.mp4) is not a share image —
       social crawlers reject it — so it is left out of og:image and
       the JSON-LD thumbnail list rather than pointing them at a movie. */
    /* No video image: fall back to the branded share image, so the
       static og:image in index.html survives this effect's rewrite. */
    const ogImage = current?.thumbnailUrl && !isVideoFileUrl(current.thumbnailUrl) ? current.thumbnailUrl : "/og-image.svg";
    setMeta("name", "description", desc);
    setMeta("name", "keywords", seo.metaKeywords);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    setMeta("property", "og:type", current ? "video.other" : "website");
    setMeta("property", "og:site_name", brand);
    setMeta("property", "og:title", ogTitle);
    setMeta("property", "og:description", ogDesc);
    setMeta("property", "og:url", noindex ? null : pageUrl);
    setMeta("property", "og:image", ogImage);
    setMeta("name", "twitter:card", ogImage ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", ogTitle);
    setMeta("name", "twitter:description", ogDesc);
    setMeta("name", "twitter:image", ogImage);

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (noindex) { if (link) link.remove(); }
    else {
      if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.appendChild(link); }
      link.setAttribute("href", pageUrl);
    }

    /* JSON-LD structured data for this view. */
    type JsonLd = Record<string, unknown>;
    const graph: JsonLd[] = [];
    if (current) {
      const dur = isoDuration(current.durationSec);
      /* contentUrl goes in only for a stable direct media file (an
         admin-pasted .mp4/.webm link): an imported embed's resolved
         file is a signed, expiring URL, so it never belongs in
         structured data — the embedUrl below is the stable reference
         there, and the video sitemap carries player_loc instead. */
      const embSrc = current.embedUrl ? resolveEmbed(current.embedUrl) : null;
      graph.push({
        "@type": "VideoObject",
        name: current.title,
        description: desc,
        url: pageUrl,
        inLanguage: "en",
        isFamilyFriendly: false,
        genre: current.category,
        ...(ogImage ? { thumbnailUrl: [ogImage] } : {}),
        ...(current.hasDate ? { uploadDate: isoDateFromDays(current.days) } : {}),
        ...(dur ? { duration: dur } : {}),
        ...(embSrc ? { embedUrl: embSrc.src } : {}),
        ...(embSrc && embSrc.kind === "file" ? { contentUrl: embSrc.src } : {}),
        ...(current.hasViews ? { interactionStatistic: { "@type": "InteractionCounter", interactionType: { "@type": "WatchAction" }, userInteractionCount: current.views } } : {}),
        ...(current.creator ? { actor: { "@type": "Person", name: current.creator } } : {}),
      });
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: publicUrl(base, "/") },
          { "@type": "ListItem", position: 2, name: current.category, item: publicUrl(base, `/categories/${slugify(current.category)}`) },
          { "@type": "ListItem", position: 3, name: current.title, item: pageUrl },
        ],
      });
    } else if (listing && listing.kind !== "search") {
      const all = listingVideos(listing);
      graph.push({
        "@type": "ItemList",
        name: document.title,
        numberOfItems: all.length,
        itemListElement: all.slice(0, 20).map((v, i) => ({ "@type": "ListItem", position: i + 1, name: v.title, url: publicUrl(base, `/video/${v.id}`) })),
      });
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: publicUrl(base, "/") },
          { "@type": "ListItem", position: 2, name: listing.name, item: pageUrl },
        ],
      });
    } else if (!notFound && !adminView && !authView && !historyView && !fileView && tab === "home") {
      graph.push({
        "@type": "WebSite",
        name: brand,
        url: publicUrl(base, "/"),
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: publicUrl(base, "/search/{search_term_string}") }, "query-input": "required name=search_term_string" },
      });
      graph.push({ "@type": "Organization", name: brand, url: publicUrl(base, "/") });
    }
    let script = document.head.querySelector<HTMLScriptElement>("#pv-jsonld");
    if (graph.length) {
      if (!script) { script = document.createElement("script"); script.id = "pv-jsonld"; script.type = "application/ld+json"; document.head.appendChild(script); }
      script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
    } else if (script) {
      script.remove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, listing, tab, notFound, routePending, authView, historyView, adminView, fileView, legalView, seo, texts.siteName, eff]);

  const navActive: Tab = current ? "home" : listing ? (listing.kind === "tag" ? "tags" : listing.kind === "search" ? "tags" : listing.kind === "creator" ? "creators" : listing.kind === "category" || listing.kind === "channel" ? "categories" : "home") : historyView || authView ? "profile" : tab === "channels" ? "categories" : tab;

  useEffect(() => {
    if (!current || !autoplay || progress < 100) return;
    const next = upNext[0];
    if (!next) return;
    const t = setTimeout(() => openVideo(next), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, autoplay, current]);

  const shownTags = letter === "Popular" ? [...TAGS].sort((a, b) => b.count - a.count) : letter === "0-9" ? TAGS.filter((t) => /^[0-9]/.test(t.name)) : letter === "#" ? TAGS.filter((t) => !/^[a-z0-9]/i.test(t.name)) : TAGS.filter((t) => t.name.toUpperCase().startsWith(letter));
  /* Models/Channels tabs show only entries that actually have videos —
     with the demo catalog gone, empty entries would otherwise parade
     "0 videos" rows. */
  const modelsWithVideos = CREATORS.filter((c) => c.videos > 0);
  const channelsWithVideos = CHANNELS.filter((ch) => Number(ch.videos) > 0);
  const modelsPerPage = 12;
  const totalModelPages = Math.max(1, Math.ceil(modelsWithVideos.length / modelsPerPage));
  /* Clamp the page like listings do: if the catalog shrank (admin
     deletes) the stored page can point past the end and would render
     an empty Models page. */
  const safeModelPage = Math.min(modelPage, totalModelPages);
  const modelSlice = modelsWithVideos.slice((safeModelPage - 1) * modelsPerPage, safeModelPage * modelsPerPage);

  const fmtTime = (sec: number) => fmtDur(Math.floor(sec));
  const chooseCookie = (v: string) => { setCookieChoice(v); try { window.localStorage.setItem("pv-cookie", v); } catch { /* storage unavailable */ } };

  const bottomTabs: { key: Tab; label: string; icon: string }[] = [
    { key: "home", label: "Home", icon: "home" },
    { key: "categories", label: "Categories", icon: "grid" },
    { key: "tags", label: "Tags", icon: "hash" },
    { key: "creators", label: "Creators", icon: "users" },
    { key: "profile", label: "Profile", icon: "user" },
  ];

  const drawerCats = CATEGORIES.slice(0, 24);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <GradientDefs />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[90] focus:rounded-full focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:font-bold focus:text-white">Skip to content</a>
      {navLoading && <div className="loadbar fixed inset-x-0 top-0 z-[80] h-[3px] bg-[var(--accent)]" aria-hidden="true" />}

      {/* ===== ADMIN PANEL (standalone; opens only after the server verifies the admin code) =====
          The panel mounts only once the saved admin state has actually
          loaded: mounting it on the built-in defaults and letting a
          save land before getAdminState returned would overwrite the
          owner's real saved state (their whole imported catalog) with
          those defaults. Until the query settles, a plain loading /
          error screen stands in. */}
      {adminView && !adminFullQ.isSuccess ? (
        <div className="mx-auto max-w-xl px-4 pb-24 pt-16 text-center">
          <h1 className="font-display text-xl font-black text-white">Admin Panel</h1>
          {adminFullQ.isError ? (
            <>
              <p className="mt-2 text-sm text-[var(--dim)]">The saved site data could not be loaded, so the panel stays closed — opening it now could overwrite your videos and settings.</p>
              <button type="button" onClick={() => { void adminFullQ.refetch(); }} className="mt-5 rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95">Try again</button>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--dim)]">Loading your site data…</p>
          )}
        </div>
      ) : adminView ? (
        <Suspense fallback={<div className="mx-auto max-w-xl px-4 pb-24 pt-16 text-center"><h1 className="font-display text-xl font-black text-white">Admin Panel</h1><p className="mt-2 text-sm text-[var(--dim)]">Loading your site data…</p></div>}>
        <AdminPanel
          key={adminMountKey}
          initial={adminState}
          onSave={(st) => { if (saveAdmin.isPending || resetAdmin.isPending) return; saveAdmin.mutate(st); }}
          onReset={() => { if (saveAdmin.isPending || resetAdmin.isPending) return; resetAdmin.mutate(); }}
          onExit={() => goTab("home")}
          onOpenVideo={openVideo}
          flash={flash}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          saveDisabled={saveAdmin.isPending || resetAdmin.isPending || staleBanner}
          saveError={saveError}
          onDismissSaveError={() => setSaveError("")}
          staleBanner={staleBanner}
          onReloadPanel={reloadPanel}
          onKeepEdits={keepPanelEdits}
          onDirtyChange={handlePanelDirty}
          otherTabOpen={otherTabOpen}
        />
        </Suspense>
      ) : authView ? (
        /* ===== LOGIN / SIGNUP ===== */
        <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-16 pt-5">
          <button type="button" aria-label="Pulse Video home" onClick={() => goTab("home")} className="flex items-center self-start">
            <LogoText text={texts.logoText ?? "PULSE VIDEO"} />
          </button>
          <form className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6" onSubmit={(e) => { e.preventDefault(); if (authView === "signup" && !ageOk) { flash("Please confirm you are 18 or older"); return; } setSignedIn(true); flash(authView === "signup" ? "Account created — welcome to Pulse Video" : "Welcome back, Guest viewer"); goTab("home"); }}>
            <h1 className="font-display text-lg font-black text-white sm:text-xl">{authView === "login" ? "Log in" : "Create your account"}</h1>
            <label className="block text-sm font-semibold text-zinc-200">{authView === "login" ? "Email or username" : "Email"}
              <input required type={authView === "login" ? "text" : "email"} autoComplete={authView === "login" ? "username" : "email"} className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none" />
            </label>
            {authView === "signup" && (
              <label className="mt-4 block text-sm font-semibold text-zinc-200">Username
                <input required type="text" autoComplete="username" className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none" />
              </label>
            )}
            <label className="mt-4 block text-sm font-semibold text-zinc-200">Password
              <input required type="password" autoComplete={authView === "login" ? "current-password" : "new-password"} className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none" />
            </label>
            {authView === "signup" && (
              <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-zinc-200">
                <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" /> I am 18 or older
              </label>
            )}
            <button type="submit" className="mt-6 w-full rounded-full bg-[var(--accent)] py-3.5 font-display text-sm font-black text-white">{authView === "login" ? "Log in" : "Sign up"}</button>
            <p className="mt-4 text-center text-sm text-[var(--dim)]">
              {authView === "login" ? <>No account yet? <button type="button" onClick={() => openAuth("signup")} className="font-bold text-[var(--accent)]">Sign up</button></> : <>Already have an account? <button type="button" onClick={() => openAuth("login")} className="font-bold text-[var(--accent)]">Log in</button></>}
            </p>
          </form>
        </div>
      ) : (
      <>
      {/* ===== Header ===== */}
      {/* CLS: reserve the header's height up front so the page below
          does not jump while the webfont swaps in. Measured from the
          three fixed rows (nav row ~54px + search row ~56px + partner
          strip ~40px); a floor only — the header still grows if its
          content ever needs more room. */}
      <header className="sticky top-0 z-40 min-h-[150px] border-b border-[var(--border)] bg-[var(--surface)]/95 pt-safe backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="p-1.5 text-white transition active:scale-90"><Icon n="menu" tone="accent" /></button>
          <button type="button" aria-label="Pulse Video home" onClick={() => goTab("home")} className="flex shrink-0 items-center transition active:scale-[0.97]">
            <LogoText text={texts.logoText ?? "PULSE VIDEO"} />
          </button>
          <nav className="ml-3 hidden items-center gap-4 text-sm font-semibold text-zinc-200 xl:flex" aria-label="Sections">
            <button type="button" onClick={() => openListing({ kind: "feed", name: "New" })} className="py-1 hover:text-white">Videos</button>
            <button type="button" onClick={() => goTab("categories")} className="py-1 hover:text-white">Categories</button>
            <button type="button" onClick={() => goTab("creators")} className="py-1 hover:text-white">Models</button>
            <button type="button" onClick={() => goTab("channels")} className="py-1 hover:text-white">Channels</button>
            <button type="button" onClick={openHistory} className="py-1 hover:text-white">History</button>
          </nav>
          <div className="ml-auto flex items-center gap-1 md:gap-3">
            <button type="button" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={theme === "light"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-1.5 text-white transition active:scale-90"><Icon n={theme === "dark" ? "sun" : "moon"} size={21} tone="accent" /></button>
            <button type="button" aria-label="Watch history" onClick={openHistory} className="p-1.5 text-white transition active:scale-90"><Icon n="history" tone="accent" /></button>
            <div className="relative">
              <button type="button" aria-label={`Language: ${LANGS.find((l) => l.code === lang)?.name ?? "English"}`} aria-expanded={langOpen} onClick={() => setLangOpen(!langOpen)} className="flex items-center gap-1 p-1.5 font-semibold text-white transition active:scale-95"><Icon n="globe" size={19} tone="accent" /> {lang.toUpperCase()} <Icon n="chevD" size={15} tone="accent" /></button>
              {langOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 grid max-h-80 w-64 grid-cols-2 gap-0.5 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl" role="menu" aria-label="Choose language">
                  {LANGS.map((l) => (
                    <button key={l.code} type="button" role="menuitem" onClick={() => switchLang(l.code)} className={`rounded-lg px-3 py-2 text-left text-sm ${l.code === lang ? "font-bold text-[var(--accent)]" : "text-zinc-200"}`}>
                      <span className="mr-1.5 rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[11px] font-black uppercase">{l.code}</span>{l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {signedIn
              ? <button type="button" onClick={() => { setSignedIn(false); flash("Signed out — see you soon"); }} className="hidden p-1.5 font-semibold text-white transition active:scale-95 md:block">Log out</button>
              : <button type="button" onClick={() => openAuth("login")} className="hidden p-1.5 font-semibold text-white transition active:scale-95 md:block">Log in</button>}
            <button type="button" aria-label="Your profile" onClick={() => goTab("profile")} className="p-1.5 text-white transition active:scale-90"><Icon n="user" tone="accent" /></button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <label className="relative block">
            <input aria-label="Search videos, models, tags" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={texts.searchPlaceholder} className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-3 pl-4 pr-11 text-sm text-white placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none" />
            {query
              ? <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); if (listing?.kind === "search") goTab("home"); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--accent)]"><Icon n="x" size={18} tone="accent" /></button>
              : <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--accent)]"><Icon n="search" size={19} tone="accent" /></span>}
          </label>
        </div>
        <div className="no-scrollbar flex items-center gap-6 overflow-x-auto border-t border-[var(--border)] px-4 py-2.5 text-[13px] font-bold tracking-wide md:justify-center">
          <button type="button" onClick={() => flash("Partner link — opens off-site in the full version")} className="flex shrink-0 items-center gap-1.5 text-amber-400"><Icon n="crown" size={16} tone="gold" /> FAPHOUSE</button>
          <button type="button" onClick={() => flash("Partner link — opens off-site in the full version")} className="shrink-0 text-white">BRA<span className="text-amber-400">ZZ</span>ERS</button>
          <button type="button" onClick={() => flash("Partner link — opens off-site in the full version")} className="flex shrink-0 items-center gap-1.5 text-white"><Icon n="cat" size={16} className="text-purple-400" /> PORN LYNX</button>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-32">

        {/* ===== ROUTE LOADING (direct deep link, admin catalog still arriving) ===== */}
        {routePending && !notFound && (
          <section className="text-center" aria-label="Loading page">
            {/* CLS: reserve the exact 16:9 player box (same -mx-4/mt-3
                geometry as the player) so the title, tags and lists
                below do not jump down when the video mounts. */}
            <div className="-mx-4 mt-3 aspect-video bg-[var(--surface)] sm:mx-0 sm:rounded-xl" aria-hidden="true" />
            <span className="mx-auto mt-8 flex items-center justify-center" role="status" aria-label="Loading">
              <svg className="pv-spinner" width="44" height="44" viewBox="0 0 50 50" fill="none" aria-hidden="true">
                <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,.25)" strokeWidth="5" />
                <path d="M45 25a20 20 0 0 0-20-20" style={{ stroke: "var(--accent)" }} strokeWidth="5" strokeLinecap="round" />
              </svg>
            </span>
            {adminQ.isError ? (
              <>
                <p className="mt-4 text-[var(--dim)]">The site data could not be loaded.</p>
                <button type="button" onClick={() => { void adminQ.refetch(); }} className="mt-5 rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95">Retry</button>
              </>
            ) : (
              <p className="mt-4 text-[var(--dim)]">Loading…</p>
            )}
          </section>
        )}

        {/* ===== 404 ===== */}
        {notFound && (
          <section className="pt-10 text-center" aria-label="Page not found">
            <h1 className="font-display text-2xl font-black text-white">Page not found</h1>
            <p className="mt-2 text-[var(--dim)]">This page does not exist or was removed.</p>
            <button type="button" onClick={() => goTab("home")} className="mt-5 rounded-full bg-[var(--accent)] px-8 py-3 font-bold text-white transition active:scale-95">Home</button>
            <nav className="mx-auto mt-9 flex max-w-lg flex-wrap justify-center gap-x-5 gap-y-2.5" aria-label="Categories">
              {CATEGORIES.slice(0, 12).map((c) => (
                <button key={c.name} type="button" onClick={() => openListing({ kind: "category", name: c.name })} className="py-1 text-sm text-zinc-300">{c.name}</button>
              ))}
            </nav>
          </section>
        )}

        {/* ===== TERMS / PRIVACY (real pages from the admin Site Text) ===== */}
        {!notFound && legalView && (
          <section className="pt-5" aria-label={legalView === "terms" ? "Terms of use" : "Privacy policy"}>
            <h1 className="font-display text-xl font-black text-white sm:text-2xl">{legalView === "terms" ? "Terms of Use" : "Privacy Policy"}</h1>
            <div className="mt-4 max-w-2xl space-y-4">
              {(() => {
                const raw = (legalView === "terms" ? texts.termsText : texts.privacyText) || "This page has not been written yet.";
                return raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-zinc-200">{p}</p>
                ));
              })()}
            </div>
          </section>
        )}

        {/* ===== GENERATED SEO FILES (#/sitemap.xml, #/robots.txt) ===== */}
        {!notFound && fileView && (() => {
          const base = siteBase();
          const text = fileView === "sitemap" ? buildSitemapXml(base, eff) : buildRobotsTxt(base);
          const name = fileView === "sitemap" ? "sitemap.xml" : "robots.txt";
          const urlCount = 10 + eff.videos.length + eff.categories.length + eff.creators.length + eff.channels.length + eff.tags.length;
          return (
            <section className="pt-5" aria-label={name}>
              <h1 className="font-display text-xl font-black text-white sm:text-2xl">{name}</h1>
              <p className="mt-1 text-sm text-[var(--dim)]">
                {fileView === "sitemap"
                  ? <>Generated from the live catalog — {urlCount} URLs ({eff.videos.length} videos, {eff.categories.length} categories, {eff.creators.length} models, {eff.channels.length} channels, {eff.tags.length} tags). New videos and taxonomy appear here automatically. The URLs are real paths with no # fragment, because crawlers strip fragments and would see every URL as the home page; opening one of these paths in the app resolves to the same page the site&rsquo;s own hash links open. This page is the in-app preview: download the file and, if the site is hosted on a domain with real paths, place it at the root as /sitemap.xml so crawlers can fetch it.</>
                  : <>No # anywhere in this file: in robots.txt a # starts a comment, so the old Disallow: /#/… lines were each read as Disallow: / — blocking the whole site. The file now allows everything and points crawlers to the sitemap. This page is the in-app preview: this site is served as a single page, so if the site is hosted on a domain with real paths, place the downloaded robots.txt and sitemap.xml at the domain root.</>}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadTextFile(name, text, fileView === "sitemap" ? "application/xml" : "text/plain")} className="rounded-full bg-[var(--accent)] px-6 py-3 font-display text-sm font-black text-white transition active:scale-95">Download {name}</button>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => flash(`${name} copied`), () => flash("Copy failed — select the text below instead")); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Copy</button>
                <button type="button" onClick={() => goTab("home")} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Back to site</button>
              </div>
              <pre className="mt-5 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs leading-relaxed text-zinc-200">{text}</pre>
            </section>
          );
        })()}

        {/* ===== HISTORY ===== */}
        {!notFound && historyView && (
          <section className="pt-5" aria-label="History">
            <h1 className="font-display text-xl font-black text-white sm:text-2xl">History</h1>
            <p className="mt-1 text-sm text-[var(--dim)]">Videos you watched on this device. {!signedIn && <button type="button" onClick={() => openAuth("login")} className="font-semibold text-[var(--accent)]">Log in to keep them on all your devices.</button>}</p>
            {history.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-300">Nothing watched yet. Videos you watch on this device appear here.</p>
            ) : (
              <>
                {adminToken && (
                  <div className="mt-3 text-right">
                    <button type="button" onClick={() => clearHist.mutate()} className="inline-flex items-center gap-1 py-1 text-sm text-[var(--dim)]"><Icon n="trash" size={15} tone="accent" /> Clear history</button>
                  </div>
                )}
                <div className="mt-2 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                  {history.slice(0, 200).map((id) => { const v = byId(id); return v ? <VideoCard key={id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} /> : null; })}
                </div>
              </>
            )}
          </section>
        )}

        {/* ===== VIDEO PLAYER VIEW ===== */}
        {!notFound && !historyView && current && (
          <section aria-label="Video player" className="pt-4">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 pb-3 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <button type="button" onClick={() => openListing({ kind: "category", name: current.category })} className="py-0.5 hover:text-white">{current.category}</button>
              <span aria-hidden="true">/</span>
              <span className="line-clamp-1 max-w-[55%] text-zinc-300">{current.title}</span>
            </nav>
            <button type="button" onClick={() => flash(`More from ${current.creator} is waiting in Up next below`)} className="block w-full rounded-xl bg-[var(--surface)] px-3 py-2.5 text-left text-sm"><span className="font-display mr-2 font-black text-[var(--accent)]">WATCH MORE</span><span className="text-zinc-200">Click here for more exclusive content</span></button>
            {current.embedUrl ? (
              <EmbedPlayer v={current} preroll={ads.preroll} />
            ) : (
            <div ref={playerRef} onMouseMove={(e) => { artHide.poke(); artLastPointer.current = { x: e.clientX, y: e.clientY }; updateArtSeekHover(e.clientX, e.clientY); }} onTouchStart={artHide.poke} className={`pv-darkzone pv-fs relative overflow-hidden ${artFs.expanded ? "fixed inset-0 z-[85] m-0 h-[100dvh] w-full bg-black" : artTheater ? "mt-3 rounded-none" : "-mx-4 mt-3 sm:mx-0 sm:rounded-xl"}`} style={artFs.expanded ? (artFs.rotated ? { width: "100dvh", height: "100dvw", left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(90deg)", background: `linear-gradient(135deg, ${current.g[0]}, ${current.g[1]})` } : { background: `linear-gradient(135deg, ${current.g[0]}, ${current.g[1]})` }) : artTheater ? { aspectRatio: "16/9", background: `linear-gradient(135deg, ${current.g[0]}, ${current.g[1]})`, width: "100vw", marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)" } : { aspectRatio: "16/9", background: `linear-gradient(135deg, ${current.g[0]}, ${current.g[1]})` }}>
              <Motif v={current} big />
              {artPrerollShown && artPrerollAd && <PrerollAd ad={artPrerollAd} onDone={skipArtPreroll} />}
              <span className="absolute inset-0 bg-black/25" aria-hidden="true" />
              <SeekFlash flash={artTap.flash} />
              {!playing && (
                <>
                  {/* Tap surface for the paused art player: a single tap
                      resumes (via the double-tap handler), a double-tap
                      on a half seeks ∓10s while staying paused. The
                      center button above it keeps its instant resume. */}
                  <button type="button" aria-label="Play video" onClick={(e) => artTap.handleTap(e.clientX, e.currentTarget.getBoundingClientRect())} className="absolute inset-0" />
                  <button type="button" aria-label={progress > 0 ? "Resume video" : "Play video"} onClick={startPlayback} className="play-pulse absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                    <Icon n="play" size={34} />
                  </button>
                  <span className="pointer-events-none absolute left-1/2 top-[calc(50%+58px)] -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm font-bold text-white">{btnLabel("watchFull", "Watch Full Video")}</span>
                </>
              )}
              {playing && <button type="button" aria-label="Pause video" onClick={(e) => artTap.handleTap(e.clientX, e.currentTarget.getBoundingClientRect())} className="absolute inset-0" />}
              <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 transition-opacity duration-300 ${artHide.hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}>
                <div className="flex items-center gap-3 text-white [&_button]:transition [&_button]:active:scale-90">
                  <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={startPlayback} className="p-1"><Icon n={playing ? "pause" : "play"} size={20} tone="accent" /></button>
                  <span className="text-sm font-medium tabular-nums">{fmtTime((progress / 100) * current.durationSec)} / {current.duration}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} className="p-1.5"><Icon n={muted ? "mute" : "volume"} size={20} tone="accent" /></button>
                    <input aria-label="Volume" type="range" min={0} max={100} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="hidden w-16 accent-[var(--accent)] sm:block" />
                    <SpeedMenu speed={speed} open={speedMenuOpen} onToggle={() => setSpeedMenuOpen((o) => !o)} onSelect={(s) => { setSpeed(s); setSpeedMenuOpen(false); }} />
                    <button type="button" aria-label={artTheater ? "Exit theater mode" : "Theater mode"} aria-pressed={artTheater} onClick={() => setArtTheater((t) => !t)} className="hidden p-1.5 md:block"><Icon n="theater" size={20} tone="accent" /></button>
                    <button type="button" aria-label={artFs.big ? "Exit fullscreen" : "Fullscreen"} aria-pressed={artFs.big} onClick={artFs.toggle} className="p-1.5"><Icon n={artFs.big ? "compress" : "expand"} size={20} tone="accent" /></button>
                  </span>
                </div>
                <button type="button" aria-label="Seek" ref={artSeekBtnRef} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setProgress(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))); }} onMouseEnter={(e) => updateArtSeekHover(e.clientX, e.clientY)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const pct = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)); setArtSeekHover({ pct, time: (pct / 100) * current.durationSec }); }} onMouseLeave={() => setArtSeekHover(null)} className="group/seek relative mt-1 block h-4 w-full">
                  {artSeekHover && (
                    <span className="pointer-events-none absolute -top-9 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-xs font-bold text-white shadow" style={{ left: `${Math.min(96, Math.max(4, artSeekHover.pct))}%` }}>{fmtTime(artSeekHover.time)}</span>
                  )}
                  <span className="block h-1 w-full rounded bg-white/30 transition-all group-hover/seek:h-2"><span className="block h-full rounded bg-[var(--accent)]" style={{ width: `${progress}%` }} /></span>
                </button>
              </div>
            </div>
            )}

            <AdSlot ad={ads.videoBelow} label="Video page ad" />

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
            <div className="min-w-0">
            <h1 className="font-display mt-4 text-lg font-extrabold leading-tight text-white sm:text-xl">{current.title}</h1>
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-[13px] text-[var(--dim)]">
              {current.hasViews && <span>{fmtViews(current.views)} views</span>}
              {current.hasDate && <span>{current.age}</span>}
              {current.hasRating && <span className="font-semibold text-[var(--accent)]">{current.rating}% liked</span>}
            </p>

            <div className="no-scrollbar mt-3 flex items-center gap-3 overflow-x-auto border-b border-[var(--border)] pb-3 text-white [&>button]:shrink-0">
              <button type="button" aria-label="Like video" aria-pressed={likes.includes(current.id)} onClick={() => toggle.mutate({ kind: "like", itemKey: current.id })} className={`flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90 ${likes.includes(current.id) ? "text-[var(--accent)]" : ""}`}><Icon n="like" size={19} tone="accent" /><span className="text-sm font-semibold">{btnLabel("like", "Like")}</span></button>
              <button type="button" aria-label="Dislike video" onClick={() => flash("Thanks for the feedback")} className="flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90"><Icon n="dislike" size={19} tone="accent" /><span className="text-sm font-semibold">Dislike</span></button>
              <button type="button" aria-label="Save to Watch later" aria-pressed={saves.includes(current.id)} onClick={() => toggle.mutate({ kind: "save", itemKey: current.id })} className={`flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90 ${saves.includes(current.id) ? "text-[var(--accent)]" : ""}`}><Icon n="bookmark" size={19} tone="accent" /><span className="text-sm font-semibold">{btnLabel("save", "Save")}</span></button>
              <button type="button" aria-label="Add to playlist" onClick={() => { if (!saves.includes(current.id)) toggle.mutate({ kind: "save", itemKey: current.id }); flash("Added to your Watch later playlist"); }} className="flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90"><Icon n="list" size={19} tone="accent" /><span className="text-sm font-semibold">Playlist</span></button>
              <button type="button" aria-label="Share video" onClick={() => flash("Link ready — use your browser's share menu to send it")} className="p-2 transition active:scale-90"><Icon n="share" size={20} tone="accent" /></button>
              <button type="button" aria-label="Comments" onClick={() => setCommentsOpen(!commentsOpen)} className="flex items-center gap-1 p-2 transition active:scale-90"><Icon n="comment" size={20} tone="accent" /><span className="text-sm font-semibold">2</span></button>
              <button type="button" aria-label="Report video" onClick={() => flash("Thanks — our team will take a look")} className="flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90"><Icon n="flag" size={19} tone="accent" /><span className="text-sm font-semibold">Report</span></button>
            </div>

            {current.creator && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={() => openListing({ kind: "creator", name: current.creator })} className="flex items-center gap-2.5 transition active:scale-[0.97]" aria-label={`More videos by ${current.creator}`}>
                {(() => { const c = CREATORS.find((x) => x.name === current.creator); return c ? <Avatar name={c.name} g={c.g} size={40} photo={c.photo} /> : null; })()}
                <span className="text-left"><span className="block text-sm font-bold text-white">{current.creator}</span><span className="block text-xs text-[var(--dim)]">{follows.includes(current.creator) ? "You follow this model" : "Model"}</span></span>
              </button>
              <button type="button" onClick={() => toggle.mutate({ kind: "follow", itemKey: current.creator })} className={`ml-auto rounded-full px-5 py-2.5 font-bold ${follows.includes(current.creator) ? "bg-[var(--surface2)] text-white" : "bg-[var(--accent)] text-white"}`}>{follows.includes(current.creator) ? "Following" : btnLabel("follow", "Follow")}</button>
            </div>
            )}

            <div className="mt-4">
              <div ref={tagsRef} className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${tagsOpen ? "" : "max-h-6 overflow-hidden"}`}>
                <button type="button" onClick={() => openListing({ kind: "category", name: current.category })} className="py-0.5 font-medium text-zinc-300 transition hover:text-[var(--accent)]">{current.category}</button>
                {current.tags.map((t) => (
                  <button key={t} type="button" onClick={() => openListing({ kind: "tag", name: t })} className="py-0.5 font-medium capitalize text-zinc-300 transition hover:text-[var(--accent)]">{t}</button>
                ))}
              </div>
              {(tagsOverflow || tagsOpen) && (
                <button type="button" onClick={() => setTagsOpen(!tagsOpen)} aria-expanded={tagsOpen} className="mt-1 py-1 text-sm font-semibold text-[var(--accent)] transition active:scale-95">{tagsOpen ? "See less" : "See more"}</button>
              )}
            </div>

            <div className="mt-5">
              <button type="button" onClick={() => setDescOpen(!descOpen)} aria-expanded={descOpen} className="py-1 font-semibold text-[var(--accent)] underline decoration-[var(--accent)]/60 underline-offset-4 transition hover:decoration-[var(--accent)] active:scale-95">{descOpen ? "Hide description" : "Show description"}</button>
              {descOpen && (
                <div className="mt-3">
                  {(current.description || !current.custom) && (
                    <p className="text-sm leading-relaxed text-zinc-200">
                      {current.description ?? `Filmed and edited by ${current.creator}, this ${current.category.toLowerCase()} video covers ${current.tags.join(", ")}. It has been watched ${fmtViews(current.views)} times and ${current.rating}% of viewers liked it. Watch in up to 4K, save it to Watch later, or follow ${current.creator} so new uploads land in your Following list.`}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">Categories:</span>
                    <button type="button" onClick={() => openListing({ kind: "category", name: current.category })} className="rounded-md bg-[var(--surface2)] px-3 py-1.5 text-sm font-medium text-zinc-100 transition hover:text-[var(--accent)] active:scale-95">{current.category}</button>
                  </div>
                  {(() => { const ms = [...new Set([current.creator, ...current.models].filter(Boolean))]; return ms.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">Models:</span>
                      {ms.map((m) => (
                        <button key={m} type="button" onClick={() => openListing({ kind: "creator", name: m })} className="rounded-md bg-[var(--surface2)] px-3 py-1.5 text-sm font-medium text-zinc-100 transition hover:text-[var(--accent)] active:scale-95">{m}</button>
                      ))}
                    </div>
                  ) : null; })()}
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <h2 className="font-display text-xl font-extrabold text-white">Comments <span className="text-[var(--dim)]">2</span></h2>
              {commentsOpen ? (
                <div className="mt-3 space-y-4">
                  <p className="text-sm text-zinc-200"><span className="font-bold text-white">travel.fan</span> <span className="text-[var(--dim)]">· 3 days ago</span><br />Great pacing — the middle section was my favourite part.</p>
                  <p className="text-sm text-zinc-200"><span className="font-bold text-white">nightowl</span> <span className="text-[var(--dim)]">· 1 week ago</span><br />Watched this twice already. Instant save.</p>
                  <button type="button" onClick={() => setCommentsOpen(false)} className="py-1 font-semibold text-[var(--dim)]">Hide comments</button>
                </div>
              ) : (
                <button type="button" onClick={() => setCommentsOpen(true)} className="mt-3 w-full rounded-full border border-[var(--border)] py-2.5 font-bold text-white">Show comments</button>
              )}
            </div>
            </div>

            <aside className="mt-8 min-w-0 lg:mt-3" aria-label="Suggested videos">
              {suggested.length > 0 && (
                <>
                  <h2 className="font-display mb-3 mt-6 flex items-center gap-2 text-lg font-black text-white sm:text-xl">Suggested for you <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-black text-black">Ad</span></h2>
                  <div className="flex flex-col gap-5">
                    {suggested.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} />)}
                  </div>
                  <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "feed", name: "Top rated" })} />
                </>
              )}
              <div className="mb-3 mt-7 flex items-center justify-between">
                <h2 className="font-display text-lg font-black text-white sm:text-xl">Up next</h2>
                <button type="button" role="switch" aria-checked={autoplay} aria-label="Autoplay" onClick={() => setAutoplay(!autoplay)} className="flex items-center gap-2 py-1 text-sm font-medium text-[var(--dim)]">
                  Autoplay
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${autoplay ? "bg-[var(--accent)]" : "bg-zinc-600"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${autoplay ? "left-[22px]" : "left-0.5"}`} /></span>
                </button>
              </div>
              <div className="flex flex-col gap-5">
                {upNext.map((v, i) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} badge={i === 0 ? "UP NEXT" : undefined} />)}
              </div>
              {upNext[0] && <NextButton label="Next video" onClick={() => { const n = upNext[0]; if (n) openVideo(n); }} />}
            </aside>
            </div>

            {moreLikeThis.length > 0 && (
              <section aria-label="More like this" className="pt-8">
                <h2 className="font-display text-lg font-black text-white sm:text-xl">More like this</h2>
                <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                  {moreLikeThis.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} />)}
                </div>
                <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "category", name: current.category })} />
              </section>
            )}

            {tagTitleMatches.length > 0 && (
              <section aria-label="Matched by tags and title" className="pt-9">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-lg font-black text-white sm:text-xl">Matched by tags &amp; title</h2>
                  <button type="button" onClick={() => openListing({ kind: "tag", name: current.tags[0] ?? current.category })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
                </div>
                <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                  {tagTitleMatches.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} />)}
                </div>
                <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "tag", name: current.tags[0] ?? current.category })} />
              </section>
            )}

            <section aria-label={`Because you watch ${becauseTag}`} className="pt-9">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black text-white sm:text-xl">{texts.secBecause} {titleCase(becauseTag)}</h2>
                <button type="button" onClick={() => openListing({ kind: "tag", name: becauseTag })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {VIDEOS.filter((v) => v.id !== current.id && (v.tags.includes(becauseTag) || v.category === current.category)).slice(0, 4).map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} />)}
              </div>
              <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "tag", name: becauseTag })} />
            </section>

            <section aria-label="Trending now" className="pt-9">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black text-white sm:text-xl">{texts.secTrending}</h2>
                <button type="button" onClick={() => openListing({ kind: "feed", name: "Trending" })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {trending.slice(0, 6).map((v, i) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} rank={i + 1} />)}
              </div>
              <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "feed", name: "Trending" })} />
            </section>

            <nav aria-label="Breadcrumb" className="mt-9 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-4 text-sm text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-1 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <button type="button" onClick={() => openListing({ kind: "category", name: current.category })} className="py-1 hover:text-white">{current.category}</button>
              <span aria-hidden="true">/</span>
              <span className="line-clamp-1 max-w-[55%] text-zinc-300">{current.title}</span>
            </nav>

            <AdSlot ad={ads.videoBottom} label="Video page bottom ad" />
          </section>
        )}

        {/* ===== LISTING (tag / category / model / channel / feed / search results) ===== */}
        {!notFound && !historyView && !current && listing && (() => {
          const base = listingVideos(listing);
          let list = [...base];
          if (sortBy === "Most viewed" || sortBy === "Popular") list.sort((a, b) => b.views - a.views);
          else if (sortBy === "Trending") list.sort((a, b) => b.views / (b.days + 1) - a.views / (a.days + 1));
          else if (sortBy === "Top rated") list.sort((a, b) => b.rating - a.rating);
          else if (sortBy === "Longest") list.sort((a, b) => b.durationSec - a.durationSec);
          else if (sortBy === "Newest") list.sort((a, b) => a.days - b.days);
          const f = appliedFilters;
          if (f.len === "Under 5 min") list = list.filter((v) => v.durationSec < 300);
          else if (f.len === "5–10 min") list = list.filter((v) => v.durationSec >= 300 && v.durationSec < 600);
          else if (f.len === "10–20 min") list = list.filter((v) => v.durationSec >= 600 && v.durationSec < 1200);
          else if (f.len === "20–40 min") list = list.filter((v) => v.durationSec >= 1200 && v.durationSec < 2400);
          else if (f.len === "Over 40 min") list = list.filter((v) => v.durationSec >= 2400);
          if (f.quality === "Full HD 1080p") list = list.filter((v) => v.hd);
          if (f.added === "Today") list = list.filter((v) => v.days <= 1);
          else if (f.added === "This week") list = list.filter((v) => v.days <= 7);
          else if (f.added === "This month") list = list.filter((v) => v.days <= 30);
          else if (f.added === "This year") list = list.filter((v) => v.days <= 365);
          if (f.incl.length) list = list.filter((v) => f.incl.includes(v.category));
          if (f.excl.length) list = list.filter((v) => !f.excl.includes(v.category));
          if (hideWatched) list = list.filter((v) => !history.includes(v.id));
          const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
          const safePage = Math.min(listPage, totalPages);
          const paged = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
          const creatorInfo = listing.kind === "creator" ? CREATORS.find((c) => c.name === listing.name) : undefined;
          const heading = listingHeading(listing);
          const related = relatedFor(listing);
          const tagEmpty = listing.kind === "tag" && base.length === 0;
          if (tagEmpty) {
            return (
              <section className="pt-10 text-center" aria-label="Tag not found">
                <h1 className="font-display text-2xl font-black text-white">Page not found</h1>
                <p className="mt-2 text-[var(--dim)]">This page does not exist or was removed.</p>
                <button type="button" onClick={() => goTab("home")} className="mt-5 rounded-full bg-[var(--accent)] px-8 py-3 font-bold text-white">Home</button>
              </section>
            );
          }
          return (
            <section className="pt-5" aria-label={heading}>
              <div className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4" role="tablist" aria-label="Feed filters">
                {FEED_TABS.map((t) => {
                  const active = listing.kind === "feed" && listing.name === t;
                  return (
                    <button key={t} role="tab" aria-selected={active} type="button" onClick={() => { if (t === "For you") { goTab("home"); } else { setFeed(t); openListing({ kind: "feed", name: t }); } }} className={`relative flex min-h-11 shrink-0 items-start pt-1.5 pb-2 text-sm font-semibold transition active:scale-95 ${active ? "text-white" : "text-[var(--dim)]"}`}>
                      {t}
                      {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded bg-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
              <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
                <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
                <span aria-hidden="true">/</span>
                <button type="button" onClick={() => listingBack(listing)} className="py-0.5 hover:text-white">{listingSegment(listing)}</button>
                <span aria-hidden="true">/</span>
                <span className="line-clamp-1 max-w-[55%] font-semibold capitalize text-zinc-200">{listing.kind === "feed" ? heading : listing.name}</span>
              </nav>
              <button type="button" onClick={() => listingBack(listing)} className="mt-3 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-white transition active:scale-95">← Back to {listingSegment(listing)}</button>
              <h1 className="font-display mt-4 text-xl font-black capitalize leading-tight text-white sm:text-2xl">{heading}</h1>
              <p className="mt-1 text-[13px] text-[var(--dim)]">{listingCount(listing, list)}{listing.kind === "creator" && creatorInfo ? ` · ${creatorInfo.followers} followers` : ""}</p>

              {listing.kind === "search" && (
                <>
                  <div className="mt-4 flex gap-2">
                    <label className="relative flex-1">
                      <input aria-label="Search term" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && searchDraft.trim()) { const text = searchDraft.trim(); openListing({ kind: "search", name: text }); if (text.length >= 6 && !/\s/.test(text)) void tryAdminCode(text).then((ok) => { if (ok) { setSearchDraft(""); setQuery(""); goAdmin(); } }); } }} className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-3 pl-4 pr-11 text-sm text-white placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none" />
                      {searchDraft
                        ? <button type="button" aria-label="Clear search" onClick={() => { setSearchDraft(""); setQuery(""); goTab("tags"); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--accent)]"><Icon n="x" size={18} tone="accent" /></button>
                        : <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--accent)]"><Icon n="search" size={19} tone="accent" /></span>}
                    </label>
                    <button type="button" onClick={() => { setSearchDraft(""); setQuery(""); goTab("tags"); }} className="shrink-0 rounded-full border border-[var(--border)] px-5 font-bold text-white">Clear</button>
                  </div>
                  <nav className="mt-4" aria-label="Related searches">
                    <span className="text-sm font-semibold text-[var(--dim)]">Related searches: </span>
                    {related.map((r) => (
                      <button key={r} type="button" onClick={() => openListing({ kind: "search", name: r })} className="mr-3 py-1 text-sm capitalize text-zinc-300 hover:text-white">{r}</button>
                    ))}
                  </nav>
                </>
              )}

              {listing.kind === "creator" && creatorInfo && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <Avatar name={creatorInfo.name} g={creatorInfo.g} size={100} photo={creatorInfo.photo} />
                    <div>
                      <p className="text-[13px] text-[var(--dim)]">{creatorInfo.videos} videos · {creatorInfo.followers} followers</p>
                      <button type="button" aria-pressed={follows.includes(listing.name)} onClick={() => toggle.mutate({ kind: "follow", itemKey: listing.name })} className={`mt-2 rounded-full px-6 py-2.5 font-bold ${follows.includes(listing.name) ? "bg-[var(--surface2)] text-white" : "bg-[var(--accent)] text-white"}`}>{follows.includes(listing.name) ? "Following" : btnLabel("follow", "Follow")}</button>
                    </div>
                  </div>
                  <p className={`mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 ${bioOpen ? "" : "line-clamp-2"}`}>{creatorInfo.name} is one of the most-watched models on Pulse Video, with {creatorInfo.videos} videos and {creatorInfo.followers} followers. New uploads land every week — follow {creatorInfo.name} and they will show up in your Following list on your profile.</p>
                  <button type="button" onClick={() => setBioOpen(!bioOpen)} className="mt-1 py-1 font-semibold text-[var(--accent)]">{bioOpen ? "Less" : "More"}</button>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <label className="flex items-center gap-2 text-sm text-[var(--dim)]">
                  <span className="sr-only">Sort videos</span>
                  <select aria-label="Sort videos" value={sortBy} onChange={(e) => {
                    const v = e.target.value;
                    setListPage(1);
                    scrollTopInstant();
                    if (listing.kind === "feed") {
                      if (v === "Newest") { openListing({ kind: "feed", name: "New" }); return; }
                      if (v === "Top rated") { openListing({ kind: "feed", name: "Top rated" }); return; }
                      if (v === "Popular") { openListing({ kind: "feed", name: "Trending" }); return; }
                    }
                    setSortBy(v);
                  }} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-semibold text-white focus:border-[var(--accent)] focus:outline-none">
                    {sortOptionsFor(listing).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <button type="button" aria-expanded={filtersOpen} onClick={() => { setDraftFilters(appliedFilters); setFiltersOpen(true); }} className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-bold text-white"><Icon n="funnel" size={16} tone="accent" /> Filters</button>
                <button type="button" role="switch" aria-checked={hideWatched} aria-label="Hide watched" onClick={() => { setHideWatched(!hideWatched); scrollTopInstant(); }} className="flex items-center gap-2 py-1 text-sm font-medium text-[var(--dim)]">
                  Hide watched
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${hideWatched ? "bg-[var(--accent)]" : "bg-zinc-600"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${hideWatched ? "left-[22px]" : "left-0.5"}`} /></span>
                </button>
              </div>

              {list.length === 0 ? (
                <div className="py-12 text-center">
                  {base.length === 0 ? (
                    <>
                      <p className="font-semibold text-white">No videos here yet</p>
                      <p className="mt-1 text-sm text-[var(--dim)]">Here are the top rated videos instead:</p>
                      <div className="mt-5 mx-auto flex w-full max-w-[760px] flex-col gap-6 text-left">{topRated.slice(0, 4).map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} />)}</div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-white">No videos match these filters</p>
                      <p className="mt-1 text-sm text-[var(--dim)]">Try clearing the filters or Hide watched.</p>
                      <button type="button" onClick={() => { setAppliedFilters(NO_FILTERS); setHideWatched(false); }} className="mt-4 rounded-full bg-[var(--accent)] px-6 py-2.5 font-bold text-white">Clear filters</button>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-5 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                  {paged.map((v, i) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} priority={i === 0} />)}
                </div>
              )}

              <NextButton disabled={safePage >= totalPages} onClick={() => { setListPage(safePage + 1); scrollTopInstant(); }} />
              <Pagination page={safePage} total={totalPages} nextLabel={btnLabel("next", "Next")} onChange={(p) => { setListPage(p); scrollTopInstant(); }} />

              {listing.kind !== "search" && (
                <nav className="mt-9" aria-label="Related searches">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--dim)]">Related searches</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                    {related.map((r) => (
                      <button key={r} type="button" onClick={() => openListing({ kind: "search", name: r })} className="py-1 text-sm capitalize text-zinc-300 hover:text-white">{r}</button>
                    ))}
                  </div>
                </nav>
              )}
            </section>
          );
        })()}

        {/* ===== HOME ===== */}
        {!notFound && !historyView && !current && !listing && !fileView && !legalView && tab === "home" && (
          <>
            <h1 className="font-display pt-5 text-xl font-black leading-tight text-white sm:text-2xl">{texts.homeH1}</h1>
            <div className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4 pt-3" role="tablist" aria-label="Feed filters">
              {FEED_TABS.map((t) => {
                const active = t === "For you";
                return (
                  <button key={t} role="tab" aria-selected={active} type="button" onClick={() => { if (t === "For you") { goTab("home"); } else { setFeed(t); openListing({ kind: "feed", name: t }); } }} className={`relative flex min-h-11 shrink-0 items-start pt-1.5 pb-2 text-sm font-semibold transition active:scale-95 ${active ? "text-white" : "text-[var(--dim)]"}`}>
                    {t}
                    {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded bg-[var(--accent)]" />}
                  </button>
                );
              })}
            </div>
            <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto border-b border-[var(--border)] px-4 py-3">
              {chipNames.map((name) => (
                <button key={name} type="button" aria-pressed={chip === name} onClick={() => { setChip(name); setShowAll(false); scrollTopInstant(); }} className={`flex min-h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold transition active:scale-95 ${chip === name ? "bg-white text-black" : "text-zinc-300 hover:text-white"}`}>{name}</button>
              ))}
              <button type="button" onClick={() => goTab("categories")} className="flex min-h-11 shrink-0 items-center text-[13px] font-bold text-[var(--accent)]">All {CATEGORIES.length}</button>
            </div>

            <AdSlot ad={ads.homeTop} label="Home top ad" />

            {trending.length > 0 && (
            <section aria-label="Trending now" className="pt-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secTrending}</h2>
                <button type="button" onClick={() => { setFeed("Trending"); openListing({ kind: "feed", name: "Trending" }); }} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mx-auto mt-3 flex w-full max-w-[760px] flex-col gap-6">
                {trending.map((v, i) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} rank={i + 1} priority={i === 0} />)}
              </div>
            <NextButton label={btnLabel("next", "Next")} onClick={() => { setFeed("Trending"); openListing({ kind: "feed", name: "Trending" }); }} />
            </section>
            )}

            {latestHome.length > 0 && (
            <section aria-label="Latest videos" className="pt-7 [content-visibility:auto] [contain-intrinsic-size:auto_900px]">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{chip === "All" ? texts.secLatest : `${chip} videos`}</h2>
                <button type="button" onClick={() => openListing({ kind: "feed", name: "New" })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {latestHome.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} badge={v.days <= 6 ? "NEW" : undefined} />)}
              </div>
              {!showAll && (chip === "All" ? newest.length : newest.filter((v) => v.category === chip || v.tags.includes(chip.toLowerCase())).length) > 24 && (
                <div className="mt-7 text-center">
                  <button type="button" onClick={() => setShowAll(true)} className="rounded-full bg-white px-10 py-3.5 font-bold text-black">{btnLabel("showMore", "Show more")}</button>
                </div>
              )}
            <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "feed", name: "New" })} />
            </section>
            )}

            {/* The home showcase lists only models that actually have
                videos; the full list (including empty ones) stays on
                the Models tab. With none, the section hides instead of
                parading "0 videos" entries. */}
            {CREATORS.some((c) => c.videos > 0) && (
            <section aria-label="Popular models" className="pt-9 [content-visibility:auto] [contain-intrinsic-size:auto_900px]">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secModels}</h2>
                <button type="button" onClick={() => goTab("creators")} className="py-1 text-[13px] text-[var(--dim)]">All models</button>
              </div>
              <div className="no-scrollbar -mx-4 mt-4 flex gap-5 overflow-x-auto px-4 pb-1 [scroll-snap-type:x_mandatory] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
                {CREATORS.filter((c) => c.videos > 0).slice(0, 12).map((c) => (
                  <div key={c.name} className="flex w-[104px] shrink-0 snap-start flex-col items-center text-center sm:w-auto">
                    <button type="button" aria-label={`Videos by ${c.name}`} onClick={() => openListing({ kind: "creator", name: c.name })} className="transition active:scale-95"><Avatar name={c.name} g={c.g} size={100} photo={c.photo} /></button>
                    <span className="mt-2 line-clamp-1 max-w-full text-sm font-bold text-white">{c.name}</span>
                    <span className="text-xs text-[var(--dim)]">{c.videos} videos</span>
                  </div>
                ))}
              </div>
            </section>
            )}

            {/* Same rule as Popular models: only channels with videos
                are showcased on home; empty ones stay on the Channels
                tab, and the section hides when none qualify. */}
            {CHANNELS.some((ch) => Number(ch.videos) > 0) && (
            <section aria-label="Channels" className="pt-9 [content-visibility:auto] [contain-intrinsic-size:auto_900px]">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secChannels}</h2>
                <button type="button" onClick={() => goTab("channels")} className="py-1 text-[13px] text-[var(--dim)]">All channels</button>
              </div>
              <div className="mt-2">
                {CHANNELS.filter((ch) => Number(ch.videos) > 0).map((ch) => (
                  <button key={ch.name} type="button" onClick={() => openListing({ kind: "channel", name: ch.name })} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-3 text-left transition active:bg-[var(--surface)]" aria-label={`Channel ${ch.name}`}>
                    <span className="text-sm font-semibold text-white">{ch.name}</span>
                    <span className="text-xs text-[var(--dim)]">{ch.videos} videos</span>
                  </button>
                ))}
              </div>
            </section>
            )}

            {becauseList.length > 0 && (
            <section aria-label={`Because you watch ${becauseCat}`} className="pt-9 [content-visibility:auto] [contain-intrinsic-size:auto_900px]">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secBecause} {becauseCat}</h2>
                <button type="button" onClick={() => openListing({ kind: "category", name: becauseCat })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {becauseList.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} />)}
              </div>
            <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "category", name: becauseCat })} />
            </section>
            )}

            {topRated.length > 0 && (
            <section aria-label="Top rated" className="pt-9 [content-visibility:auto] [contain-intrinsic-size:auto_900px]">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secTopRated}</h2>
                <button type="button" onClick={() => { setFeed("Top rated"); openListing({ kind: "feed", name: "Top rated" }); }} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {topRated.slice(0, 8).map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} />)}
              </div>
            <NextButton label={btnLabel("next", "Next")} onClick={() => { setFeed("Top rated"); openListing({ kind: "feed", name: "Top rated" }); }} />
            </section>
            )}

            <AdSlot ad={ads.homeBottom} label="Home bottom ad" />

          </>
        )}

        {/* ===== CHANNELS ===== */}
        {!notFound && !historyView && !current && !listing && tab === "channels" && (
          <section className="pt-5" aria-label="Channels">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-zinc-200">Channels</span>
            </nav>
            <h1 className="font-display mt-3 text-xl font-black text-white sm:text-2xl">Top Rated Channels</h1>
            <p className="mt-1 text-[13px] text-[var(--dim)]">{channelsWithVideos.length} channels</p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3">
              {channelsWithVideos.map((ch) => (
                <button key={ch.name} type="button" onClick={() => openListing({ kind: "channel", name: ch.name })} className="relative block overflow-hidden rounded-xl text-left transition active:scale-[0.98]" style={{ aspectRatio: "16/9", background: `linear-gradient(135deg, ${ch.g[0]}, ${ch.g[1]})` }} aria-label={`Channel ${ch.name}`}>
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" aria-hidden="true" />
                  <span className="absolute inset-x-3 bottom-2.5">
                    <span className="font-display block line-clamp-1 text-sm font-extrabold text-white">{ch.name}</span>
                    <span className="block text-xs text-zinc-300">{ch.videos} videos</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== CATEGORIES ===== */}
        {!notFound && !historyView && !current && !listing && tab === "categories" && (
          <section className="pt-5" aria-label="Categories">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-zinc-200">Categories</span>
            </nav>
            <h1 className="font-display mt-3 text-xl font-black text-white sm:text-2xl">Video Categories</h1>
            <p className="mt-1 text-[13px] text-[var(--dim)]">{CATEGORIES.length} categories</p>
            <div className="mx-auto mt-3 flex w-full max-w-[760px] flex-col gap-6">
              {CATEGORIES.map((c) => {
                const top = topByCategory.get(c.name);
                return (
                  <button key={c.name} type="button" onClick={() => openListing({ kind: "category", name: c.name })} className="group block w-full text-left transition active:scale-[0.99]" aria-label={`${c.name}, ${c.count} videos`}>
                    {top ? (
                      <span className="relative block">
                        <Thumb v={top} />
                        <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10 text-white">
                          <span className="font-display block text-lg font-black">{c.name}</span>
                          <span className="text-sm text-zinc-300">{c.count} videos</span>
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-between rounded-xl bg-[var(--surface)] px-4 py-4">
                        <span className="text-sm font-bold text-white">{c.name}</span>
                        <span className="text-xs text-[var(--dim)]">{c.count}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => flash(`All ${CATEGORIES.length} categories are shown above`)} className="mt-6 w-full rounded-full border border-[var(--border)] py-3.5 font-bold text-white">All {CATEGORIES.length} categories</button>
            <button type="button" onClick={() => goTab("creators")} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-4 text-left"><span className="text-sm text-white">Models</span><span className="text-[var(--dim)]">{CREATORS.length}</span></button>
            <button type="button" onClick={() => goTab("channels")} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-4 text-left"><span className="text-sm text-white">Channels</span><span className="text-[var(--dim)]">{CHANNELS.length}</span></button>
            <button type="button" onClick={() => goTab("tags")} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-4 text-left"><span className="text-sm text-white">All tags</span><span className="text-[var(--dim)]">{TAGS.length}</span></button>
            <button type="button" onClick={() => flash("Language is set to English — 19 more in the selector above")} className="mt-5 flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left">
              <span className="text-sm text-white">Language</span><span className="text-[var(--dim)]">English and 19 more</span>
            </button>
            {signedIn ? (
              <p className="mt-5 rounded-2xl bg-[var(--surface)] px-4 py-4 text-center text-white">Signed in as <b>Guest viewer</b> · <button type="button" className="font-bold text-[var(--accent)]" onClick={() => setSignedIn(false)}>Log out</button></p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => openAuth("login")} className="rounded-full border border-zinc-600 py-3.5 font-bold text-white">Log in</button>
                <button type="button" onClick={() => openAuth("signup")} className="rounded-full bg-[var(--accent)] py-3.5 font-bold text-white">Sign up</button>
              </div>
            )}
          </section>
        )}

        {/* ===== TAGS ===== */}
        {!notFound && !historyView && !current && !listing && tab === "tags" && (
          <section className="pt-5" aria-label="Tags">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-zinc-200">Tags</span>
            </nav>
            <h1 className="font-display mt-3 text-xl font-black text-white sm:text-2xl">Tags</h1>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {LETTERS.map((l) => (
                <button key={l} type="button" aria-pressed={letter === l} aria-label={l === "Popular" ? "Popular tags" : `Tags starting with ${l}`} onClick={() => { setLetter(l); scrollTopInstant(); }} className={`flex items-center justify-center font-semibold ${l === "Popular" ? "rounded-full px-5" : "h-11 w-11 rounded-full text-sm"} ${letter === l ? "bg-white text-black" : "bg-[var(--surface2)] text-white"}`} style={l === "Popular" ? { height: 48 } : undefined}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-6">
              {shownTags.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-[var(--dim)]">No tags under “{letter}” in the catalog yet.</p>
                  <button type="button" onClick={() => { setLetter("Popular"); scrollTopInstant(); }} className="mt-4 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white transition active:scale-95">Browse popular tags</button>
                </div>
              ) : shownTags.map((t) => (
                <button key={t.name} type="button" onClick={() => openListing({ kind: "tag", name: t.name })} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-3.5 text-left transition active:bg-[var(--surface)]">
                  <span className="text-sm lowercase text-white">{t.name}</span>
                  <span className="text-[var(--dim)]">{t.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== MODELS ===== */}
        {!notFound && !historyView && !current && !listing && tab === "creators" && (
          <section className="pt-5" aria-label="Models">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-zinc-200">Models</span>
            </nav>
            <h1 className="font-display mt-3 text-xl font-black leading-tight text-white sm:text-2xl">Models Having Most Videos</h1>
            <p className="mt-1 text-[13px] text-[var(--dim)]">{modelsWithVideos.length} models</p>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
              {modelSlice.map((c) => (
                <div key={c.name} className="flex flex-col items-center text-center">
                  <button type="button" aria-label={`Videos by ${c.name}`} onClick={() => openListing({ kind: "creator", name: c.name })} className="transition active:scale-95"><Avatar name={c.name} g={c.g} size={100} photo={c.photo} /></button>
                  <span className="mt-2.5 text-sm font-bold text-white">{c.name}</span>
                  <span className="text-xs text-[var(--dim)]">{c.videos} videos</span>
                  <button type="button" aria-pressed={follows.includes(c.name)} onClick={() => toggle.mutate({ kind: "follow", itemKey: c.name })} className={`mt-2 rounded-full px-4 py-1.5 text-sm font-bold ${follows.includes(c.name) ? "bg-[var(--surface2)] text-white" : "bg-[var(--accent)] text-white"}`}>{follows.includes(c.name) ? "Following" : btnLabel("follow", "Follow")}</button>
                </div>
              ))}
            </div>
            <Pagination page={safeModelPage} total={totalModelPages} nextLabel={btnLabel("next", "Next")} onChange={(p) => { setModelPage(p); scrollTopInstant(); }} />
          </section>
        )}

        {/* ===== PROFILE ===== */}
        {!notFound && !historyView && !current && !listing && tab === "profile" && (
          <section className="pt-5" aria-label="Your library">
            <h1 className="font-display text-xl font-black text-white sm:text-2xl">Your library</h1>
            {([
              { title: "History", keys: history, empty: "Nothing watched yet. Videos you play on this device appear here.", clear: true },
              { title: "Liked", keys: likes, empty: "Tap Like on any video and it will show up here." },
              { title: "Watch later", keys: saves, empty: "Tap Save on any video to watch it later." },
            ] as const).map((sec) => (
              <div key={sec.title} className="mt-7">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-xl font-extrabold text-white">{sec.title}</h2>
                  {adminToken && "clear" in sec && sec.keys.length > 0 && <button type="button" onClick={() => clearHist.mutate()} className="flex items-center gap-1 py-1 text-sm text-[var(--dim)]"><Icon n="trash" size={15} tone="accent" /> Clear</button>}
                </div>
                {sec.keys.length === 0 ? <p className="mt-2 text-[var(--dim)]">{sec.empty}</p> : (
                  <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                    {sec.keys.map((id) => { const v = byId(id); return v ? <VideoCard key={id} v={v} onOpen={openVideo} liked={likes.includes(v.id)} onToggleLike={() => toggle.mutate({ kind: "like", itemKey: v.id })} onOpenListing={openListing} /> : null; })}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-7">
              <h2 className="font-display text-xl font-extrabold text-white">Following</h2>
              {follows.length === 0 ? <p className="mt-2 text-[var(--dim)]">Follow models from the Models tab and they'll show up here.</p> : (
                <div className="mt-3 flex flex-wrap gap-4">
                  {follows.map((name) => { const c = CREATORS.find((x) => x.name === name); return c ? (
                    <button key={name} type="button" onClick={() => openListing({ kind: "creator", name })} className="flex flex-col items-center gap-1.5 transition active:scale-95"><Avatar name={c.name} g={c.g} size={64} photo={c.photo} /><span className="max-w-[90px] text-center text-sm font-semibold text-white">{name}</span></button>
                  ) : null; })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===== Footer (also on the video page) =====
            Gated on the catalog data being ready. PageSpeed 2026-11-27:
            the footer caused the entire remaining 0.176 CLS — it paints
            in the viewport while the home sections are still loading,
            then gets pushed down as they render above it. Mounting it
            only once the content above it is settled (slim state, plus
            the full state when the video page / admin panel enabled that
            query) means it never moves. On a failed fetch it still shows
            (isError), so the footer is never missing forever. */}
        {((adminQ.data || adminQ.isError) && (adminFullQ.fetchStatus === "idle" || adminFullQ.data || adminFullQ.isError)) && (
        <footer className="mt-12 border-t border-[var(--border)] pt-5 text-[13px] text-[var(--dim)]">
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            <button type="button" onClick={() => goTab("categories")} className="py-1">Categories</button>
            <button type="button" onClick={() => goTab("creators")} className="py-1">Models</button>
            <button type="button" onClick={() => goTab("channels")} className="py-1">Channels</button>
            <button type="button" onClick={() => flash("Content removal requests: use the flag icon on any video")} className="py-1">Content removal</button>
            <button type="button" onClick={() => flash("All models on Pulse Video are verified adults")} className="py-1">2257</button>
            <button type="button" onClick={() => flash("DMCA: report via the flag icon on any video")} className="py-1">DMCA</button>
            <button type="button" onClick={() => openLegal("terms")} className="py-1">Terms</button>
            <button type="button" onClick={() => openLegal("privacy")} className="py-1">Privacy</button>
          </nav>
          <p className="mt-4 leading-relaxed">{texts.footerText}</p>
        </footer>
        )}
      </main>

      {/* ===== Menu drawer (mobile + desktop) ===== */}
      {drawer && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Site menu">
          <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/70" />
          <div className="absolute inset-y-0 left-0 w-[86vw] max-w-sm overflow-y-auto bg-[#0a0a0a] px-5 pb-28 pt-4">
            <div className="flex items-center justify-between">
              <LogoText text={texts.logoText ?? "PULSE VIDEO"} />
              <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="p-2 text-white"><Icon n="x" tone="accent" /></button>
            </div>
            <div className="mt-2 divide-y divide-[var(--border)] border-y border-[var(--border)]">
              <button type="button" onClick={openHistory} className="flex w-full items-center gap-3.5 py-3.5 text-left text-sm text-white"><Icon n="history" tone="accent" /> History</button>
              <button type="button" onClick={() => goTab("profile")} className="flex w-full items-center gap-3.5 py-3.5 text-left text-sm text-white"><Icon n="like" tone="accent" /> Liked</button>
              <button type="button" onClick={() => goTab("profile")} className="flex w-full items-center gap-3.5 py-3.5 text-left text-sm text-white"><Icon n="bell" tone="accent" /> Following</button>
              <button type="button" onClick={() => goTab("profile")} className="flex w-full items-center gap-3.5 py-3.5 text-left text-sm text-white"><Icon n="bookmark" tone="accent" /> Watch later</button>
            </div>
            <p className="mt-6 text-sm font-bold tracking-[0.14em] text-[var(--dim)]">CATEGORIES</p>
            <div className="mt-1 grid grid-cols-2 gap-x-6">
              {drawerCats.map((c) => (
                <button key={c.name} type="button" onClick={() => openListing({ kind: "category", name: c.name })} className="flex items-baseline justify-between border-b border-[var(--border)] py-3 text-left">
                  <span className="text-sm text-white">{c.name}</span><span className="text-xs text-[var(--dim)]">{c.count}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => goTab("categories")} className="mt-6 w-full rounded-full border border-[var(--border)] py-3 font-bold text-white">All {CATEGORIES.length} categories</button>
            <div className="mt-2 divide-y divide-[var(--border)] border-b border-[var(--border)]">
              <button type="button" onClick={() => goTab("creators")} className="flex w-full items-baseline justify-between py-4 text-left"><span className="text-sm text-white">Models</span><span className="text-[var(--dim)]">{CREATORS.length}</span></button>
              <button type="button" onClick={() => goTab("channels")} className="flex w-full items-baseline justify-between py-4 text-left"><span className="text-sm text-white">Channels</span><span className="text-[var(--dim)]">{CHANNELS.length}</span></button>
              <button type="button" onClick={() => goTab("tags")} className="flex w-full items-baseline justify-between py-4 text-left"><span className="text-sm text-white">All tags</span><span className="text-[var(--dim)]">{TAGS.length}</span></button>
            </div>
            <button type="button" onClick={() => flash("Use the language selector in the header — 20 languages")} className="mt-5 flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left">
              <span className="text-sm text-white">Language</span><span className="text-[var(--dim)]">English and 19 more</span>
            </button>
            {signedIn ? (
              <p className="mt-5 rounded-2xl bg-[var(--surface)] px-4 py-4 text-center text-white">Signed in as <b>Guest viewer</b> · <button type="button" className="font-bold text-[var(--accent)]" onClick={() => setSignedIn(false)}>Log out</button></p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => openAuth("login")} className="rounded-full border border-zinc-600 py-3.5 font-bold text-white">Log in</button>
                <button type="button" onClick={() => openAuth("signup")} className="rounded-full bg-[var(--accent)] py-3.5 font-bold text-white">Sign up</button>
              </div>
            )}
            <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--dim)]" aria-label="Legal">
              <button type="button" onClick={() => flash("Content removal requests: use the flag icon on any video")} className="py-1">Content removal</button>
              <button type="button" onClick={() => flash("All models on Pulse Video are verified adults")} className="py-1">2257</button>
              <button type="button" onClick={() => flash("DMCA: report via the flag icon on any video")} className="py-1">DMCA</button>
              <button type="button" onClick={() => openLegal("terms")} className="py-1">Terms</button>
              <button type="button" onClick={() => openLegal("privacy")} className="py-1">Privacy</button>
            </nav>
          </div>
        </div>
      )}

      {/* ===== Filters drawer (right slide-over) ===== */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Filters">
          <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="absolute inset-0 bg-black/70" />
          <div className="absolute inset-y-0 right-0 flex w-[92vw] max-w-[380px] flex-col bg-[#111111]">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-display text-xl font-extrabold text-white">Filters</h2>
              <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="p-2 text-white"><Icon n="x" tone="accent" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {([
                { label: "Length", key: "len" as const, options: ["Any", "Under 5 min", "5–10 min", "10–20 min", "20–40 min", "Over 40 min"] },
                { label: "Quality", key: "quality" as const, options: ["Any", "Full HD 1080p"] },
                { label: "Added", key: "added" as const, options: ["Any time", "Today", "This week", "This month", "This year"] },
              ]).map((group) => (
                <div key={group.key} className="mt-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-[var(--dim)]">{group.label}</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={group.label}>
                    {group.options.map((o) => (
                      <button key={o} type="button" role="radio" aria-checked={draftFilters[group.key] === o} onClick={() => setDraftFilters({ ...draftFilters, [group.key]: o })} className={`rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${draftFilters[group.key] === o ? "border border-[var(--accent)] text-[var(--accent)]" : "bg-[var(--surface2)] text-white"}`}>{o}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="mt-6">
                <p className="text-sm font-bold uppercase tracking-wide text-[var(--dim)]">Categories</p>
                <p className="mt-1 text-[13px] text-[var(--dim)]">Tap once to include, twice to exclude.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORIES.slice(0, 24).map((c) => {
                    const inc = draftFilters.incl.includes(c.name);
                    const exc = draftFilters.excl.includes(c.name);
                    return (
                      <button key={c.name} type="button" aria-pressed={inc} aria-label={`${c.name}${exc ? " (excluded)" : inc ? " (included)" : ""}`} onClick={() => {
                        if (!inc && !exc) setDraftFilters({ ...draftFilters, incl: [...draftFilters.incl, c.name] });
                        else if (inc) setDraftFilters({ ...draftFilters, incl: draftFilters.incl.filter((x) => x !== c.name), excl: [...draftFilters.excl, c.name] });
                        else setDraftFilters({ ...draftFilters, excl: draftFilters.excl.filter((x) => x !== c.name) });
                      }} className={`rounded-full px-3.5 py-2 text-sm font-semibold transition active:scale-95 ${inc ? "bg-[var(--accent)] text-white" : exc ? "border border-red-500 text-red-400 line-through" : "bg-[var(--surface2)] text-white"}`}>{c.name}</button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-[var(--border)] px-5 py-4">
              <button type="button" onClick={() => setDraftFilters(NO_FILTERS)} className="flex-1 rounded-full border border-[var(--border)] py-3 font-bold text-white">Clear all</button>
              <button type="button" onClick={() => { setAppliedFilters(draftFilters); setFiltersOpen(false); setListPage(1); scrollTopInstant(); }} className="flex-1 rounded-full bg-[var(--accent)] py-3 font-bold text-white">Show results</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Notice toast ===== */}
      {notice && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-[70] mx-auto max-w-md rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-black shadow-xl md:bottom-28">{notice}</div>
      )}

      {/* ===== Cookie banner (fixed overlay above the bottom tab bar) =====
          PageSpeed 2026-11-27: the in-flow banner caused the ENTIRE
          0.39 CLS — it paints in the viewport while the home sections
          are still loading, then gets pushed down as they render above
          it. Fixed positioning takes it out of the flow, so it can
          appear or be dismissed without moving anything. It sits above
          the tab bar (bottom-24, same as the notice toast) and overlays
          the page's bottom padding while visible, like every cookie
          banner; the choice still persists. */}
      {!cookieChoice && (
        <div className="fixed inset-x-0 bottom-24 z-[60] mx-auto w-full max-w-6xl px-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:flex-row sm:items-center" role="region" aria-label="Cookie notice">
            <p className="flex-1 text-sm leading-relaxed text-zinc-200">{texts.cookieText} <button type="button" onClick={() => openLegal("privacy")} className="font-semibold text-[var(--accent)]">Privacy</button></p>
            <div className="flex gap-2.5">
              <button type="button" onClick={() => chooseCookie("ok")} className="rounded-full bg-[var(--accent)] px-7 py-2.5 font-bold text-white">OK</button>
              <button type="button" onClick={() => chooseCookie("reject")} className="rounded-full border border-[var(--border)] px-6 py-2.5 font-bold text-white">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BOTTOM TAB BAR — identical on mobile & desktop ===== */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--surface)]/97 pb-safe backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-5 px-2">
          {bottomTabs.map((t) => {
            const active = navActive === t.key && !drawer && !authView;
            return (
              <button key={t.key} type="button" aria-label={t.label} aria-current={active ? "page" : undefined} onClick={() => goTab(t.key)} className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition active:scale-90 ${active ? "text-[var(--accent)]" : "text-zinc-400"}`}>
                {active && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-[var(--accent)]" />}
                <Icon n={t.icon} size={23} tone="accent" />
                {t.label}
                {t.key === "profile" && (likes.length + saves.length) > 0 && <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-black text-white">{likes.length + saves.length}</span>}
              </button>
            );
          })}
        </div>
      </nav>
      </>
      )}
    </div>
  );
}
