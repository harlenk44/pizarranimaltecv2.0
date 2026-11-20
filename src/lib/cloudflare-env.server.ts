export type CloudflareRuntimeEnv = Record<string, unknown>;

interface AsyncStorageLike<T> {
  getStore(): T | undefined;
  run<R>(store: T, callback: () => R): R;
}

let runtimeEnvStorage: AsyncStorageLike<CloudflareRuntimeEnv> | null = null;
let alsLoadPromise: Promise<void> | null = null;

function initAsyncLocalStorage(): Promise<void> {
  if (typeof window !== "undefined") return Promise.resolve();
  if (runtimeEnvStorage) return Promise.resolve();
  if (!alsLoadPromise) {
    const nodeAsyncHooksSpecifier = "node:async_hooks";
    alsLoadPromise = import(/* @vite-ignore */ nodeAsyncHooksSpecifier)
      .then((mod) => {
        const Ctor = (mod as { AsyncLocalStorage?: new <T>() => AsyncStorageLike<T> })
          .AsyncLocalStorage;
        if (typeof Ctor === "function" && !runtimeEnvStorage) {
          runtimeEnvStorage = new Ctor<CloudflareRuntimeEnv>();
        }
      })
      .catch(() => {
        // Environment does not provide node:async_hooks; latestRuntimeEnv fallback remains active.
      });
  }
  return alsLoadPromise;
}

if (typeof window === "undefined") {
  void initAsyncLocalStorage();
}

// Fallback reference for Cloudflare Worker isolates where a nested callback
// drops AsyncLocalStorage context. Updated on every incoming request.
let latestRuntimeEnv: CloudflareRuntimeEnv | undefined;

function asNonEmptyRecord(value: unknown): CloudflareRuntimeEnv | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as CloudflareRuntimeEnv;
  try {
    if (Object.keys(rec).length > 0) return rec;
  } catch {
    // Some Cloudflare Workers env proxies hide keys from Object.keys; probe known keys.
  }
  if (
    rec["SUPABASE_URL"] !== undefined ||
    rec["SUPABASE_KEY"] !== undefined ||
    rec["SUPABASE_SERVICE_ROLE_KEY"] !== undefined ||
    rec["SUPABASE_SECRET_KEY"] !== undefined ||
    rec["SUPABASE_PUBLISHABLE_KEY"] !== undefined ||
    rec["SUPABASE_ANON_KEY"] !== undefined ||
    rec["VITE_SUPABASE_URL"] !== undefined ||
    rec["VITE_SUPABASE_PUBLISHABLE_KEY"] !== undefined ||
    rec["ASSETS"] !== undefined
  ) {
    return rec;
  }
  return undefined;
}

/**
 * Extracts Cloudflare Worker / Pages runtime `env` bindings from all known
 * injection points used by Nitro / TanStack Start on Cloudflare Pages:
 * 1. Explicit `env` parameter passed to `fetch(request, env, ctx)`
 * 2. Nitro's `request.runtime.cloudflare.env` or `request.cloudflare.env`
 * 3. Nitro's `globalThis.__env__`
 * 4. Cloudflare Workers' built-in `cloudflare:workers` module (`import { env }`)
 */
export async function resolveCloudflareRuntimeEnv(
  explicitEnv?: unknown,
  request?: Request,
): Promise<CloudflareRuntimeEnv | undefined> {
  const fromExplicit = asNonEmptyRecord(explicitEnv);
  if (fromExplicit) return fromExplicit;

  if (request) {
    const reqAny = request as unknown as {
      runtime?: { cloudflare?: { env?: unknown } };
      cloudflare?: { env?: unknown };
      context?: { cloudflare?: { env?: unknown } };
    };
    const fromReq =
      asNonEmptyRecord(reqAny.runtime?.cloudflare?.env) ??
      asNonEmptyRecord(reqAny.cloudflare?.env) ??
      asNonEmptyRecord(reqAny.context?.cloudflare?.env);
    if (fromReq) return fromReq;
  }

  const globalAny = globalThis as unknown as {
    __env__?: unknown;
    __cloudflare_env__?: unknown;
  };
  const fromGlobal =
    asNonEmptyRecord(globalAny.__env__) ?? asNonEmptyRecord(globalAny.__cloudflare_env__);
  if (fromGlobal) return fromGlobal;

  if (typeof window === "undefined") {
    try {
      const specifier = "cloudflare:workers";
      const cfMod = (await import(/* @vite-ignore */ specifier)) as { env?: unknown };
      const fromModule = asNonEmptyRecord(cfMod?.env);
      if (fromModule) return fromModule;
    } catch {
      // Not running on Cloudflare Workers (e.g. local Node.js / Vitest)
    }
  }

  return undefined;
}

export async function ensureCloudflareEnvFromRequest(request?: Request): Promise<void> {
  await initAsyncLocalStorage();
  const current = runtimeEnvStorage?.getStore();
  if (current && asNonEmptyRecord(current)) return;

  const resolved = await resolveCloudflareRuntimeEnv(undefined, request);
  if (resolved) {
    latestRuntimeEnv = resolved;
  }
}

export function runWithCloudflareEnv<T>(env: unknown, fn: () => T): T {
  if (env && typeof env === "object") {
    const record = env as CloudflareRuntimeEnv;
    latestRuntimeEnv = record;
    if (runtimeEnvStorage) {
      return runtimeEnvStorage.run(record, fn);
    }
  }
  return fn();
}

function getCurrentEnvObject(): CloudflareRuntimeEnv | undefined {
  const fromStore = runtimeEnvStorage?.getStore();
  if (fromStore) return fromStore;

  const globalAny = globalThis as unknown as {
    __env__?: unknown;
    __cloudflare_env__?: unknown;
  };
  const fromGlobal =
    asNonEmptyRecord(globalAny.__env__) ?? asNonEmptyRecord(globalAny.__cloudflare_env__);
  if (fromGlobal) return fromGlobal;

  return latestRuntimeEnv;
}

export function getRuntimeEnvVar(name: string): string | undefined {
  const cfEnv = getCurrentEnvObject();
  const cfVal = cfEnv?.[name];
  if (typeof cfVal === "string" && cfVal.trim().length > 0) {
    return cfVal.trim();
  }

  if (typeof process !== "undefined" && process.env) {
    const procVal = process.env[name];
    if (typeof procVal === "string" && procVal.trim().length > 0) {
      return procVal.trim();
    }
  }

  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    const val = metaEnv?.[name];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  } catch {
    // ignore
  }

  return undefined;
}
