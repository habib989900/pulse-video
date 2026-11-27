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
  /* A14: fail fast when the signing secret is unset instead of
     issuing tokens signed with an empty key (which anyone who knew
     the secret was empty could forge). Production has the var set —
     the admin flow works live — so this only ever fires on a
     misconfigured deploy. */
  if (!ADMIN_TOKEN_SECRET) throw new Error("ADMIN_TOKEN_SECRET is not set — admin sign-in is unavailable.");
  return createHmac("sha256", ADMIN_TOKEN_SECRET).update(payload).digest("base64url");
}

export function issueAdminToken(): string {
  const exp = Date.now() + ADMIN_TOKEN_TTL_MS;
  return `${exp}.${sign(`admin:${exp}`)}`;
}

export function isValidAdminToken(token: string): boolean {
  if (!ADMIN_TOKEN_SECRET) return false;
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
    /* 400 with a helpful message (not a generic 500): the client
       shows this text and offers the code-input recovery view. */
    throw Object.assign(
      new Error(
        "Admin session missing or expired — type the admin code in the site search box to open the panel again, then retry.",
      ),
      { status: 400 },
    );
  }
}

/** Normalises typed text the same way the Muse version did and checks it
    against the server-held code. An unset ADMIN_CODE never matches.
    A17: the stored code is normalised the same way as the input, and
    the comparison is constant-time (timingSafeEqual) so a correct
    guess cannot be distinguished from a wrong one by timing. */
export function checkAdminCode(code: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/^#+\/?/, "").replace(/\/$/, "");
  const stored = normalize(ADMIN_CODE);
  if (!stored) return false;
  const given = normalize(code);
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
