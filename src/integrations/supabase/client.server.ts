// Server-only Supabase client configured via Cloudflare Pages / process.env variables.
// Uses SUPABASE_URL and SUPABASE_KEY (with fallback to SUPABASE_SERVICE_ROLE_KEY / SUPABASE_PUBLISHABLE_KEY).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createMockSupabaseClient } from "@/lib/mock-db";
import { getRuntimeEnvVar } from "@/lib/cloudflare-env.server";

const INACTIVE_SUPABASE_HOSTS = [
  "ebpunrzbagmcdtammjqn.supabase.co",
  "dqpomustswauzejggfui.supabase.co",
  ".lovable.cloud",
];

function isInactiveSupabaseUrl(url?: string): boolean {
  if (!url) return true;
  return INACTIVE_SUPABASE_HOSTS.some((host) => url.includes(host));
}

function normalizeSupabaseUrl(rawUrl?: string): { url: string | null; error: string | null } {
  if (!rawUrl) return { url: null, error: null };
  let cleaned = rawUrl.trim().replace(/\/+$/, "");
  if (!cleaned) return { url: null, error: null };
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        url: null,
        error: `SUPABASE_URL inválida (${rawUrl}): debe usar protocolo http:// o https://.`,
      };
    }
    return { url: parsed.origin, error: null };
  } catch {
    return {
      url: null,
      error: `SUPABASE_URL con formato inválido (${rawUrl}). Ejemplo esperado: https://tu-proyecto.supabase.co`,
    };
  }
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys (sb_publishable_* / sb_secret_*) are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

const DEFAULT_ACTIVE_SUPABASE_URL = "https://ebpunrzbagmcdtammiqn.supabase.co";
const DEFAULT_ACTIVE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_G3GU7Cvc1CPP5KYcdV_9sg_uxZA10d8";

function isVitestRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.env?.["VITEST"]);
}

function readServerEnv(name: string): string | undefined {
  return getRuntimeEnvVar(name);
}

export interface SupabaseCloudDiagnostics {
  configured: boolean;
  url: string | null;
  hasServiceRoleKey: boolean;
  hasPublishableKey: boolean;
  reason: string | null;
  initError: string | null;
}

export function getSupabaseCloudDiagnostics(): SupabaseCloudDiagnostics {
  const envUrl = readServerEnv("SUPABASE_URL") || readServerEnv("VITE_SUPABASE_URL");
  const envServiceRoleKey =
    readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readServerEnv("SUPABASE_SECRET_KEY") ||
    readServerEnv("SUPABASE_KEY");
  const envPublishableKey =
    readServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
    readServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    readServerEnv("SUPABASE_ANON_KEY") ||
    readServerEnv("VITE_SUPABASE_ANON_KEY");

  const useFallback = !isVitestRuntime() && (!envUrl || isInactiveSupabaseUrl(envUrl));
  const rawUrl = useFallback ? DEFAULT_ACTIVE_SUPABASE_URL : envUrl;
  const serviceRoleKey = useFallback ? undefined : envServiceRoleKey;
  const publishableKey = useFallback
    ? DEFAULT_ACTIVE_SUPABASE_PUBLISHABLE_KEY
    : envPublishableKey ||
      (!isVitestRuntime() ? DEFAULT_ACTIVE_SUPABASE_PUBLISHABLE_KEY : undefined);
  const activeKey = serviceRoleKey || publishableKey;

  if (!rawUrl) {
    return {
      configured: false,
      url: null,
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasPublishableKey: Boolean(publishableKey),
      reason:
        "No hay SUPABASE_URL configurada en Cloudflare Pages. Agrega SUPABASE_URL y SUPABASE_KEY en Settings → Environment Variables.",
      initError: null,
    };
  }

  const normalized = normalizeSupabaseUrl(rawUrl);
  if (normalized.error || !normalized.url) {
    return {
      configured: false,
      url: rawUrl,
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasPublishableKey: Boolean(publishableKey),
      reason: normalized.error || `SUPABASE_URL inválida (${rawUrl}).`,
      initError: normalized.error || `SUPABASE_URL inválida (${rawUrl}).`,
    };
  }

  if (isInactiveSupabaseUrl(normalized.url)) {
    return {
      configured: false,
      url: normalized.url,
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasPublishableKey: Boolean(publishableKey),
      reason: `La SUPABASE_URL (${normalized.url}) corresponde a un proyecto inactivo. Configura un SUPABASE_URL y SUPABASE_KEY activos en Cloudflare Pages.`,
      initError: null,
    };
  }
  if (!activeKey) {
    return {
      configured: false,
      url: normalized.url,
      hasServiceRoleKey: false,
      hasPublishableKey: false,
      reason:
        "Falta SUPABASE_KEY (o SUPABASE_SERVICE_ROLE_KEY) en Cloudflare Pages para autenticar contra Supabase.",
      initError:
        "Falta SUPABASE_KEY (o SUPABASE_SERVICE_ROLE_KEY) en Cloudflare Pages para autenticar contra Supabase.",
    };
  }
  return {
    configured: true,
    url: normalized.url,
    hasServiceRoleKey: Boolean(serviceRoleKey),
    hasPublishableKey: Boolean(publishableKey),
    reason: null,
    initError: null,
  };
}

