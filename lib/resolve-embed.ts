// resolveEmbedFile — ported verbatim from the Muse version's
// server/src/actions.ts, minus the defineAction wrapper. Resolves a
// freepornvideo.sex, freepornvideos.xxx, xnxx.com, youporn.com or
// perfectgirls.xxx embed/video page to its direct playable streams —
// every resolution the source offers — fetched server-side, so the
// video page can play them in a native in-page player with a full
// quality menu instead of the source's iframe (whose player can refuse
// embedded playback with a "Blocked content" notice).
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
    for (const key of ["exp", "expires", "e", "expAt", "expiresAt", "validto", "end"]) {
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
    /* freepornvideos.xxx — the same KVS template as freepornvideo.sex,
       but the file flow differs in two ways, both verified live
       2026-11-27 against embed 93823263:
       - the embed page's video_url is the VIDEO PAGE (with
         video_url_redirect: '1'), not a file; the actual files live
         on that page as get_file URLs (_2160m / _720m / _480m);
       - each page load mints FRESH get_file hashes bound to that
         page's session: the embed page's 480m hash 410s even with
         the embed page's cookies — only the VIDEO PAGE's own
         get_file URLs, fetched with the video page's cookies and
         Referer, 302 to storage. So: embed page -> video page ->
         the video page's get_file URLs -> one gated hop each.
       The source offers three files (embed-page labels: 4k / 720p /
       480p). Its storage URLs (d*.fpvcdn.com) carry an ip= param,
       but that param is NOT enforced — the same URL answered 206
       over both IPv4 and IPv6 — so they play from any client with
       no Referer, like the .sex storage URLs. */
    if (/(^|\.)freepornvideos\.xxx$/i.test(u.hostname)) {
      if (!/^\/embed\/\d+/.test(u.pathname)) return empty;
      const embedPageUrl = u.toString();
      /* Short-lived step log (status codes only, no URLs or tokens):
         this host's fetches behave differently from the Vercel
         function than from a developer shell (XNXX 404s Vercel
         outright), so a failed resolve must say WHERE it failed. */
      const dbg = (step: string, extra?: string) => {
        try {
          console.log(`[resolve-xxx] ${step}${extra ? ` ${extra}` : ""}`);
        } catch {
          /* logging must never break the resolve */
        }
      };
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
      const pageRes = await fetch(embedPageUrl, {
        headers: { ...browserHeaders, ...(jar.size ? { Cookie: cookieHeader() } : {}) },
        redirect: "follow",
        signal: fetchTimeout(),
      });
      if (!pageRes.ok) {
        dbg("embed-page", `status=${pageRes.status}`);
        return empty;
      }
      collectCookies(pageRes);
      const html = await pageRes.text();
      const grab = (name: string): string | null => {
        const m =
          html.match(new RegExp(`${name}:\\s*'([^']+)'`)) ?? html.match(new RegExp(`${name}:\\s*"([^"]+)"`));
        return m && m[1] ? m[1] : null;
      };
      const videoPageUrl = grab("video_url");
      if (!videoPageUrl) {
        dbg("embed-page", "no video_url");
        return empty;
      }
      const vpRes = await fetch(videoPageUrl, {
        headers: { ...browserHeaders, ...(jar.size ? { Cookie: cookieHeader() } : {}) },
        redirect: "follow",
        signal: fetchTimeout(),
      });
      if (!vpRes.ok) {
        dbg("video-page", `status=${vpRes.status}`);
        return empty;
      }
      collectCookies(vpRes);
      const vpHtml = await vpRes.text();
      const cookie = cookieHeader();
      /* The video page lists one get_file URL per encode
         (_2160m / _720m / _480m) plus a ?download=true duplicate of
         the 720m one — first match per suffix wins. */
      const bySuffix = new Map<string, string>();
      for (const m of vpHtml.matchAll(/https:\/\/www\.freepornvideos\.xxx\/get_file\/[^\s"'<>]+?_(2160|720|480)m\.mp4\//g)) {
        const url = m[0];
        const suf = m[1] as string;
        if (!url || bySuffix.has(suf)) continue;
        bySuffix.set(suf, url);
      }
      if (bySuffix.size === 0) {
        dbg("video-page", "no get_file urls");
        return empty;
      }
      const followGated = async (filePageUrl: string | null): Promise<string | null> => {
        if (!filePageUrl) return null;
        try {
          const fileRes = await fetch(filePageUrl, {
            headers: { ...ua, ...(cookie ? { Cookie: cookie } : {}), Referer: videoPageUrl },
            redirect: "manual",
            signal: fetchTimeout(),
          });
          const loc = fileRes.headers.get("location");
          return loc ? new URL(loc, filePageUrl).toString() : null;
        } catch {
          return null;
        }
      };
      const [f2160, f720, f480] = await Promise.all([
        followGated(bySuffix.get("2160") ?? null),
        followGated(bySuffix.get("720") ?? null),
        followGated(bySuffix.get("480") ?? null),
      ]);
      const streams: EmbedStream[] = [];
      if (f480) streams.push({ url: f480, label: "480p", hls: false });
      if (f720) streams.push({ url: f720, label: "720p", hls: false });
      if (f2160) streams.push({ url: f2160, label: "4k", hls: false });
      const fast = f480 ?? f720 ?? f2160;
      if (!fast) {
        dbg("gated", `480=${!!f480} 720=${!!f720} 2160=${!!f2160}`);
        return empty;
      }
      dbg("ok", `streams=${streams.length}`);
      return done({
        fileUrl: fast,
        hdFileUrl: f2160 && f2160 !== fast ? f2160 : f720 && f720 !== fast ? f720 : null,
        fastLabel: fast === f480 ? "480p" : fast === f720 ? "720p" : "4k",
        streams,
        expiresAt: parseExpiryFromUrl(fast),
      });
    }
    /* youporn.com — the embed page carries a mediaDefinition array
       with one HLS entry and one MP4 entry, each a signed
       /media/<format>/?s=<token> URL. Each returns JSON listing
       the real CDN files: the MP4 JSON lists 480p + 240p direct
       MP4s on ev-ph.ypncdn.com, the HLS JSON lists 480p + 240p
       masters on ev-h-ph.ypncdn.com (ACAO: *, segments play with
       no Referer). BUT the MP4 CDN enforces a youporn.com Referer
       — verified 2026-11-27: no Referer or a foreign Referer 410s,
       a youporn.com Referer 206s — and this site sends no Referer
       at all (page-wide no-referrer meta, which the freepornvideo
       storage URLs require), so the MP4s can never play natively
       here. The HLS masters are therefore the streams: 480p + 240p
       via hls.js, same as the XNXX HLS variants. Signed CDN URLs
       live ~2 h (validfrom/validto); the resolver mints them fresh
       per resolve. */
    if (/(^|\.)youporn\.com$/i.test(u.hostname)) {
      const watch = u.pathname.match(/^\/watch\/(\d+)/);
      if (watch && watch[1]) {
        u.pathname = `/embed/${watch[1]}/`;
        u.search = "";
      }
      if (!/^\/embed\/\d+/.test(u.pathname)) return empty;
      const pageRes = await fetch(u.toString(), {
        headers: browserHeaders,
        redirect: "follow",
        signal: fetchTimeout(),
      });
      if (!pageRes.ok) return empty;
      const html = await pageRes.text();
      /* The mediaDefinition entries name the signed JSON endpoints;
         the MP4 one is unusable here (Referer rule above), so only
         the HLS endpoint is fetched. */
      const hlsEp = [...html.matchAll(/"format":"hls"[^}]*?"videoUrl":"([^"]+)"/g)]
        .map((m) => (m[1] as string).replace(/\\\//g, "/"))[0];
      if (!hlsEp) return empty;
      let list: Array<{ quality?: string; videoUrl?: string; defaultQuality?: boolean }>;
      try {
        const hlsRes = await fetch(hlsEp, { headers: ua, redirect: "follow", signal: fetchTimeout() });
        if (!hlsRes.ok) return empty;
        list = JSON.parse(await hlsRes.text()) as typeof list;
      } catch {
        return empty;
      }
      if (!Array.isArray(list) || list.length === 0) return empty;
      type H = { url: string; q: number; def: boolean };
      const entries: H[] = [];
      for (const e of list) {
        if (!e.videoUrl) continue;
        const q = parseInt(String(e.quality ?? ""), 10);
        if (!Number.isFinite(q) || q <= 0) continue;
        if (!entries.some((x) => x.q === q)) entries.push({ url: e.videoUrl, q, def: !!e.defaultQuality });
      }
      if (entries.length === 0) return empty;
      entries.sort((a, b) => a.q - b.q);
      const streams: EmbedStream[] = entries.map((e) => ({ url: e.url, label: `${e.q}p`, hls: true }));
      const fastEntry = entries.find((e) => e.def) ?? entries[entries.length - 1]!;
      return done({
        fileUrl: fastEntry.url,
        hdFileUrl: null,
        fastLabel: `${fastEntry.q}p`,
        streams,
        expiresAt: parseExpiryFromUrl(fastEntry.url),
      });
    }
    /* perfectgirls.xxx — the same KVS template as freepornvideos.xxx,
       verified live 2026-11-28 against video 811113. The system the
       owner asked to test: he pastes a VIDEO PAGE link and the site
       serves the direct playing link from it.
       - the video page lists one get_file URL per encode
         (811113.mp4 = 480p, 811113_720p.mp4, 811113_360p.mp4, plus a
         _preview360p file that is not a stream);
       - every get_file URL 302s (with the page's cookies + Referer)
         to a multi-variant HLS URL on cdn.privatehost.com, which
         302s once more to nvms5-b.cdn.privatehost.com and returns an
         HLS master playlist (360p/480p/720p, ACAO: *);
       - the variant playlists list .ts segments that answer 206
         video/MP2T with no Referer, so they play direct here via
         hls.js (or native HLS in Safari) with no proxy needed.
       So: video page -> one of its get_file URLs -> HLS master ->
       its variants as the streams, playback starting at 480p (the
       embed's own fast label). An embed link works the same way —
       it is normalised to the video page first; the embed page's
       video_url is only the fallback if the video page yields
       nothing. */
    if (/(^|\.)perfectgirls\.xxx$/i.test(u.hostname)) {
      const idMatch = u.pathname.match(/^\/(?:embed|video)\/(\d+)/);
      if (!idMatch || !idMatch[1]) return empty;
      const id = idMatch[1] as string;
      const videoPageUrl = `https://www.perfectgirls.xxx/video/${id}/`;
      const embedPageUrl = `https://www.perfectgirls.xxx/embed/${id}`;
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
      const grab = (html: string, name: string): string | null => {
        const m =
          html.match(new RegExp(`${name}:\\s*'([^']+)'`)) ?? html.match(new RegExp(`${name}:\\s*"([^"]+)"`));
        return m && m[1] ? m[1] : null;
      };
      /* One gated hop: a get_file URL 302s to the multi-variant HLS
         URL with the page's cookies + Referer — the .sex/.xxx
         pattern. */
      const followGated = async (filePageUrl: string, referer: string): Promise<string | null> => {
        try {
          const fileRes = await fetch(filePageUrl, {
            headers: { ...ua, ...(jar.size ? { Cookie: cookieHeader() } : {}), Referer: referer },
            redirect: "manual",
            signal: fetchTimeout(),
          });
          const loc = fileRes.headers.get("location");
          return loc ? new URL(loc, filePageUrl).toString() : null;
        } catch {
          return null;
        }
      };
      let masterUrl: string | null = null;
      let fastLabel: string | null = null;
      /* 1. Video page first: pull this video's get_file URLs (the
         path carries /<id>/; related videos carry other ids, and the
         _preview file is not a stream) and follow one to the HLS
         master. */
      try {
        const vpRes = await fetch(videoPageUrl, {
          headers: { ...browserHeaders, ...(jar.size ? { Cookie: cookieHeader() } : {}) },
          redirect: "follow",
          signal: fetchTimeout(),
        });
        if (vpRes.ok) {
          collectCookies(vpRes);
          const vpHtml = await vpRes.text();
          const filePageUrl = [
            ...vpHtml.matchAll(
              new RegExp(`https://www\\.perfectgirls\\.xxx/get_file/[^\\s"'<>]+?/${id}/[^\\s"'<>]*?\\.mp4/`, "g"),
            ),
          ]
            .map((m) => m[0])
            .find((x) => !x.includes("_preview"));
          if (filePageUrl) masterUrl = await followGated(filePageUrl, videoPageUrl);
        }
      } catch {
        /* fall through to the embed page */
      }
      /* 2. Embed fallback: the embed page's video_url is a get_file
         URL (480p) — follow it the same way. */
      if (!masterUrl) {
        try {
          const pageRes = await fetch(embedPageUrl, {
            headers: { ...browserHeaders, ...(jar.size ? { Cookie: cookieHeader() } : {}) },
            redirect: "follow",
            signal: fetchTimeout(),
          });
          if (!pageRes.ok) return empty;
          collectCookies(pageRes);
          const html = await pageRes.text();
          const filePageUrl = grab(html, "video_url");
          fastLabel = grab(html, "video_url_text");
          if (!filePageUrl) return empty;
          masterUrl = await followGated(filePageUrl, embedPageUrl);
        } catch {
          return empty;
        }
      }
      if (!masterUrl) return empty;
      /* 3. The HLS URL 302s once more (cdn -> nvms5-b) and returns
         the master playlist; parse its variants the same way the
         XNXX branch parses setVideoHLS. */
      let masterText = "";
      try {
        const masterRes = await fetch(masterUrl, {
          headers: ua,
          redirect: "follow",
          signal: fetchTimeout(),
        });
        if (!masterRes.ok) return empty;
        masterUrl = masterRes.url;
        masterText = await masterRes.text();
      } catch {
        return empty;
      }
      if (!masterText.includes("#EXTM3U")) {
        return done({
          fileUrl: masterUrl,
          hdFileUrl: null,
          fastLabel,
          streams: [{ url: masterUrl, label: fastLabel ?? "Auto", hls: true }],
          expiresAt: parseExpiryFromUrl(masterUrl),
        });
      }
      const lines = masterText.split(/\r?\n/);
      type PStream = { url: string; label: string; hls: boolean; height: number };
      const byHeight = new Map<number, PStream>();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
        const nm = line.match(/RESOLUTION=\d+x(\d{3,4})/);
        const next = (lines[i + 1] ?? "").trim();
        if (!nm || !nm[1] || !next || next.startsWith("#")) continue;
        const h = parseInt(nm[1], 10);
        if (!byHeight.has(h))
          byHeight.set(h, { url: new URL(next, masterUrl).toString(), label: `${h}p`, hls: true, height: h });
      }
      const sorted = [...byHeight.values()].sort((a, b) => a.height - b.height);
      if (sorted.length === 0) {
        return done({
          fileUrl: masterUrl,
          hdFileUrl: null,
          fastLabel,
          streams: [{ url: masterUrl, label: fastLabel ?? "Auto", hls: true }],
          expiresAt: parseExpiryFromUrl(masterUrl),
        });
      }
      const streams = sorted.map(({ url, label, hls }) => ({ url, label, hls }));
      const fastEntry =
        (fastLabel ? sorted.find((s) => s.label === fastLabel) : undefined) ??
        sorted.find((s) => s.height === 480) ??
        sorted[0]!;
      const hdEntry = sorted[sorted.length - 1]!;
      return done({
        fileUrl: fastEntry.url,
        hdFileUrl: hdEntry.url !== fastEntry.url ? hdEntry.url : null,
        fastLabel: fastEntry.label,
        streams,
        expiresAt: parseExpiryFromUrl(fastEntry.url),
      });
    }
    /* joysporn.com — no embed player exists; the video page itself
       carries the direct files, verified live 2026-11-28 against
       /view/9409. The page's #loadlinks divs carry one data-c token
       per quality: "hash;quality;size;194;<id>;<expiry>;<token>;<n>"
       (e.g. 1080p/720p/480p/240p). The player's own script builds
       the playback URL as
       "https://<n>.vstor.top/whpvid/<expiry>/<token>/<1000*floor(id/1000)>/<id>/<id>[ _<quality>].mp4"
       — the 720p file carries no suffix, the others take
       "_<quality>". Those URLs answer 206 video/mp4 to a Range
       request with no Referer (verified for 720p/1080p/480p), so
       they play direct here with no proxy. The resolver parses the
       data-c tokens off the video page and returns one MP4 stream
       per quality, playback starting at 480p (the site's fast
       default). */
    if (/(^|\.)joysporn\.com$/i.test(u.hostname)) {
      const view = u.pathname.match(/^\/view\/(\d+)/);
      if (!view || !view[1]) return empty;
      const pageRes = await fetch(u.toString(), {
        headers: browserHeaders,
        redirect: "follow",
        signal: fetchTimeout(),
      });
      if (!pageRes.ok) return empty;
      const html = await pageRes.text();
      type JStream = { url: string; label: string; hls: boolean; height: number };
      const byHeight = new Map<number, JStream>();
      for (const m of html.matchAll(/data-c="([^"]+)"/g)) {
        const parts = (m[1] as string).split(";");
        /* hash;quality;size;194;id;expiry;token;n */
        if (parts.length < 8) continue;
        const [, quality, , , idStr, expiry, token, n] = parts as [string, string, string, string, string, string, string, string];
        const h = parseInt(quality.replace(/\D/g, ""), 10);
        const id = parseInt(idStr, 10);
        if (!quality || !Number.isFinite(h) || h <= 0 || !Number.isFinite(id) || id <= 0 || !expiry || !token || !n) continue;
        if (byHeight.has(h)) continue;
        const dir = Math.floor(id / 1000) * 1000;
        const suffix = quality === "720p" ? "" : `_${quality}`;
        const url = `https://${n}.vstor.top/whpvid/${expiry}/${token}/${dir}/${id}/${id}${suffix}.mp4`;
        byHeight.set(h, { url, label: quality, hls: false, height: h });
      }
      const sorted = [...byHeight.values()].sort((a, b) => a.height - b.height);
      if (sorted.length === 0) return empty;
      const streams = sorted.map(({ url, label, hls }) => ({ url, label, hls }));
      const fastEntry = sorted.find((s) => s.height === 480) ?? sorted[0]!;
      const hdEntry = sorted[sorted.length - 1]!;
      return done({
        fileUrl: fastEntry.url,
        hdFileUrl: hdEntry.url !== fastEntry.url ? hdEntry.url : null,
        fastLabel: fastEntry.label,
        streams,
        expiresAt: null,
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
