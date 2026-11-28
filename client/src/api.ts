// Typed RPC client for the Vercel port.
//
// Same action surface as the Muse version (server/src/actions.ts), but
// plain HTTP: POST { action, args } to /api/actions, which dispatches
// to the matching handler in lib/actions.ts and returns its JSON.
// No SDK, no codegen — the method types below are the contract.

export type InteractionKind = "like" | "save" | "follow" | "history" | "dislike";

export interface EmbedStream {
  url: string;
  label: string;
  hls: boolean;
}

export interface EmbedFileResult {
  fileUrl: string | null;
  hdFileUrl: string | null;
  fastLabel: string | null;
  streams: EmbedStream[];
  expiresAt: number | null;
}

export interface ViewerState {
  likes: string[];
  saves: string[];
  follows: string[];
  history: string[];
  dislikes: string[];
}

async function call<T>(action: string, args: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, args }),
      /* The serverless function caps at ~10s of work; a hung request
         must fail loudly instead of spinning forever. */
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new Error("Request timed out — please try again");
    }
    throw e;
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return data as T;
}

export const api = {
  getState: (_args: Record<string, never>): Promise<ViewerState> => call("getState", _args),
  getAdminState: (_args: Record<string, never>): Promise<{ payload: string | null }> =>
    call("getAdminState", _args),
  /* Slim public-listing variant of getAdminState (speed round,
     item 4): same `{ payload }` shape, but each video keeps only
     what home/list/search pages and the player need — descriptions
     and SEO text are dropped, so the payload is ~13% smaller on the
     live catalog. The admin panel must NEVER use this: saving slim
     state would persist the dropped fields as null and wipe every
     video description. Use getAdminState (full) for the panel and
     for the video page's description. */
  getAdminStateSlim: async (): Promise<{ payload: string | null }> => {
    /* PageSpeed round (2026-11-27): index.html boot-prefetches this
       exact request while the JS bundle is still downloading, so the
       home page's first card does not wait for React to mount. Take
       that stashed promise for the first call only; a rejection (or
       a missing stash) falls through to a normal request. */
    const w = window as unknown as { __pvBootAdmin?: Promise<{ payload: string | null }> };
    if (w.__pvBootAdmin) {
      const boot = w.__pvBootAdmin;
      delete w.__pvBootAdmin;
      try {
        return await boot;
      } catch {
        /* fall through to a normal call below */
      }
    }
    return call("getAdminState", { slim: true });
  },
  toggleInteraction: (args: { kind: InteractionKind; itemKey: string }): Promise<{ active: boolean }> =>
    call("toggleInteraction", args),
  recordHistory: (args: { itemKey: string }): Promise<{ ok: true }> => call("recordHistory", args),
  clearHistory: (args: { token: string }): Promise<{ ok: true }> => call("clearHistory", args),
  verifyAdminCode: (args: { code: string }): Promise<{ admin: boolean; token: string | null }> =>
    call("verifyAdminCode", args),
  saveAdminState: (args: { payload: string; token: string }): Promise<{ ok: true }> =>
    call("saveAdminState", args),
  resetAdminState: (args: { token: string }): Promise<{ ok: true }> => call("resetAdminState", args),
  resolveEmbedFile: (args: { embedUrl: string }): Promise<EmbedFileResult> =>
    call("resolveEmbedFile", args),
};
