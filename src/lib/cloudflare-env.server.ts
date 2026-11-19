export interface CloudflareKvNamespace {
  get: (key: string, type?: "text" | "json") => Promise<unknown>;
  put: (key: string, value: string) => Promise<void>;
  delete?: (key: string) => Promise<void>;
}

type EnvRecord = Record<string, unknown>;

interface AsyncStorageLike<T> {
  run: <R>(store: T, callback: () => R) => R;
  getStore: () => T | undefined;
}

let runtimeEnvAls: AsyncStorageLike<EnvRecord> | null = null;
let alsInitPromise: Promise<void> | null = null;
let latestRuntimeEnv: EnvRecord | null = null;
let cachedWorkersModuleEnv: EnvRecord | null = null;
let workersModuleChecked = false;

function asNonEmptyRecord(candidate: unknown): EnvRecord | null {
  if (!candidate || typeof candidate !== "object") return null;
  const rec = candidate as EnvRecord;
  return Object.keys(rec).length > 0 ? rec : null;
}

async function loadCloudflareWorkersModuleEnv(): Promise<EnvRecord | null> {
  if (workersModuleChecked) return cachedWorkersModuleEnv;
  workersModuleChecked = true;
  try {
    const cfModuleName = ["cloudflare", "workers"].join(":");
    const mod = (await import(/* @vite-ignore */ cfModuleName)) as { env?: unknown };
    const envObj = asNonEmptyRecord(mod?.env);
    if (envObj) {
      cachedWorkersModuleEnv = envObj;
    }
  } catch {
    // Not running on Cloudflare workerd (e.g. Node.js / Vitest)
  }
  return cachedWorkersModuleEnv;
}

function extractEnvSync(request?: unknown, directEnv?: unknown, ctx?: unknown): EnvRecord | null {
  const fromDirect = asNonEmptyRecord(directEnv);
  if (fromDirect) return fromDirect;

  const reqAny = request as
    | {
        runtime?: { cloudflare?: { env?: unknown } };
        context?: { cloudflare?: { env?: unknown }; env?: unknown };
        cloudflare?: { env?: unknown };
      }
    | undefined;

  const fromReqRuntime = asNonEmptyRecord(reqAny?.runtime?.cloudflare?.env);
  if (fromReqRuntime) return fromReqRuntime;

  const fromReqContextCf = asNonEmptyRecord(reqAny?.context?.cloudflare?.env);
  if (fromReqContextCf) return fromReqContextCf;

  const fromReqContext = asNonEmptyRecord(reqAny?.context?.env);
  if (fromReqContext) return fromReqContext;

  const fromReqCf = asNonEmptyRecord(reqAny?.cloudflare?.env);
  if (fromReqCf) return fromReqCf;

  const ctxAny = ctx as { env?: unknown; cloudflare?: { env?: unknown } } | undefined;
  const fromCtxEnv = asNonEmptyRecord(ctxAny?.env) || asNonEmptyRecord(ctxAny?.cloudflare?.env);
  if (fromCtxEnv) return fromCtxEnv;

  const fromGlobal = asNonEmptyRecord((globalThis as { __env__?: unknown }).__env__);
  if (fromGlobal) return fromGlobal;

  if (cachedWorkersModuleEnv) return cachedWorkersModuleEnv;

  return null;
}

export async function resolveCloudflareRuntimeEnv(
  request?: unknown,
  directEnv?: unknown,
  ctx?: unknown,
): Promise<EnvRecord | null> {
  // If directEnv was explicitly passed (even empty `{}` in tests), preserve test isolation semantics
  if (directEnv && typeof directEnv === "object") {
    return directEnv as EnvRecord;
  }
  const syncEnv = extractEnvSync(request, directEnv, ctx);
  if (syncEnv) return syncEnv;
  return await loadCloudflareWorkersModuleEnv();
}

export async function ensureCloudflareEnvFromRequest(
  request?: unknown,
  directEnv?: unknown,
  ctx?: unknown,
): Promise<EnvRecord | null> {
  const resolved = await resolveCloudflareRuntimeEnv(request, directEnv, ctx);
  if (resolved && Object.keys(resolved).length > 0) {
    latestRuntimeEnv = resolved;
  }
  return resolved;
}

