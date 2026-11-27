// Action handlers for the Vercel port — the same 9 actions as the Muse
// version's server/src/actions.ts, with the same zod request/response
// contracts. The only differences: Drizzle/SQLite calls are replaced by
// the Blob-backed store (./store), admin auth uses node:crypto (./admin-auth),
// and embed resolution lives in ./resolve-embed. No ctx object: the
// client already invalidates its own React Query caches in onSuccess,
// so there is no server-driven invalidation to replace.

import { z } from "zod";
import { checkAdminCode, issueAdminToken, requireAdmin } from "./admin-auth.js";
import { parseAdminState, toSlimAdminState } from "./catalog.js";
import { resolveEmbedFile, type EmbedFileResult } from "./resolve-embed.js";
import {
  clearHistory,
  getAdminPayload,
  invalidateSitemapCache,
  listInteractions,
  recordHistory,
  resetAdminPayload,
  saveAdminPayload,
  toggleInteraction,
  type InteractionKind,
} from "./store.js";

const kindEnum = z.enum(["like", "save", "follow", "history"]);

/* Server-side shape validation for the admin payload (A3). Before
   this, saveAdminState stored any string the client sent — a bug,
   a bad merge or a truncated request could silently persist a
   payload that drops the owner's videos (parseAdminState would
   coerce the missing parts to defaults). Invalid payloads are
   rejected with 400 and nothing is stored. The schema mirrors
   AdminState in lib/catalog.ts; unknown extra keys are tolerated
   (forward-compatible) but every known field must have the right
   type. The live payload is tested against this schema locally
   before every deploy. */
const adminVideoSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  description: z.string().nullable(),
  embedUrl: z.string().nullable(),
  durationSec: z.number().nullable(),
  views: z.number().nullable(),
  days: z.number().nullable(),
  dateStr: z.string().nullable(),
  creator: z.string().nullable(),
  channel: z.string().nullable(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  thumbnailUrl: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  featured: z.boolean(),
  badgeNew: z.boolean(),
  rating: z.number().nullable(),
  hd: z.boolean(),
});
const taxOpSchema = z.object({
  added: z.array(z.string()),
  renamed: z.record(z.string(), z.string()),
  deleted: z.array(z.string()),
});
const adCreativeSchema = z.object({
  enabled: z.boolean(),
  kind: z.enum(["image", "video", "html"]),
  mediaUrl: z.string(),
  linkUrl: z.string(),
  html: z.string(),
  skipAfterSec: z.number(),
});
const adminStateSchema = z.object({
  texts: z.record(z.string(), z.string()),
  buttons: z.array(z.object({ id: z.string(), name: z.string(), label: z.string(), link: z.string() })),
  seo: z.object({
    siteTitle: z.string(),
    metaDescription: z.string(),
    metaKeywords: z.string(),
    ogTitle: z.string(),
    ogDescription: z.string(),
  }),
  addedVideos: z.array(adminVideoSchema),
  overrides: z.record(z.string(), adminVideoSchema),
  deletedIds: z.array(z.string()),
  ads: z.object({
    preroll: adCreativeSchema,
    homeTop: adCreativeSchema,
    homeBottom: adCreativeSchema,
    videoBelow: adCreativeSchema,
    videoBottom: adCreativeSchema,
  }),
  taxonomy: z.object({
    categories: taxOpSchema,
    models: taxOpSchema,
    tags: taxOpSchema,
    channels: taxOpSchema,
    channelsAdded: z.array(z.object({ name: z.string(), creator: z.string() })),
  }),
});

/** Throws a 400-class error when the payload is not a valid
    AdminState. The `status` property is read by the API handler. */
export function assertValidAdminPayload(payload: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw Object.assign(new Error("Invalid admin payload: not valid JSON"), { status: 400 });
  }
  const result = adminStateSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? first.path.join(".") || "(root)" : "(unknown)";
    throw Object.assign(new Error(`Invalid admin payload: ${where} — ${first?.message ?? "bad shape"}`), { status: 400 });
  }
}

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
    /* Clearing history wipes a SHARED list (the site has no per-viewer
       accounts), so an unauthenticated visitor could delete everyone's
       history. Admin-only now; the History page shows its Clear button
       only while an admin session is active. */
    request: z.object({ token: z.string().max(500) }),
    handler: async (args: { token: string }) => {
      requireAdmin(args.token);
      await clearHistory();
      return { ok: true as const };
    },
  },

  getAdminState: {
    request: z.object({ slim: z.boolean().optional() }),
    handler: async (args: { slim?: boolean }) => {
      // Deliberately NO token — same as the Muse version: the payload is
      // exactly the content the public site itself renders.
      const payload = await getAdminPayload();
      /* Speed round, item 4: `slim: true` returns the public-listing
         variant (see toSlimAdminState in lib/catalog.ts) — same
         response shape, `{ payload }`, so existing clients are
         unaffected. The default (no flag) is the full payload the
         admin panel needs. The admin panel must NEVER use the slim
         variant: saving slim state would wipe every description. */
      if (args.slim && payload) {
        return { payload: JSON.stringify(toSlimAdminState(parseAdminState(payload))) };
      }
      return { payload };
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
      assertValidAdminPayload(args.payload);
      await saveAdminPayload(args.payload);
      /* Speed round, item 3: the saved catalog changed, so the
         cached sitemap is stale — wipe it; the next /sitemap.xml
         request rebuilds it from the new payload. Best-effort: a
         cache failure must never fail a save that already landed. */
      try {
        await invalidateSitemapCache();
      } catch (err) {
        console.error("[actions] sitemap cache invalidate failed:", err instanceof Error ? err.message : err);
      }
      return { ok: true as const };
    },
  },

  resetAdminState: {
    request: z.object({ token: z.string().max(500) }),
    handler: async (args: { token: string }) => {
      requireAdmin(args.token);
      await resetAdminPayload();
      try {
        await invalidateSitemapCache();
      } catch (err) {
        console.error("[actions] sitemap cache invalidate failed:", err instanceof Error ? err.message : err);
      }
      return { ok: true as const };
    },
  },

  resolveEmbedFile: {
    request: z.object({ embedUrl: z.string().min(1).max(2000) }),
    handler: async (args: { embedUrl: string }): Promise<EmbedFileResult> => {
      return resolveEmbedFile(args.embedUrl);
    },
  },
};
