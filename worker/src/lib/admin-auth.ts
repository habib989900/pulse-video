// Admin authorization for the Cloudflare port — same scheme as the
// Vercel port (12-hour HMAC-SHA256 session token), implemented with
// WebCrypto (crypto.subtle) instead of node:crypto, which Workers do
// not have. The admin code and the token-signing secret live ONLY in
// the Worker's secrets (ADMIN_CODE / ADMIN_TOKEN_SECRET) — the client
// bundle never contains either.

import { getEnv } from "./env.js";

const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const enc = new TextEncoder();

let keyPromise: Promise<CryptoKey> | null = null;
function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = getEnv().ADMIN_TOKEN_SECRET;
    if (!secret) {
      keyPromise = Promise.reject(
        new Error("ADMIN_TOKEN_SECRET is not set — admin sign-in is unavailable."),
      );
    } else {
      keyPromise = crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
    }
  }
  return keyPromise;
}

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return base64url(sig);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function issueAdminToken(): Promise<string> {
  const exp = Date.now() + ADMIN_TOKEN_TTL_MS;
  return `${exp}.${await sign(`admin:${exp}`)}`;
}

export async function isValidAdminToken(token: string): Promise<boolean> {
  if (!getEnv().ADMIN_TOKEN_SECRET) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  const expected = await sign(`admin:${exp}`);
  const given = token.slice(dot + 1);
  if (given.length !== expected.length) return false;
  return constantTimeEqual(enc.encode(given), enc.encode(expected));
}

export async function requireAdmin(token: string): Promise<void> {
  if (!(await isValidAdminToken(token))) {
    throw Object.assign(
      new Error(
        "Admin session missing or expired — type the admin code in the site search box to open the panel again, then retry.",
      ),
      { status: 400 },
    );
  }
}

export function checkAdminCode(code: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/^#+\/?/, "").replace(/\/$/, "");
  const stored = normalize(getEnv().ADMIN_CODE);
  if (!stored) return false;
  const given = normalize(code);
  if (!given) return false;
  const a = enc.encode(given);
  const b = enc.encode(stored);
  return constantTimeEqual(a, b);
}
