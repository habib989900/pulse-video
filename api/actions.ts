// Single RPC endpoint for the Vercel port: POST /api/actions with
// { action, args } — the same shape the Muse version's action client
// posted to ./actions. One function keeps the deploy surface minimal
// and the client code unchanged apart from the transport.
//
// Node.js runtime (needs node:crypto + fetch; no edge constraints).
// maxDuration 10 s is the Hobby cap — resolveEmbedFile's fetches are
// capped at 8 s each so a resolve stays inside it.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ACTIONS } from "../lib/actions.js";

export const config = { maxDuration: 10 };

/* A17: per-IP throttling, in memory per function instance. The code
   check is brute-forceable, so it gets a tight budget (5/min); the
   resolver does outbound fetches, so it gets 20/min. 429s are
   explicit — the client shows the message and the user retries. */
const hits = new Map<string, number[]>();
function rateLimited(key: string, limit: number, windowMs: number): boolean {
  if (hits.size > 10_000) hits.clear();
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

function clientIp(req: VercelRequest): string {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return fwd || req.socket?.remoteAddress || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = (req.body ?? {}) as { action?: unknown; args?: unknown };
  const name = typeof body.action === "string" ? body.action : "";
  const def = ACTIONS[name];
  if (!def) {
    return res.status(400).json({ error: `Unknown action: ${name || "(missing)"}` });
  }
  if (name === "verifyAdminCode" && rateLimited(`code:${clientIp(req)}`, 10, 60_000)) {
    return res.status(429).json({ error: "Too many code attempts — try again in a minute." });
  }
  if (name === "resolveEmbedFile" && rateLimited(`resolve:${clientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ error: "Too many resolve requests — try again in a minute." });
  }
  const parsed = def.request.safeParse(body.args ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid arguments" });
  }
  try {
    const result = await def.handler(parsed.data as never);
    return res.status(200).json(result);
  } catch (err) {
    /* A39: expected client errors (admin session, invalid payload,
       rate limits) keep their status and message; anything else is
       an unexpected server failure — log the real message
       server-side and answer a generic 500, never leaking internals
       (store paths, tokens, stack traces) to the client. */
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status === "number" && (status === 400 || status === 429)) {
      return res.status(status).json({ error: err instanceof Error ? err.message : "Request failed" });
    }
    console.error("[actions]", name, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
