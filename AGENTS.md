# PULSE VIDEO — Cloudflare port (branch `cloudflare`)

This directory is the Cloudflare port of the PULSE VIDEO site: frontend
on Cloudflare Pages, backend on a Cloudflare Worker. It is NOT the live
Vercel deployment (`~/workspace/pulse-video-vercel/`, branch `vercel`)
and NOT the live Muse web artifact — do not confuse it with
`~/workspace/pulse-video/` (the saved Muse source export) or with the
live artifact's data in `~/workspace/ts-spaces/video-website/app.db`.
Never read or modify the live artifact's database from here.

## How it is built and shipped

- Client: Vite (`bun run build` → `dist/`), served by Cloudflare
  Pages (project `pulse-video`, https://pulse-video.pages.dev). The
  client code is identical to the Vercel port — the Pages site proxies
  `/api/*`, `/sitemap.xml`, `/robots.txt` and `/video/*` to the Worker
  (see `client/public/_redirects`), so the client still calls
  same-origin `/api/actions`.
- Server: one Cloudflare Worker (`worker/`, name `pulse-video-api`,
  https://pulse-video-api.sakibhabib890.workers.dev/) — the same 9
  actions as the Vercel port, plus a one-time `migrateFromVercel`
  action. Server code lives in `worker/src/lib/` (store, admin auth,
  actions, catalog, embed resolution, SEO).
- Data: Cloudflare KV namespace `pulse-video-data`
  (`f5a6839af3db4a86b3eaebe0d4f8da1f`, binding `PV_DATA`) holding the
  same three documents the Vercel Blob store held
  (`data/interactions.json`, `data/admin-state.json`,
  `data/sitemap-cache.json`). KV is eventually consistent — a write
  can take up to ~60 s to be visible everywhere.
- Deploy: Git-connected Cloudflare projects (Worker + Pages) building
  from the `cloudflare` branch of repo `habib989900/pulse-video`.
  Pushes to that branch go through the GitHub snapshot-push procedure
  with a sync record adjacent to this directory. Secrets
  (`ADMIN_CODE`, `ADMIN_TOKEN_SECRET`) live in the Worker's dashboard
  settings, never in the repo.

## Rules for this copy

- No secrets in the repo. `ADMIN_CODE` / `ADMIN_TOKEN_SECRET` are
  Worker secrets set in the Cloudflare dashboard.
- `icon.webp` (binary) is intentionally not in the repo — snapshot
  pushes only carry UTF-8 text files.
- The `lib/` and `api/` directories at the repo root are the VERCEL
  server code, kept for reference — the Cloudflare backend is
  `worker/src/lib/`, not these. Do not edit the root `lib/`/`api/`
  expecting the Cloudflare deployment to change.
- The Cloudflare deployment starts from the built-in catalog in
  `client/src/App.tsx`. The live site's 200 imported videos are NOT
  here; they arrive via the Worker's `migrateFromVercel` action
  (copies the live Vercel admin state + interactions into KV).
