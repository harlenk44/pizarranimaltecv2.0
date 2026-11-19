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
  return latestRuntimeEnv;
}

export function getRuntimeEnvVar(key: string): string | undefined {
  const activeEnv = getActiveRuntimeEnv();
  if (activeEnv) {
    const val = activeEnv[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
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

export function getBoundCloudflareKv(): CloudflareKvNamespace | null {
  const activeEnv = getActiveRuntimeEnv();
  if (!activeEnv) return null;

  for (const name of PREFERRED_KV_BINDINGS) {
    const candidate = activeEnv[name];
    if (isKvNamespace(candidate)) {
      return candidate;
    }
  }

  for (const value of Object.values(activeEnv)) {
    if (isKvNamespace(value)) {
      return value;
    }
  }

  return null;
}
