// Worker environment bindings for the Cloudflare port of PULSE VIDEO.
//
// The Vercel port read these from process.env at module load. A Worker
// gets its bindings per request (the `env` argument of the fetch
// handler), so the entry point calls bindEnv(env) once per request and
// the lib modules read through getEnv(). The KV namespace holds the
// same three documents the Vercel Blob store held (see store.ts).

export interface KVNamespaceLike {
  get(key: string, type: "json"): Promise<unknown>;
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CfEnv {
  PV_DATA: KVNamespaceLike;
  ADMIN_CODE: string;
  ADMIN_TOKEN_SECRET: string;
  PUBLIC_ORIGIN: string;
}

let ENV: CfEnv | null = null;

export function bindEnv(env: CfEnv): void {
  ENV = env;
}

export function getEnv(): CfEnv {
  if (!ENV) throw new Error("Worker env not bound — bindEnv(env) must run first.");
  return ENV;
}
