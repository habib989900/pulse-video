// resolveEmbedFile — ported verbatim from the Muse version's
// server/src/actions.ts, minus the defineAction wrapper. Resolves a
// freepornvideo.sex or xnxx.com embed page to its direct playable
// streams — every resolution the source offers — fetched server-side,
// so the video page can play them in a native in-page player with a
// full quality menu instead of the source's iframe (whose player can
// refuse embedded playback with a "Blocked content" notice).
//
// One change vs the original: the whole resolve runs under a shared
// ~9 s deadline with 5 s per fetch, so it stays inside Vercel's 10 s
// Hobby function limit (the original ran on the Muse runtime with no
// such cap, and 8 s per fetch could run 16–24 s and die mid-flight).
// Successful resolves are cached in memory for 10 min.

export interface EmbedStream {
  url: string;
  label: string;
  hls: boolean;
}

export interface EmbedFileResult {
  fileUrl: string | null;
  hdFileUrl: string | null;
  fastLabel: string | null;
  streams: EmbedStream[];
  /* Best-effort expiry of the signed storage URL (ms epoch), parsed
     from the URL itself when it carries one — never invented. Null
     when the URL carries no expiry: the client must treat the URL as
     short-lived and re-resolve on error, as it already does. */
  expiresAt: number | null;
}

/* A5: the function has a 10 s Hobby limit, but the old code gave
   EACH fetch 8 s — a resolve could run 16–24 s and die mid-flight.
   One shared ~9 s deadline caps the whole resolve, each fetch gets
   5 s, and the fastest fetches (homepage + embed page) run first.
   Successful resolves are cached in memory for 10 min: the same
   video re-resolving on every Like/Save invalidation was wasted
   work (the signed URL lives ~3 h, far longer than the cache). */
const PER_FETCH_TIMEOUT_MS = 5000;
const RESOLVE_DEADLINE_MS = 9000;
const RESOLVE_CACHE_TTL_MS = 10 * 60_000;
const resolveCache = new Map<string, { at: number; result: EmbedFileResult }>();

/** Best-effort expiry from a signed URL's own query params
    (exp/expires/e/expAt as unix seconds, unix ms or an ISO date).
    Only values in the future and within 30 days are believed. */
function parseExpiryFromUrl(raw: string): number | null {
  try {
    const u = new URL(raw);
    for (const key of ["exp", "expires", "e", "expAt", "expiresAt"]) {
      const v = u.searchParams.get(key);
      if (!v) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        const ms = n < 1e12 ? n * 1000 : n;
        if (ms > Date.now() && ms < Date.now() + 30 * 24 * 3600_000) return ms;
      }
      const d = new Date(v);
      if (!isNaN(d.getTime()) && d.getTime() > Date.now() && d.getTime() < Date.now() + 30 * 24 * 3600_000) return d.getTime();
    }
  } catch {
    /* not a URL — no expiry to parse */
  }
  return null;
}

