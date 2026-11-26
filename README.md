# PULSE VIDEO — Vercel port

A video streaming website — home / trending / latest listings, video pages with a native 16:9 player (loading spinner, on-screen quality menu with every resolution the source offers, fullscreen with landscape auto-rotate), categories, models, channels, tags, search, watch history, likes/saves/follows, light/dark mode, full dynamic SEO with a generated sitemap & robots.txt, and an admin panel (site texts, SEO, video CRUD, CSV import of embed links, bulk delete).

This branch (`vercel`) is the Vercel port of the PULSE VIDEO site (v23, 2026-11-26). The `main` branch holds the original Muse/Hatch space-runtime source export; this branch replaces the runtime-specific parts so the same site runs on Vercel. The live site's data (imported videos, admin state, viewer interactions) lives in the Muse database and is **not** included in this repo — a fresh Vercel deployment starts from the built-in catalog in `App.tsx`, and videos can be re-imported through the Vercel admin panel's CSV import.

## Stack

- **Client:** React 19 + TypeScript + Tailwind CSS v4, built with Vite (`client/`, `vite.config.ts`) → static `dist/`
- **Server:** one Vercel Serverless Function, `api/actions.ts`, dispatching the same 9 actions the Muse version exposed (`lib/actions.ts`); data in `lib/store.ts`, admin auth in `lib/admin-auth.ts`, embed resolution in `lib/resolve-embed.ts`
- **Database:** Vercel Blob — the two documents the site needs (`data/interactions.json`, `data/admin-state.json`, private blobs). No SQL server to provision; reads are read-modify-write, last-write-wins.
- **Tooling:** Bun (see `package.json` — `packageManager: bun@1.3.10`)

## Layout

| Path | What it is |
| --- | --- |
| `client/index.html` | HTML entry + static SEO baseline (title, meta, Open Graph, JSON-LD) |
| `client/src/App.tsx` | The whole site UI — pages, players, admin panel, dynamic SEO, sitemap/robots generators |
| `client/src/api.ts` | Fetch-based RPC client — POSTs `{ action, args }` to `/api/actions` |
| `client/src/main.tsx` | React entry point (owns its own TanStack QueryClient) |
| `client/src/theme.css` | Theme tokens, dark (default) + light themes, player styles |
| `vite.config.ts` | Vite build (React + Tailwind v4) → `dist/` |
| `vercel.json` | Build/output settings + SPA fallback rewrite (`/(.*)` → `/index.html`; `/api/*` still hits the function) |
| `api/actions.ts` | Vercel Serverless Function: validates args with zod, runs the action, returns JSON |
| `lib/actions.ts` | The 9 actions: viewer state, admin auth + state, CSV-import storage, embed resolution |
| `lib/store.ts` | Blob-backed store for interactions + admin state (local `.vercel-data/` JSON fallback when no Blob token is set) |
| `lib/admin-auth.ts` | Admin code check + 12-hour HMAC-SHA256 session tokens (node:crypto) |
| `lib/resolve-embed.ts` | Resolves freepornvideo.sex / xnxx.com embed pages to direct streams |
| `DATA-PLAN.md` | Data sources & design history of the site |

## Running it

```sh
bun install
bun run build        # vite build → dist/
bun run typecheck
```

Deploy with Vercel (Git-linked, production branch `vercel`) or `vercel deploy`. Without a Blob store configured, the API falls back to local `.vercel-data/` JSON files — fine for local testing, not persistent on Vercel.

## Configuration / secrets

No secrets are committed. Set these in the Vercel project (never in the repo):

- `ADMIN_CODE` — the code typed into the site's search box to open the admin panel (route `#/panel`). The server checks it and issues a 12-hour HMAC-signed session token; state-changing admin actions re-verify that token on every call.
- `ADMIN_TOKEN_SECRET` — the HMAC signing secret for those admin tokens (use a long random value).
- `BLOB_READ_WRITE_TOKEN` — injected automatically when a Vercel Blob store is connected to the project; the API reads/writes the two data documents through it.

## Notes

- Embed playback: `resolveEmbedFile` resolves freepornvideo.sex and xnxx.com embed pages server-side to their direct streams (every published resolution, MP4 + HLS) so videos play in the site's own player; unresolvable embeds fall back to a sandboxed iframe player. Each embed fetch is capped at 8 s so a resolve stays inside Vercel's 10 s Hobby function limit.
- The built-in catalog in `App.tsx` is the site's starting content; everything the admin panel manages is stored as one JSON payload in the Blob `data/admin-state.json` document.
- Routing is hash-based (`#/video/<id>`, `#/panel`, …); path-form URLs from the sitemap/canonical tags load the SPA and translate to the hash route on load. The sitemap and robots files are in-app pages at `#/sitemap.xml` and `#/robots.txt`, downloadable from Admin → SEO, exactly as on the Muse version.
