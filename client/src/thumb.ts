/* Card thumbnails: use the source's own small screenshot variant.
 *
 * Imported freepornvideo.sex videos store their full-size preview as
 *   https://www.freepornvideo.sex/contents/videos_screenshots/<bucket>/<id>/preview.jpg
 * where <bucket> is floor(<id> / 1000) * 1000. That file is the video's
 * native frame size — measured 640x360 up to 3838x2160 (62–597 KB) —
 * while cards show it at ~460px wide in a 16:9 box.
 *
 * The source also publishes a small screenshot for every video at
 *   .../contents/videos_screenshots/<bucket>/<id>/392x294/1.jpg
 * (served as WebP despite the .jpg suffix, 392x294, ~5–57 KB).
 * Measured on 13 sampled imports (2026-11-27): 2,482,085 bytes of
 * preview.jpg vs 219,632 bytes of the small variant — a ~91% saving,
 * and every sampled video returned HTTP 200 for the small variant.
 * No other size exists on the source (320x180, 480x270, 640x360,
 * 640x480, 800x600, 192x144, 240x180, 320x240, 480x360 all 404), so
 * there is no 2x candidate for a srcset: listing preview.jpg as a
 * larger srcset candidate would make retina/desktop browsers fetch
 * the 4K file again and erase the saving. A plain src swap is the
 * correct implementation; the full preview stays the video-page
 * poster and the og:image / sitemap thumbnail, where it is a single
 * image and quality matters.
 *
 * Trade-off: the small shot is 4:3, so the 16:9 card (object-cover)
 * crops its top and bottom, and it is a different frame from
 * preview.jpg (an earlier screenshot from the same video). That is
 * the same crop the source site's own listings apply to these shots.
 *
 * Only freepornvideo.sex preview.jpg URLs are rewritten; anything
 * else (XNXX, admin-entered URLs, null) passes through untouched.
 * If a small variant ever 404s, the card should fall back to the
 * full preview via fullThumbUrl() before giving up (see App.tsx
 * Thumb edit); it must never silently show the placeholder while a
 * usable full-size image exists. */

const PREVIEW_RE =
  /^https?:\/\/www\.freepornvideo\.sex\/contents\/videos_screenshots\/(\d+)\/(\d+)\/preview\.jpg$/i;
const SMALL_RE =
  /^https?:\/\/www\.freepornvideo\.sex\/contents\/videos_screenshots\/(\d+)\/(\d+)\/392x294\/1\.jpg$/i;

/** Small (392x294) card thumbnail for a stored thumbnail URL. */
export function cardThumbUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = PREVIEW_RE.exec(url);
  if (!m) return url;
  return `https://www.freepornvideo.sex/contents/videos_screenshots/${m[1]}/${m[2]}/392x294/1.jpg`;
}

/** Reverse of cardThumbUrl: the full-size preview.jpg for a small-variant URL. */
export function fullThumbUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = SMALL_RE.exec(url);
  if (!m) return url;
  return `https://www.freepornvideo.sex/contents/videos_screenshots/${m[1]}/${m[2]}/preview.jpg`;
}
