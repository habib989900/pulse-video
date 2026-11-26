// Action handlers for the Vercel port — the same 9 actions as the Muse
// version's server/src/actions.ts, with the same zod request/response
// contracts. The only differences: Drizzle/SQLite calls are replaced by
// the Blob-backed store (./store), admin auth uses node:crypto (./admin-auth),
// and embed resolution lives in ./resolve-embed. No ctx object: the
// client already invalidates its own React Query caches in onSuccess,
// so there is no server-driven invalidation to replace.

import { z } from "zod";
import { checkAdminCode, issueAdminToken, requireAdmin } from "./admin-auth.js";
import { resolveEmbedFile, type EmbedFileResult } from "./resolve-embed.js";
import {
  clearHistory,
  getAdminPayload,
  listInteractions,
  recordHistory,
  resetAdminPayload,
  saveAdminPayload,
  toggleInteraction,
  type InteractionKind,
} from "./store.js";

const kindEnum = z.enum(["like", "save", "follow", "history"]);

const stateResponse = z.object({
  likes: z.array(z.string()),
  saves: z.array(z.string()),
  follows: z.array(z.string()),
  history: z.array(z.string()),
});

export interface ActionDef {
  request: z.ZodTypeAny;
  handler: (args: never) => Promise<unknown>;
}

export const ACTIONS: Record<string, ActionDef> = {
  getState: {
    request: z.object({}),
    handler: async () => {
      const rows = await listInteractions();
      return stateResponse.parse({
        likes: rows.filter((r) => r.kind === "like").map((r) => r.itemKey),
        saves: rows.filter((r) => r.kind === "save").map((r) => r.itemKey),
        follows: rows.filter((r) => r.kind === "follow").map((r) => r.itemKey),
        history: rows.filter((r) => r.kind === "history").map((r) => r.itemKey),
      });
    },
  },

  toggleInteraction: {
    request: z.object({ kind: kindEnum, itemKey: z.string().min(1).max(120) }),
    handler: async (args: { kind: InteractionKind; itemKey: string }) => {
      const active = await toggleInteraction(args.kind, args.itemKey);
      return { active };
    },
  },

  recordHistory: {
    request: z.object({ itemKey: z.string().min(1).max(120) }),
    handler: async (args: { itemKey: string }) => {
      await recordHistory(args.itemKey);
      return { ok: true as const };
    },
  },

  clearHistory: {
    request: z.object({}),
    handler: async () => {
      await clearHistory();
      return { ok: true as const };
    },
  },

  getAdminState: {
    request: z.object({}),
    handler: async () => {
      // Deliberately NO token — same as the Muse version: the payload is
      // exactly the content the public site itself renders.
      return { payload: await getAdminPayload() };
    },
  },

  verifyAdminCode: {
    request: z.object({ code: z.string().min(1).max(120) }),
    handler: async (args: { code: string }) => {
      if (!checkAdminCode(args.code)) return { admin: false, token: null };
      return { admin: true, token: issueAdminToken() };
    },
  },

  saveAdminState: {
    request: z.object({ payload: z.string().max(5_000_000), token: z.string().max(500) }),
    handler: async (args: { payload: string; token: string }) => {
      requireAdmin(args.token);
      await saveAdminPayload(args.payload);
      return { ok: true as const };
    },
  },

  resetAdminState: {
    request: z.object({ token: z.string().max(500) }),
    handler: async (args: { token: string }) => {
      requireAdmin(args.token);
      await resetAdminPayload();
      return { ok: true as const };
    },
  },

  resolveEmbedFile: {
    request: z.object({ embedUrl: z.string().min(1).max(2000) }),
    handler: async (args: { embedUrl: string }): Promise<EmbedFileResult> => {
      /* TEMPORARY diagnostics (2026-11-27): the player falls back to the
         iframe in the browser even though direct resolve calls return
         streams — log whether the browser's call arrives and what it
         returns, so the Vercel function log shows the truth. Remove
         once the fallback cause is found. */
      const started = Date.now();
      const host = (() => { try { return new URL(args.embedUrl).hostname; } catch { return "?"; } })();
      try {
        const out = await resolveEmbedFile(args.embedUrl);
        console.log(`[diag] resolveEmbedFile host=${host} streams=${out.streams.length} fileUrl=${!!out.fileUrl} ms=${Date.now() - started}`);
        return out;
      } catch (err) {
        console.log(`[diag] resolveEmbedFile host=${host} THREW ms=${Date.now() - started} err=${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    },
  },
};