export function createRealSupabaseAdminClient(): ReturnType<typeof createClient<Database>> | null {
  const diag = getSupabaseCloudDiagnostics();
  if (!diag.configured || !diag.url) return null;

  const envUrl = readServerEnv("SUPABASE_URL") || readServerEnv("VITE_SUPABASE_URL");
  const useFallback = !isVitestRuntime() && (!envUrl || isInactiveSupabaseUrl(envUrl));
  const key = useFallback
    ? DEFAULT_ACTIVE_SUPABASE_PUBLISHABLE_KEY
    : readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
      readServerEnv("SUPABASE_SECRET_KEY") ||
      readServerEnv("SUPABASE_KEY") ||
      readServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
      readServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
      readServerEnv("SUPABASE_ANON_KEY") ||
      readServerEnv("VITE_SUPABASE_ANON_KEY") ||
      (!isVitestRuntime() ? DEFAULT_ACTIVE_SUPABASE_PUBLISHABLE_KEY : undefined);

  if (!key) return null;

  try {
    return createClient<Database>(diag.url, key, {
      global: {
        fetch: createSupabaseFetch(key),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.error("[supabase-admin-init-error]", err);
    return null;
  }
}

export function createSupabaseClientWithToken(
  accessToken: string,
): ReturnType<typeof createClient<Database>> | null {
  const diag = getSupabaseCloudDiagnostics();
  if (!diag.configured || !diag.url) return null;

  const envUrl = readServerEnv("SUPABASE_URL") || readServerEnv("VITE_SUPABASE_URL");
  const useFallback = !isVitestRuntime() && (!envUrl || isInactiveSupabaseUrl(envUrl));
  const key = useFallback
    ? DEFAULT_ACTIVE_SUPABASE_PUBLISHABLE_KEY
    : readServerEnv("SUPABASE_KEY") ||
      readServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
      readServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
      readServerEnv("SUPABASE_ANON_KEY") ||
      readServerEnv("VITE_SUPABASE_ANON_KEY") ||
      readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
      readServerEnv("SUPABASE_SECRET_KEY") ||
      (!isVitestRuntime() ? DEFAULT_ACTIVE_SUPABASE_PUBLISHABLE_KEY : undefined);
  if (!key) return null;

  try {
    const baseFetch = createSupabaseFetch(key);
    return createClient<Database>(diag.url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        fetch: baseFetch,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.error("[supabase-token-client-init-error]", err);
    return null;
  }
}

function createSupabaseAdminClient() {
  const real = createRealSupabaseAdminClient();
  if (real) return real;
  return createMockSupabaseClient() as unknown as ReturnType<typeof createClient<Database>>;
}

// Lazy per-request proxy so Cloudflare Pages runtime env variables are resolved dynamically.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    const client = createSupabaseAdminClient();
    return Reflect.get(client, prop, receiver);
  },
});
