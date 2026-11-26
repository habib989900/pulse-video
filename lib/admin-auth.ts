// Admin authorization for the Vercel port — same scheme as the Muse
// version (12-hour HMAC-SHA256 session token), implemented with
// node:crypto instead of WebCrypto.
//
// The admin code and the token-signing secret live ONLY in server code
// (Vercel env vars ADMIN_CODE / ADMIN_TOKEN_SECRET) — the client bundle
// never contains either. Typing the code into the site's search box
// calls verifyAdminCode; on a match the server issues a token, and the
// state-changing admin actions refuse to run without a valid one.

import { createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_CODE = process.env.ADMIN_CODE ?? "";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET ?? "";
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", ADMIN_TOKEN_SECRET).update(payload).digest("base64url");
}

export function issueAdminToken(): string {
  const exp = Date.now() + ADMIN_TOKEN_TTL_MS;
  return `${exp}.${sign(`admin:${exp}`)}`;
}

export function isValidAdminToken(token: string): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  const expected = sign(`admin:${exp}`);
  const given = token.slice(dot + 1);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function requireAdmin(token: string): void {
  if (!isValidAdminToken(token)) {
    throw new Error(
      "Admin session missing or expired — type the admin code in the site search box to open the panel again, then retry.",
    );
  }
}

/** Normalises typed text the same way the Muse version did and checks it
    against the server-held code. An unset ADMIN_CODE never matches. */
export function checkAdminCode(code: string): boolean {
  if (!ADMIN_CODE) return false;
  const normalized = code.trim().toLowerCase().replace(/^#+\/?/, "").replace(/\/$/, "");
  return normalized !== "" && normalized === ADMIN_CODE;
}
