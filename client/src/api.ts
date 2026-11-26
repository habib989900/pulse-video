// Typed RPC client for the Vercel port.
//
// Same action surface as the Muse version (server/src/actions.ts), but
// plain HTTP: POST { action, args } to /api/actions, which dispatches
// to the matching handler in lib/actions.ts and returns its JSON.
// No SDK, no codegen — the method types below are the contract.

export type InteractionKind = "like" | "save" | "follow" | "history";

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
}

export interface ViewerState {
  likes: string[];
  saves: string[];
  follows: string[];
  history: string[];
}

async function call<T>(action: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
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
  toggleInteraction: (args: { kind: InteractionKind; itemKey: string }): Promise<{ active: boolean }> =>
    call("toggleInteraction", args),
  recordHistory: (args: { itemKey: string }): Promise<{ ok: true }> => call("recordHistory", args),
  clearHistory: (_args: Record<string, never>): Promise<{ ok: true }> => call("clearHistory", _args),
  verifyAdminCode: (args: { code: string }): Promise<{ admin: boolean; token: string | null }> =>
    call("verifyAdminCode", args),
  saveAdminState: (args: { payload: string; token: string }): Promise<{ ok: true }> =>
    call("saveAdminState", args),
  resetAdminState: (args: { token: string }): Promise<{ ok: true }> => call("resetAdminState", args),
  resolveEmbedFile: (args: { embedUrl: string }): Promise<EmbedFileResult> =>
    call("resolveEmbedFile", args),
};