export async function resolveEmbedFile(embedUrl: string): Promise<EmbedFileResult> {
  const empty: EmbedFileResult = { fileUrl: null, hdFileUrl: null, fastLabel: null, streams: [], expiresAt: null };
  const cacheKey = embedUrl.trim();
  const hit = resolveCache.get(cacheKey);
  if (hit && Date.now() - hit.at < RESOLVE_CACHE_TTL_MS) return hit.result;
  const deadline = AbortSignal.timeout(RESOLVE_DEADLINE_MS);
  const fetchTimeout = () => AbortSignal.any([deadline, AbortSignal.timeout(PER_FETCH_TIMEOUT_MS)]);
  const done = (r: EmbedFileResult): EmbedFileResult => {
    if (r.fileUrl) resolveCache.set(cacheKey, { at: Date.now(), result: r });
    return r;
  };
  try {
    const u = new URL(embedUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return empty;
    const ua = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    };
    /* Full browser header set: the function runs on a datacenter IP
       and Node's fetch sends a minimal, bot-like header set
       (notably `accept-language: *`). XNXX answered the bare-UA
       fetch with 404 while the same URL returns 200 to a real
       browser — so the embed-page request now carries the headers
       a browser navigation sends. */
    const browserHeaders = {
      ...ua,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Upgrade-Insecure-Requests": "1",
    };
    /* xnxx.com: its embed player refuses playback inside third-party
       frames ("Blocked content. Contact the site owner to fix"), but
       the embed page itself names the direct MP4 files in plain
       setVideoUrlLow / setVideoUrlHigh calls, and those files were
       verified to answer 206 video/mp4 with Range support to a
       cookie-less, referer-less request — so they play natively
       here exactly like the freepornvideo storage URLs below. A
       watch-page link (/video-<id>/…) converts to /embedframe/<id>. */
    if (/(^|\.)xnxx\.com$/i.test(u.hostname)) {
      const watch = u.pathname.match(/^\/video-([\w-]+)/);
      if (watch && watch[1]) {
        u.pathname = `/embedframe/${watch[1]}`;
        u.search = "";
      }
      if (!/^\/embedframe\/[\w-]+/.test(u.pathname)) return empty;
      const pageRes = await fetch(u.toString(), {
        headers: browserHeaders,
        redirect: "follow",
        signal: fetchTimeout(),
      });
      if (!pageRes.ok) return empty;
      const html = await pageRes.text();
      const grabCall = (name: string): string | null => {
        const m = html.match(new RegExp(`${name}\\('([^']+)'\\)`));
        return m && m[1] ? m[1] : null;
      };
      const low = grabCall("setVideoUrlLow");
      const high = grabCall("setVideoUrlHigh");
      const fast = low ?? high;
      if (!fast) return empty;
      /* Every resolution this source offers: the two MP4s PLUS
         every variant in the HLS master playlist the embed page
         names via setVideoHLS — verified live on the owner's
         catalog video: the master lists 250p/360p/480p/720p/1080p,
         and the playlists and their .ts segments all answer with
         Access-Control-Allow-Origin: *, so the client can play
         them (native HLS in Safari, hls.js elsewhere). At a
         height both offer, the MP4 wins — it plays everywhere
         with no HLS machinery. Nothing is invented: a height the
         playlist does not list never appears. */
      type Stream = { url: string; label: string; hls: boolean; height: number };
      /* Keyed by height for labelled files — but two files can share
         a height (or have no height in the name at all, h=0): a plain
         numeric key would let the second silently overwrite the
         first and drop a stream. Unlabelled files key by URL, and
         nothing overwrites an existing entry. */
      const byHeight = new Map<string, Stream>();
      const addMp4 = (u: string | null) => {
        if (!u) return;
        const m = u.match(/_(\d{3,4})p\.mp4/i);
        const h = m && m[1] ? parseInt(m[1], 10) : 0;
        const key = h > 0 ? `h${h}` : `u:${u}`;
        if (!byHeight.has(key)) byHeight.set(key, { url: u, label: h ? `${h}p` : "MP4", hls: false, height: h });
      };
      addMp4(low);
      addMp4(high);
      const hlsMaster = grabCall("setVideoHLS");
      if (hlsMaster) {
        try {
          const hlsRes = await fetch(hlsMaster, {
            headers: ua,
            redirect: "follow",
            signal: fetchTimeout(),
          });
          if (hlsRes.ok) {
            const lines = (await hlsRes.text()).split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i] ?? "";
              if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
              const nm = line.match(/NAME="(\d{3,4})p"/) ?? line.match(/RESOLUTION=\d+x(\d{3,4})/);
              const next = (lines[i + 1] ?? "").trim();
              if (!nm || !nm[1] || !next || next.startsWith("#")) continue;
              const h = parseInt(nm[1], 10);
              if (!byHeight.has(`h${h}`))
                byHeight.set(`h${h}`, { url: new URL(next, hlsMaster).toString(), label: `${h}p`, hls: true, height: h });
            }
          }
        } catch {
          /* HLS only ever adds options; the MP4s still play without it */
        }
      }
      const sorted = [...byHeight.values()].sort((a, b) => a.height - b.height);
      const streams = sorted.map(({ url, label, hls }) => ({ url, label, hls }));
      const fastEntry = sorted.find((s) => s.url === fast);
      return done({
        fileUrl: fast,
        hdFileUrl: high && high !== fast ? high : null,
        fastLabel: fastEntry ? fastEntry.label : null,
        streams,
        expiresAt: parseExpiryFromUrl(fast),
      });
    }
    if (u.hostname !== "www.freepornvideo.sex" && u.hostname !== "freepornvideo.sex") return empty;
    const watch = u.pathname.match(/^\/xxx\/(\d+)/);
    if (watch && watch[1]) {
      u.pathname = `/embed/${watch[1]}`;
      u.search = "";
    }
    if (!/^\/embed\/\d+/.test(u.pathname)) return empty;
    const embedPageUrl = u.toString();
    /* Cookie jar: the file endpoint only redirects (302) when the
       request carries the session cookies the main site sets on a
       first visit (notably kt_referer) — the embed page alone does
       not seed them. So visit the homepage first, then the embed
       page, merging every Set-Cookie into one jar. If the homepage
       visit fails, fall back to embed-only cookies. */
    const jar = new Map<string, string>();
    const collectCookies = (res: Response) => {
      if (typeof res.headers.getSetCookie !== "function") return;
      for (const c of res.headers.getSetCookie()) {
        const pair = c.split(";")[0] ?? "";
        const eq = pair.indexOf("=");
        if (eq > 0) jar.set(pair.slice(0, eq), pair);
      }
    };
    const cookieHeader = () => [...jar.values()].join("; ");
    try {
      const homeRes = await fetch("https://www.freepornvideo.sex/", {
        headers: ua,
        redirect: "follow",
        signal: fetchTimeout(),
      });
      if (homeRes.ok) collectCookies(homeRes);
    } catch {
      /* homepage seed is best-effort; embed cookies may suffice */
    }
    const pageRes = await fetch(embedPageUrl, {
      headers: { ...ua, ...(jar.size ? { Cookie: cookieHeader() } : {}) },
      redirect: "follow",
      signal: fetchTimeout(),
    });
    if (!pageRes.ok) return empty;
    collectCookies(pageRes);
    const cookie = cookieHeader();
    const html = await pageRes.text();
    const grab = (name: string): string | null => {
      const m =
        html.match(new RegExp(`${name}:\\s*'([^']+)'`)) ?? html.match(new RegExp(`${name}:\\s*"([^"]+)"`));
      return m && m[1] ? m[1] : null;
    };
    const mainPageUrl = grab("video_url");
    const mainLabel = grab("video_url_text");
    const altPageUrl = grab("video_alt_url");
    const altLabel = grab("video_alt_url_text");
    if (!mainPageUrl && !altPageUrl) return empty;
    /* The file endpoint is session-gated: it answers 403 without the
       embed page's cookies, but redirects (302) to a storage URL that
       plays from any client. Follow exactly one hop, server-side.
       The embed's main file is the full-quality original (measured on
       the owner's catalog at 260 MB – 3.7 GB per video), while its
       alt file is a 480p encode roughly 4–20x smaller; on a real
       connection the big file buffers constantly, so the player
       defaults to the alt stream and offers the original as HD. */
    const followGated = async (filePageUrl: string | null): Promise<string | null> => {
      if (!filePageUrl) return null;
      try {
        const fileRes = await fetch(filePageUrl, {
          headers: { ...ua, ...(cookie ? { Cookie: cookie } : {}), Referer: embedPageUrl },
          redirect: "manual",
          signal: fetchTimeout(),
        });
        const loc = fileRes.headers.get("location");
        return loc ? new URL(loc, filePageUrl).toString() : null;
      } catch {
        return null;
      }
    };
    const [mainFile, altFile] = await Promise.all([followGated(mainPageUrl), followGated(altPageUrl)]);
    /* This source offers exactly two files — verified against a
       live embed page: video_url (labelled by video_url_text,
       "Original") and video_alt_url (its 480p encode). The stream
       list is exactly those two, under the source's own labels. */
    const streams: EmbedStream[] = [];
    if (altFile) streams.push({ url: altFile, label: altLabel ?? "480p", hls: false });
    if (mainFile) streams.push({ url: mainFile, label: mainLabel ?? "Original", hls: false });
    const resolvedUrl = altFile ?? mainFile;
    if (altFile) return done({ fileUrl: altFile, hdFileUrl: mainFile, fastLabel: altLabel, streams, expiresAt: resolvedUrl ? parseExpiryFromUrl(resolvedUrl) : null });
    return done({ fileUrl: mainFile, hdFileUrl: null, fastLabel: null, streams, expiresAt: resolvedUrl ? parseExpiryFromUrl(resolvedUrl) : null });
  } catch {
    return empty;
  }
}
