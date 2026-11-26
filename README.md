# PULSE VIDEO

A video streaming website — home / trending / latest listings, video pages with a native 16:9 player (loading spinner, on-screen quality menu with every resolution the source offers, fullscreen with landscape auto-rotate), categories, models, channels, tags, search, watch history, likes/saves/follows, light/dark mode, full dynamic SEO with a generated sitemap & robots.txt, and an admin panel (site texts, SEO, video CRUD, CSV import of embed links, bulk delete).

This is the complete source tree of the live site (v23, 2026-11-26), exported for GitHub. The live site's data (imported videos, admin state, viewer interactions) lives in its own database (`app.db`) and is **not** included in this repo.

## Stack

- **Client:** React 19 + TypeScript + Tailwind CSS v4 (`client/`)
- **Server:** Typed server actions on the Hatch/Muse space runtime (`@hatch/space-sdk`) with Drizzle ORM + SQLite (`server/`, `drizzle/`)
- **Tooling:** Bun (see `package.json` — `packageManager: bun@1.3.10`)

## Layout

| Path | What it is |
| --- | --- |
| `client/index.html` | HTML entry + static SEO baseline (title, meta, Open Graph, JSON-LD) |
| `client/src/App.tsx` | The whole site UI — pages, players, admin panel, dynamic SEO, sitemap/robots generators |
| `client/src/api.ts` | Typed RPC client for the server actions |
| `client/src/main.tsx` | React entry point |
| `client/src/theme.css` | Theme tokens, dark (default) + light themes, player styles |
| `client/build.mjs` | Client bundle build (via `@hatch/space-sdk/build`) |
| `server/src/actions.ts` | Server actions: viewer state, admin auth + state, embed resolution (`resolveEmbedFile`) |
| `server/src/schema.ts` | Drizzle schema (`interactions`, `admin_state`) |
| `drizzle/` | SQL migrations + journal |
| `DATA-PLAN.md` | Data sources & design history of the site |
| `space.json` | Muse web-artifact metadata for the live site |

## Running it

This codebase targets the Muse/Hatch TypeScript space runtime: the client calls the server through typed actions (`client/src/api.ts` → `server/src/actions.ts`), and `@hatch/space-sdk` is referenced in `package.json` as a local `file:` dependency provided by that runtime. Inside a Muse space it builds with:

```sh
bun install
bun run build        # builds server actions + client bundle
bun run typecheck
```

To run it outside that runtime you would need to provide an equivalent `@hatch/space-sdk` implementation (action RPC + SQLite/Drizzle database + blob/query invalidation surface) — the app code itself has no other hosting assumptions.

## Configuration / secrets

No secrets are committed. Copy `.env.example` to `.env` and set:

- `ADMIN_CODE` — the code typed into the site's search box to open the admin panel (route `#/panel`). The server checks it and issues a 12-hour HMAC-signed session token; state-changing admin actions re-verify that token on every call.
- `ADMIN_TOKEN_SECRET` — the HMAC signing secret for those admin tokens (use a long random value).

In the exported `server/src/actions.ts` both values are read from `process.env` — search for `ADMIN_CODE` / `ADMIN_TOKEN_SECRET` at the top of that file.

## Notes

- Embed playback: `resolveEmbedFile` resolves freepornvideo.sex and xnxx.com embed pages server-side to their direct streams (every published resolution, MP4 + HLS) so videos play in the site's own player; unresolvable embeds fall back to a sandboxed iframe player.
- The built-in catalog in `App.tsx` is the site's starting content; everything the admin panel manages is stored as one JSON payload in the `admin_state` table.
