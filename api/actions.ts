// Single RPC endpoint for the Vercel port: POST /api/actions with
// { action, args } — the same shape the Muse version's action client
// posted to ./actions. One function keeps the deploy surface minimal
// and the client code unchanged apart from the transport.
//
// Node.js runtime (needs node:crypto + fetch; no edge constraints).
// maxDuration 10 s is the Hobby cap — resolveEmbedFile's fetches are
// capped at 8 s each so a resolve stays inside it.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ACTIONS } from "../lib/actions";

export const config = { maxDuration: 10 };

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
  const parsed = def.request.safeParse(body.args ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid arguments" });
  }
  try {
    const result = await def.handler(parsed.data as never);
    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    // Admin-token failures and store errors surface as 400s with the
    // message the client already shows; nothing secret is included.
    return res.status(400).json({ error: message });
  }
}
