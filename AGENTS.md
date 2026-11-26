# PULSE VIDEO — Vercel port (branch `vercel`)

This directory is the Vercel port of the PULSE VIDEO site. It is NOT the
live Muse web artifact — do not confuse it with `~/workspace/pulse-video/`
(the saved Muse source export) or with the live artifact's data in
`~/workspace/ts-spaces/video-website/app.db`. Never read or modify the
live artifact's database from here.

## How it is built and shipped

- Client: Vite (`bun run build` → `dist/`), served statically by Vercel.
- Server: one Vercel Serverless Function (`api/actions.ts`) backed by
  `lib/` (actions, Blob store, admin auth, embed resolution).
- Data: Vercel Blob store (`data/interactions.json`,
  `data/admin-state.json`); locally, JSON files under `.vercel-data/`.
- Deploy: Git-linked Vercel project, production branch `vercel`
  (repo `habib989900/pulse-video`). Pushes to that branch go through
  the GitHub snapshot-push procedure with the sync record at
  `~/workspace/pulse-video-vercel.muse-github-snapshot-sync.json`.

## Rules for this copy

- No secrets in the repo. `ADMIN_CODE` / `ADMIN_TOKEN_SECRET` live in
  the Vercel project's env vars; `BLOB_READ_WRITE_TOKEN` is injected
  when the Blob store is connected to the project.
- `icon.webp` (binary) is intentionally not in the repo — snapshot
  pushes only carry UTF-8 text files.
- The Vercel deployment starts from the built-in catalog in
  `client/src/App.tsx`. The live site's 198 imported videos are NOT
  here; they are re-imported through the Vercel admin panel's CSV
  import.