function ensureAsyncLocalStorage(): Promise<void> {
  if (runtimeEnvAls || alsInitPromise) {
    return alsInitPromise ?? Promise.resolve();
  }
  alsInitPromise = (async () => {
    try {
      const mod = await import("node:async_hooks");
      if (mod && typeof mod.AsyncLocalStorage === "function") {
        runtimeEnvAls = new mod.AsyncLocalStorage<EnvRecord>();
      }
    } catch {
      // Runtime without node:async_hooks falls back to latestRuntimeEnv
    }
  })();
  return alsInitPromise;
}

export async function runWithCloudflareEnv<T>(env: unknown, fn: () => Promise<T> | T): Promise<T> {
  const normalized: EnvRecord | null = env && typeof env === "object" ? (env as EnvRecord) : null;
  if (normalized) {
    latestRuntimeEnv = normalized;
  }
  await ensureAsyncLocalStorage();
  if (runtimeEnvAls && normalized) {
    return await runtimeEnvAls.run(normalized, fn);
  }
  return await fn();
}

export function getActiveRuntimeEnv(): EnvRecord | null {
  const fromAls = runtimeEnvAls?.getStore();
  if (fromAls) return fromAls;
  if (latestRuntimeEnv && Object.keys(latestRuntimeEnv).length > 0) {
    return latestRuntimeEnv;
  }
  const fromGlobal = asNonEmptyRecord((globalThis as { __env__?: unknown }).__env__);
  if (fromGlobal) return fromGlobal;
  if (cachedWorkersModuleEnv) return cachedWorkersModuleEnv;
  return latestRuntimeEnv;
}

export function getRuntimeEnvVar(key: string): string | undefined {
  const candidates = [
    runtimeEnvAls?.getStore(),
    latestRuntimeEnv,
    asNonEmptyRecord((globalThis as { __env__?: unknown }).__env__),
    cachedWorkersModuleEnv,
  ];
  for (const activeEnv of candidates) {
    if (activeEnv) {
      const val = activeEnv[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    }
  }

  if (typeof process !== "undefined" && process.env && process.env[key]) {
    const val = process.env[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }

  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    if (metaEnv && metaEnv[key]) {
      const val = metaEnv[key];
      if (typeof val === "string" && val.trim().length > 0) {
        return val.trim();
      }
    }
  } catch {
    // ignore
  }

  return undefined;
}

function isKvNamespace(candidate: unknown): candidate is CloudflareKvNamespace {
  return Boolean(
    candidate &&
    typeof candidate === "object" &&
    typeof (candidate as CloudflareKvNamespace).get === "function" &&
    typeof (candidate as CloudflareKvNamespace).put === "function",
  );
}

const PREFERRED_KV_BINDINGS = [
  "PIZARRA_KV",
  "LICENSES_KV",
  "KV_LICENSES",
  "PIZARRA_LICENSES",
  "KV",
];

function findKvInEnv(envObj: EnvRecord | null | undefined): CloudflareKvNamespace | null {
  if (!envObj) return null;
  for (const name of PREFERRED_KV_BINDINGS) {
    const candidate = envObj[name];
    if (isKvNamespace(candidate)) {
      return candidate;
    }
  }
  for (const value of Object.values(envObj)) {
    if (isKvNamespace(value)) {
      return value;
    }
  }
  return null;
}

export function getBoundCloudflareKv(): CloudflareKvNamespace | null {
  const fromAls = runtimeEnvAls?.getStore();
  // If ALS explicitly scoped an env object (e.g. `{}` in tests), honor it first if non-empty,
  // and if explicitly empty `{}` in tests, still allow checking global only when ALS wasn't explicitly {}
  if (fromAls) {
    return findKvInEnv(fromAls);
  }
  return (
    findKvInEnv(latestRuntimeEnv) ||
    findKvInEnv(asNonEmptyRecord((globalThis as { __env__?: unknown }).__env__)) ||
    findKvInEnv(cachedWorkersModuleEnv)
  );
}
