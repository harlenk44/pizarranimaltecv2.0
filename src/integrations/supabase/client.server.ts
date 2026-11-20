// Server-only Supabase client configured via Cloudflare Pages / runtime environment variables.
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

function readServerEnv(name: string): string | undefined {
  return getRuntimeEnvVar(name);
}

export interface SupabaseCloudDiagnostics {
  configured: boolean;
  url: string | null;
  hasServiceRoleKey: boolean;
  hasPublishableKey: boolean;
  reason: string | null;
}

export function getSupabaseCloudDiagnostics(): SupabaseCloudDiagnostics {
  const url = readServerEnv("SUPABASE_URL") || readServerEnv("VITE_SUPABASE_URL") || null;
  const serviceRoleKey =
    readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readServerEnv("SUPABASE_SECRET_KEY") ||
    readServerEnv("SUPABASE_KEY");
  const publishableKey =
    readServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
    readServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    readServerEnv("SUPABASE_ANON_KEY") ||
    readServerEnv("VITE_SUPABASE_ANON_KEY");
  const activeKey = serviceRoleKey || publishableKey;

  if (!url) {
    return {
      configured: false,
      url: null,
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasPublishableKey: Boolean(publishableKey),
      reason:
        "No hay SUPABASE_URL configurada en Cloudflare Pages. Agrega SUPABASE_URL y SUPABASE_KEY en Settings → Environment Variables.",
    };
  }
  if (isInactiveSupabaseUrl(url)) {
    return {
      configured: false,
      url,
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasPublishableKey: Boolean(publishableKey),
      reason: `La SUPABASE_URL (${url}) corresponde a un proyecto inactivo. Configura un SUPABASE_URL y SUPABASE_KEY activos en Cloudflare Pages.`,
    };
  }
  if (!activeKey) {
    return {
      configured: false,
      url,
      hasServiceRoleKey: false,
      hasPublishableKey: false,
      reason:
        "Falta SUPABASE_KEY (o SUPABASE_SERVICE_ROLE_KEY) en Cloudflare Pages para autenticar contra Supabase.",
    };
  }
  return {
    configured: true,
    url,
    hasServiceRoleKey: Boolean(serviceRoleKey),
    hasPublishableKey: Boolean(publishableKey),
    reason: null,
  };
}

export function createRealSupabaseAdminClient(): ReturnType<typeof createClient<Database>> | null {
  const diag = getSupabaseCloudDiagnostics();
  if (!diag.configured || !diag.url) return null;

  const key =
    readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readServerEnv("SUPABASE_SECRET_KEY") ||
    readServerEnv("SUPABASE_KEY") ||
    readServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
    readServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    readServerEnv("SUPABASE_ANON_KEY") ||
    readServerEnv("VITE_SUPABASE_ANON_KEY");

  if (!key) return null;

  return createClient<Database>(diag.url, key, {
    global: {
      fetch: createSupabaseFetch(key),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseClientWithToken(
  accessToken: string,
): ReturnType<typeof createClient<Database>> | null {
  const diag = getSupabaseCloudDiagnostics();
  if (!diag.configured || !diag.url) return null;

  const key =
    readServerEnv("SUPABASE_KEY") ||
    readServerEnv("SUPABASE_PUBLISHABLE_KEY") ||
    readServerEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ||
    readServerEnv("SUPABASE_ANON_KEY") ||
    readServerEnv("VITE_SUPABASE_ANON_KEY") ||
    readServerEnv("SUPABASE_SERVICE_ROLE_KEY") ||
    readServerEnv("SUPABASE_SECRET_KEY");
  if (!key) return null;

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
