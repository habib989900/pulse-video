// Post-build step: unwrap `@layer` blocks in the built CSS.
//
// Why: Tailwind v4 wraps every utility in `@layer` (Chrome 99+). The
// Android System WebView on older phones — the engine behind Via, Soul
// and DuckDuckGo — predates `@layer`, so it drops the WHOLE layer block
// and the site renders with no utilities at all: desktop-only nav shows,
// the bottom tab bar loses `fixed`, buttons fall back to grey system
// styling, and the layout tears apart (verified by screenshot against
// the layer-stripped simulation). Unwrapping keeps every rule and its
// order, so old browsers apply the utilities exactly like new ones.
//
// Cascade note: layers only order rules between layers; this file's
// layers appear in theme -> base -> components -> utilities order, and
// unwrapping preserves that order, so relative priority is unchanged.
// Tailwind already guards `color-mix()` with `@supports` + hex
// fallbacks, so no colour work is needed here.
//
// Idempotent: after the first run there are no `@layer` blocks left,
// so a second run changes nothing. Run from the repo root; safe to run
// on Vercel (plain node, no deps).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const distDir = new URL("../dist/assets", import.meta.url).pathname;

function unwrapLayers(css) {
  let out = "";
  let i = 0;
  let removed = 0;
  let unwrapped = 0;
  while (i < css.length) {
    const idx = css.indexOf("@layer", i);
    if (idx === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, idx);
    let j = idx + "@layer".length;
    while (j < css.length && css[j] !== ";" && css[j] !== "{") j++;
    if (j >= css.length) break;
    if (css[j] === ";") {
      removed++; // `@layer theme, base, ...;` statement — drop it.
      i = j + 1;
      continue;
    }
    // Block form `@layer name { ... }`: keep the inner rules, drop the wrapper.
    let depth = 0;
    let k = j;
    while (k < css.length) {
      if (css[k] === "{") depth++;
      else if (css[k] === "}") {
        depth--;
        if (depth === 0) break;
      }
      k++;
    }
    if (k >= css.length) {
      // Unbalanced (should not happen) — keep the rest untouched.
      out += css.slice(idx);
      break;
    }
    unwrapped++;
    out += css.slice(j + 1, k);
    i = k + 1;
  }
  return { css: out, removed, unwrapped };
}

let total = 0;
for (const file of readdirSync(distDir)) {
  if (!file.endsWith(".css")) continue;
  const path = join(distDir, file);
  const before = readFileSync(path, "utf8");
  const { css: after, removed, unwrapped } = unwrapLayers(before);
  if (removed === 0 && unwrapped === 0) {
    console.log(`[unwrap-layers] ${file}: no @layer found, unchanged (${before.length} bytes)`);
    continue;
  }
  // Sanity: brace balance must survive the unwrap.
  const open = (after.match(/\{/g) || []).length;
  const close = (after.match(/\}/g) || []).length;
  if (open !== close) {
    throw new Error(`[unwrap-layers] ${file}: brace imbalance after unwrap (${open} vs ${close}) — refusing to write`);
  }
  if (after.includes("@layer")) {
    throw new Error(`[unwrap-layers] ${file}: @layer still present after unwrap — refusing to write`);
  }
  writeFileSync(path, after);
  console.log(`[unwrap-layers] ${file}: ${before.length} -> ${after.length} bytes (unwrapped ${unwrapped} layer blocks, removed ${removed} statements)`);
  total++;
}
if (total === 0) console.log("[unwrap-layers] no CSS files processed");
