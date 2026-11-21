import { createFileRoute } from "@tanstack/react-router";
import {
  mockStore,
  INITIAL_GAMES,
  mergeAnimalImagesPreserveCustom,
  mergeResultsPreserveToday,
  isBaseOrDefaultCatalogImageUrl,
  filterAdminCustomAnimalImages,
  ensureCustomCatalogLoaded,
} from "@/lib/mock-db";
import {
  type ClientLicense,
  type AnimalImage,
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  parseAppSettingsFromSupabase,
  sanitizeAppSettingsForSupabase,
} from "@/lib/types";
import {
  getDefaultGameScheduleTimes,
  getGameScheduleTimes,
  normalizeScheduleTime,
} from "@/lib/game-schedules";
import fs from "fs";
import path from "path";
import {
  supabaseAdmin,
  createRealSupabaseAdminClient,
  createSupabaseClientWithToken,
  getSupabaseCloudDiagnostics,
  type SupabaseCloudDiagnostics,
} from "@/integrations/supabase/client.server";
import { ensureCloudflareEnvFromRequest } from "@/lib/cloudflare-env.server";
import { toSupabaseLicenseUuid, generateLicenseUuid, isValidUuid } from "@/lib/license-lotteries";
import { resolveCanonicalAnimal, parseCanonicalAnimalNumber } from "@/lib/official-animals";
import { getGameLogo, isBrokenExternalLogo, isCustomUploadedGameLogo } from "@/lib/game-logos";
import {
  TRIPLE_GAMES,
  buildTripleAlertItem,
  mergeTripleResultsPreserveToday,
  normalizeTripleDrawTime,
  normalizeTripleDrawTimeKey,
  type TripleResult,
} from "@/lib/triples";
import {
  areSameCanonicalGame,
  deduplicateGamesList,
  getGameSlugAliases,
  normalizeGameSlug,
} from "@/lib/game-slugs";
import { lotteryDate } from "@/lib/lottery-date";
import {
  consolidateGamesAndOrphanResultsInSupabase,
  consolidateInMemoryGamesAndResults,
  remapInMemoryStoreIds,
  type ConsolidationReport,
} from "@/lib/consolidate-games-results.server";
import persistedGameLogosJson from "../../../../../game_logos.persisted.json";
import persistedAnimalImagesJson from "../../../../../animal_images.persisted.json";
import persistedAppSettingsJson from "../../../../../app_settings.persisted.json";
import persistedClientLicensesJson from "../../../../../client_licenses.persisted.json";

const RESULTS_FILE = "/tmp/lottery_results.json";
const TRIPLE_RESULTS_FILE = "/tmp/lottery_triples_results.json";
const LATEST_ALERT_FILE = "/tmp/lottery_latest_alert.json";
const ANIMAL_IMAGES_FILE = "/tmp/lottery_animal_images.json";
const WORKSPACE_ANIMAL_IMAGES_FILE = path.join(process.cwd(), "animal_images.persisted.json");
const GAMES_FILE = "/tmp/lottery_games.json";
const WORKSPACE_GAMES_FILE = path.join(process.cwd(), "games.persisted.json");
const GAME_LOGOS_FILE = "/tmp/lottery_game_logos.json";
const WORKSPACE_GAME_LOGOS_FILE = path.join(process.cwd(), "game_logos.persisted.json");
const APP_SETTINGS_FILE = "/tmp/lottery_app_settings.json";
const WORKSPACE_APP_SETTINGS_FILE = path.join(process.cwd(), "app_settings.persisted.json");
const TMP_CLIENT_LICENSES_FILE = "/tmp/lottery_client_licenses_v2.json";
const WORKSPACE_CLIENT_LICENSES_FILE = path.join(process.cwd(), "client_licenses.persisted.json");

let serverTripleResults: TripleResult[] = [];
let serverDeletedTripleIds: string[] = [];
let serverDeletedTripleDate = "";
const serverCustomGameLogos: Record<string, string> = {};
let serverCustomGameLogosVersion = 1;
let serverGamesVersion = 1;
let serverAnimalImagesVersion = 1;
let serverAppSettingsVersion = 1;
let serverLicensesVersion = 1;
let serverLatestAlert: Record<string, unknown> | null = null;
let serverDataInitialized = false;
let initialAutoSyncDone = false;
let initialAnimalImagesSeeded = false;
let initialAppSettingsSeeded = false;
let initialClientLicensesSeeded = false;

function resetDeletedTriplesIfNewDay() {
  const today = lotteryDate();
  if (serverDeletedTripleDate !== today) {
    serverDeletedTripleDate = today;
    serverDeletedTripleIds = [];
  }
}

function applyIncomingTriplesToServer(incoming: TripleResult[], today = lotteryDate()): number {
  if (!Array.isArray(incoming) || incoming.length === 0) return 0;
  resetDeletedTriplesIfNewDay();
  const prevCount = serverTripleResults.filter((r) => r.draw_date === today).length;
  serverTripleResults = mergeTripleResultsPreserveToday(
    serverTripleResults,
    incoming,
    today,
    serverDeletedTripleIds,
  );
  saveServerTripleResults();
  const nextCount = serverTripleResults.filter((r) => r.draw_date === today).length;
  return Math.max(0, nextCount - prevCount);
}

function loadServerTripleResults() {
  try {
    if (fs.existsSync(TRIPLE_RESULTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRIPLE_RESULTS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        serverTripleResults = data;
      }
    }
  } catch {
    // ignore
  }
}

function saveServerTripleResults() {
  try {
    fs.writeFileSync(TRIPLE_RESULTS_FILE, JSON.stringify(serverTripleResults));
  } catch {
    // ignore
  }
}

interface ServerLicenseState {
  requireLicense: boolean;
  licenses: ClientLicense[];
  deletedIds?: string[];
  deletedPins?: string[];
}

let serverLicenseState: ServerLicenseState = {
  requireLicense: true,
  licenses: [
    {
      id: "lic-exito-carupano-310148",
      client_name: "EXITO CARUPANO",
      pin_code: "310148",
      status: "active",
      expires_at: "2026-12-05T01:38:00.000Z",
      max_devices: 1,
      bound_device_ids: [],
      notes: "",
      created_at: "2026-11-05T01:38:00.000Z",
    },
    {
      id: "lic-mariana-108271",
      client_name: "Mariana",
      pin_code: "108271",
      status: "active",
      expires_at: "2026-12-05T01:38:00.000Z",
      max_devices: 1,
      bound_device_ids: [],
      notes: "",
      created_at: "2026-11-05T01:38:00.000Z",
    },
    {
      id: "lic-jose-barreto-770595",
      client_name: "José barreto",
      pin_code: "770595",
      status: "active",
      expires_at: "2026-12-05T01:38:00.000Z",
      max_devices: 1,
      bound_device_ids: [],
      notes: "",
      created_at: "2026-11-05T01:38:00.000Z",
    },
    {
      id: "lic-master-admin",
      client_name: "Administrador Maestro",
      pin_code: "291007",
      status: "active",
      expires_at: new Date(Date.now() + 3650 * 86400000).toISOString(),
      max_devices: 999,
      bound_device_ids: [],
      notes: "PIN Maestro: 291007",
      created_at: new Date().toISOString(),
    },
  ],
  deletedIds: [],
  deletedPins: [],
};

function isWorkspaceLicensesFileActive(): boolean {
  try {
    return fs.existsSync(WORKSPACE_CLIENT_LICENSES_FILE);
  } catch {
    return false;
  }
}

function loadServerLicenses() {
  try {
    if (
      !initialClientLicensesSeeded &&
      persistedClientLicensesJson &&
      typeof persistedClientLicensesJson === "object"
    ) {
      initialClientLicensesSeeded = true;
      const bundled = persistedClientLicensesJson as Partial<ServerLicenseState>;
      if (Array.isArray(bundled.licenses) && bundled.licenses.length > 0) {
        serverLicenseState = {
          requireLicense:
            typeof bundled.requireLicense === "boolean" ? bundled.requireLicense : true,
          licenses: bundled.licenses.map((l) => ({
            ...l,
            status: l.status === "paused" ? "paused" : "active",
            bound_device_ids: Array.isArray(l.bound_device_ids) ? [...l.bound_device_ids] : [],
          })),
          deletedIds: Array.isArray(bundled.deletedIds) ? [...bundled.deletedIds] : [],
          deletedPins: Array.isArray(bundled.deletedPins) ? [...bundled.deletedPins] : [],
        };
      }
    }

    for (const file of [WORKSPACE_CLIENT_LICENSES_FILE, TMP_CLIENT_LICENSES_FILE]) {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (parsed && typeof parsed === "object") {
          serverLicenseState = {
            requireLicense: Boolean(parsed.requireLicense),
            licenses:
              Array.isArray(parsed.licenses) && parsed.licenses.length > 0
                ? parsed.licenses
                : serverLicenseState.licenses,
            deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
            deletedPins: Array.isArray(parsed.deletedPins) ? parsed.deletedPins : [],
          };
          break;
        }
      }
    }
    // Guarantee that master PIN 291007 is always active and present
    if (!serverLicenseState.licenses.some((l) => l.pin_code === "291007")) {
      serverLicenseState.licenses.push({
        id: "lic-master-admin",
        client_name: "Administrador Maestro",
        pin_code: "291007",
        status: "active",
        expires_at: new Date(Date.now() + 3650 * 86400000).toISOString(),
        max_devices: 999,
        bound_device_ids: [],
        notes: "PIN Maestro: 291007",
        created_at: new Date().toISOString(),
      });
      saveServerLicenses();
    }
  } catch {
    // ignore
  }
}

function saveServerLicenses() {
  try {
    serverLicensesVersion++;
    const serialized = JSON.stringify(serverLicenseState, null, 2);
    // Persist to workspace project file so it survives container restarts
    fs.writeFileSync(WORKSPACE_CLIENT_LICENSES_FILE, serialized);
  } catch {
    // ignore
  }
  try {
    // Also keep in tmp for fast reading
    fs.writeFileSync(TMP_CLIENT_LICENSES_FILE, JSON.stringify(serverLicenseState));
  } catch {
    // ignore
  }
}

const CLOUD_SYNC_TTL_MS = 3000;
const LOCAL_MUTATION_GRACE_MS = 8000;
let lastLicensesCloudSyncAt = 0;
let licensesCloudSyncPromise: Promise<void> | null = null;
const recentLocalLicenseMutations = new Map<string, number>();

function markLocalLicenseMutation(id: string) {
  recentLocalLicenseMutations.set(id, Date.now());
}

function isRecentLocalLicenseMutation(id: string): boolean {
  const ts = recentLocalLicenseMutations.get(id);
  if (!ts) return false;
  if (Date.now() - ts <= LOCAL_MUTATION_GRACE_MS) return true;
  recentLocalLicenseMutations.delete(id);
  return false;
}

function noStoreJson(payload: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return Response.json(payload, { ...init, headers });
}

function packMasterNotesWithRequire(requireLicense: boolean): string {
  return requireLicense ? "PIN Maestro: 291007" : "PIN Maestro: 291007||REQUIRE:0";
}

function parseRequireFromMasterNotes(notes?: string | null): boolean | null {
  if (!notes) return null;
  if (notes.includes("||REQUIRE:0")) return false;
  if (notes.includes("||REQUIRE:1")) return true;
  return null;
}

const SUPABASE_LICENSES_TABLE = "licenses" as const;
const SUPABASE_ANIMAL_IMAGES_BUCKET = "animal-images" as const;

interface DetailedSupabaseError {
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
  table?: string;
}

let lastCloudLicenseReadError: string | null = null;
let lastCloudLicenseReadErrorDetails: DetailedSupabaseError | null = null;

function safeIsoDate(value: unknown, fallback: string | null): string | null {
  if (!value) return fallback;
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function extractDetailedError(err: unknown, table?: string): DetailedSupabaseError {
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    const message =
      typeof rec["message"] === "string" && rec["message"].trim()
        ? rec["message"].trim()
        : err instanceof Error
          ? err.message
          : String(err);
    const code =
      typeof rec["code"] === "string" && rec["code"].trim()
        ? rec["code"].trim()
        : typeof rec["code"] === "number"
          ? String(rec["code"])
          : null;
    const details =
      typeof rec["details"] === "string" && rec["details"].trim() ? rec["details"].trim() : null;
    const hint = typeof rec["hint"] === "string" && rec["hint"].trim() ? rec["hint"].trim() : null;
    return {
      code,
      message,
      details,
      hint,
      ...(table ? { table } : {}),
    };
  }
  return {
    code: null,
    message: typeof err === "string" && err.trim() ? err.trim() : String(err),
    details: null,
    hint: null,
    ...(table ? { table } : {}),
  };
}

function parseDataUrlToBinary(dataUrl: string): {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
} | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return null;
  const contentType = match[1]!.toLowerCase();
  const base64Body = match[2]!.replace(/\s+/g, "");

  const extMap: Record<string, string> = {
    "image/webp": "webp",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };
  const ext = extMap[contentType] || "webp";

  try {
    const binary = atob(base64Body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, contentType, ext };
  } catch {
    return null;
  }
}

async function uploadAnimalImageToSupabaseStorage(
  gameId: string,
  animalNumber: number,
  imageUrl: string,
): Promise<{ url: string; uploadedToStorage: boolean; error?: string }> {
  const trimmed = imageUrl.trim();
  if (!trimmed.startsWith("data:image/")) {
    return { url: trimmed, uploadedToStorage: false };
  }

  const realClient = createRealSupabaseAdminClient();
  if (!realClient) {
    return { url: trimmed, uploadedToStorage: false };
  }

  const decoded = parseDataUrlToBinary(trimmed);
  if (!decoded) {
    return { url: trimmed, uploadedToStorage: false, error: "Formato DataURL de imagen inválido" };
  }

  const safeGameId = gameId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const storagePath = `animals/${safeGameId}/animal-${animalNumber}-${Date.now()}.${decoded.ext}`;

  try {
    const { error: uploadError } = await realClient.storage
      .from(SUPABASE_ANIMAL_IMAGES_BUCKET)
      .upload(storagePath, decoded.bytes, {
        contentType: decoded.contentType,
        upsert: true,
        cacheControl: "31536000",
      });

    if (uploadError) {
      console.warn("[supabase-storage-animal-image-warn]", uploadError.message);
      return {
        url: trimmed,
        uploadedToStorage: false,
        error: uploadError.message,
      };
    }

    const { data: pubData } = realClient.storage
      .from(SUPABASE_ANIMAL_IMAGES_BUCKET)
      .getPublicUrl(storagePath);

    if (
      pubData?.publicUrl &&
      (pubData.publicUrl.startsWith("http://") || pubData.publicUrl.startsWith("https://"))
    ) {
      return { url: pubData.publicUrl, uploadedToStorage: true };
    }

    return { url: trimmed, uploadedToStorage: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[supabase-storage-animal-image-warn]", message);
    return { url: trimmed, uploadedToStorage: false, error: message };
  }
}

async function removeAnimalImageFromSupabaseStorage(
  gameId: string,
  animalNumber: number,
  existingUrl?: string | null,
): Promise<void> {
  const realClient = createRealSupabaseAdminClient();
  if (!realClient) return;

  const pathsToRemove: string[] = [];
  if (existingUrl && existingUrl.includes(`/${SUPABASE_ANIMAL_IMAGES_BUCKET}/`)) {
    const extracted = existingUrl.split(`/${SUPABASE_ANIMAL_IMAGES_BUCKET}/`)[1]?.split("?")[0];
    if (extracted) {
      pathsToRemove.push(decodeURIComponent(extracted));
    }
  }
  const safeGameId = gameId.replace(/[^a-zA-Z0-9_-]/g, "_");
  pathsToRemove.push(`${safeGameId}/animal-${animalNumber}.png`);

  if (pathsToRemove.length > 0) {
    try {
      await realClient.storage.from(SUPABASE_ANIMAL_IMAGES_BUCKET).remove(pathsToRemove);
    } catch {
      // ignore storage cleanup errors
    }
  }
}

function formatSupabaseLicenseError(
  err:
    | {
        code?: string | null;
        message?: string | null;
        details?: string | null;
        hint?: string | null;
      }
    | string,
  diag?: SupabaseCloudDiagnostics,
): string {
  if (typeof err === "string") return err;
  const parts: string[] = [];
  if (err.code) parts.push(`code: ${err.code}`);
  parts.push(`message: ${err.message || "Error desconocido de Supabase"}`);
  if (err.details) parts.push(`details: ${err.details}`);
  if (err.hint) parts.push(`hint: ${err.hint}`);
  const full = parts.join(" | ");
  const lower = full.toLowerCase();
  if (
    err.code === "42501" ||
    lower.includes("row-level security") ||
    lower.includes("permission denied")
  ) {
    const keyHint =
      diag && !diag.hasServiceRoleKey
        ? " Configura SUPABASE_KEY (service_role/secret) en Cloudflare Pages o habilita las políticas RLS en la tabla licenses."
        : " Verifica los permisos y políticas RLS de la tabla licenses en Supabase.";
    return `${full} | ${keyHint.trim()}`;
  }
  return full;
}

async function upsertLicenseRowToSupabase(
  lic: ClientLicense,
  notesOverride?: string,
  authBearerToken?: string | null,
  options?: { isCreate?: boolean },
): Promise<{
  ok: boolean;
  error?: string;
  supabaseError?: DetailedSupabaseError;
  resolvedId?: string;
}> {
  const diag = getSupabaseCloudDiagnostics();
  if (diag.initError) {
    const initErrObj: DetailedSupabaseError = {
      code: "SUPABASE_CONFIG_ERROR",
      message: diag.initError,
      details: diag.url ? `SUPABASE_URL=${diag.url}` : null,
      hint: "Revisa SUPABASE_URL y SUPABASE_KEY en Cloudflare Pages → Settings → Environment Variables.",
      table: SUPABASE_LICENSES_TABLE,
    };
    console.error("[supabase-licenses-config-error]", initErrObj);
    return {
      ok: false,
      error: formatSupabaseLicenseError(initErrObj, diag),
      supabaseError: initErrObj,
    };
  }

  const realClient = createRealSupabaseAdminClient();

  if (!realClient) {
    // Safe local/memory fallback when Supabase is not configured (e.g. local Preview)
    return { ok: true, resolvedId: lic.id };
  }

  const sbId = toSupabaseLicenseUuid(lic.id, lic.pin_code);
  const payload = {
    id: sbId,
    client_name: lic.client_name,
    pin_code: lic.pin_code,
    status: lic.status,
    expires_at: lic.expires_at,
    max_devices: lic.max_devices,
    bound_device_ids: lic.bound_device_ids,
    notes: notesOverride !== undefined ? notesOverride : (lic.notes ?? ""),
    created_at: lic.created_at,
  };

  const runUpsert = async (
    client: NonNullable<typeof realClient>,
  ): Promise<{
    ok: boolean;
    error?: string;
    supabaseError?: DetailedSupabaseError;
    resolvedId?: string;
  }> => {
    try {
      let targetId = sbId;
      if (lic.pin_code) {
        const { data: existingByPin, error: selectErr } = await client
          .from(SUPABASE_LICENSES_TABLE)
          .select("id, client_name")
          .eq("pin_code", lic.pin_code)
          .maybeSingle();
        if (selectErr) {
          const detailed = extractDetailedError(selectErr, SUPABASE_LICENSES_TABLE);
          console.error("[supabase-licenses-select-error]", detailed);
          return {
            ok: false,
            error: formatSupabaseLicenseError(detailed, diag),
            supabaseError: detailed,
          };
        }
        if (
          existingByPin &&
          typeof existingByPin.id === "string" &&
          existingByPin.id.trim().length > 0
        ) {
          // On create, NEVER silently overwrite another existing client's row!
          if (options?.isCreate && existingByPin.id !== sbId) {
            const detailed: DetailedSupabaseError = {
              code: "23505",
              message: `El PIN ${lic.pin_code} ya está asignado a otro cliente en Supabase.`,
              details: `existing_id=${existingByPin.id}`,
              hint: "Genera un PIN único para esta licencia nueva para evitar sobrescribir a otro cliente.",
              table: SUPABASE_LICENSES_TABLE,
            };
            return {
              ok: false,
              error: formatSupabaseLicenseError(detailed, diag),
              supabaseError: detailed,
            };
          }
          // On update, only adopt existingByPin.id if the current ID is not already a distinct UUID row
          if (!isValidUuid(lic.id) || existingByPin.id === sbId) {
            targetId = existingByPin.id;
          }
        }
      }

      const { data: upsertedRows, error } = await client
        .from(SUPABASE_LICENSES_TABLE)
        .upsert({ ...payload, id: targetId }, { onConflict: "id" })
        .select("id");
      if (!error && Array.isArray(upsertedRows) && upsertedRows.length > 0) {
        return { ok: true, resolvedId: upsertedRows[0]?.id || targetId };
      }

      if (!error && (!upsertedRows || upsertedRows.length === 0)) {
        const detailed: DetailedSupabaseError = {
          code: "42501",
          message: `Supabase no confirmó filas guardadas en ${SUPABASE_LICENSES_TABLE}`,
          details: "upsert().select('id') retornó 0 filas",
          hint: "Verifica RLS o permisos de escritura para SUPABASE_KEY en la tabla licenses",
          table: SUPABASE_LICENSES_TABLE,
        };
        console.error("[supabase-licenses-empty-upsert-error]", detailed);
        return {
          ok: false,
          error: formatSupabaseLicenseError(detailed, diag),
          supabaseError: detailed,
        };
      }

      if ((error?.code === "22P02" || error?.code === "23505") && lic.pin_code) {
        const { data: updatedRows, error: updateErr } = await client
          .from(SUPABASE_LICENSES_TABLE)
          .update({
            client_name: payload.client_name,
            status: payload.status,
            expires_at: payload.expires_at,
            max_devices: payload.max_devices,
            bound_device_ids: payload.bound_device_ids,
            notes: payload.notes,
          })
          .eq("pin_code", lic.pin_code)
          .select("id");
        if (!updateErr && Array.isArray(updatedRows) && updatedRows.length > 0) {
          return { ok: true, resolvedId: updatedRows[0]?.id || targetId };
        }
        if (updateErr) {
          const detailed = extractDetailedError(updateErr, SUPABASE_LICENSES_TABLE);
          console.error("[supabase-licenses-update-error]", detailed);
          return {
            ok: false,
            error: formatSupabaseLicenseError(detailed, diag),
            supabaseError: detailed,
          };
        }
      }
      const detailed = extractDetailedError(error || "Error al guardar", SUPABASE_LICENSES_TABLE);
      console.error("[supabase-licenses-upsert-error]", detailed);
      return {
        ok: false,
        error: formatSupabaseLicenseError(detailed, diag),
        supabaseError: detailed,
      };
    } catch (err) {
      const detailed = extractDetailedError(err, SUPABASE_LICENSES_TABLE);
      console.error("[supabase-licenses-upsert-exception]", detailed);
      return {
        ok: false,
        error: formatSupabaseLicenseError(detailed, diag),
        supabaseError: detailed,
      };
    }
  };

  let res = await runUpsert(realClient);
  if (!res.ok && authBearerToken) {
    const authClient = createSupabaseClientWithToken(authBearerToken);
    if (authClient) {
      const authRes = await runUpsert(authClient);
      if (authRes.ok || authRes.error) {
        res = authRes;
      }
    }
  }

  if (!res.ok) {
    console.error("[supabase-license-upsert-failed]", res.supabaseError || res.error);
  }
  return res;
}

async function deleteLicenseRowFromSupabase(
  id: string,
  pinCode?: string | null,
  authBearerToken?: string | null,
): Promise<{ ok: boolean; error?: string; supabaseError?: DetailedSupabaseError }> {
  const diag = getSupabaseCloudDiagnostics();
  if (diag.initError) {
    const initErrObj: DetailedSupabaseError = {
      code: "SUPABASE_CONFIG_ERROR",
      message: diag.initError,
      details: diag.url ? `SUPABASE_URL=${diag.url}` : null,
      hint: "Revisa SUPABASE_URL y SUPABASE_KEY en Cloudflare Pages.",
      table: SUPABASE_LICENSES_TABLE,
    };
    return {
      ok: false,
      error: formatSupabaseLicenseError(initErrObj, diag),
      supabaseError: initErrObj,
    };
  }

  const realClient = createRealSupabaseAdminClient();

  if (!realClient) {
    return { ok: true };
  }

  const sbId = toSupabaseLicenseUuid(id, pinCode);
  const runDelete = async (
    client: NonNullable<typeof realClient>,
  ): Promise<{ ok: boolean; error?: string; supabaseError?: DetailedSupabaseError }> => {
    try {
      const targetIds = Array.from(
        new Set([isValidUuid(id) ? id : null, isValidUuid(sbId) ? sbId : null].filter(Boolean)),
      ) as string[];
      for (const tid of targetIds) {
        const { error } = await client.from(SUPABASE_LICENSES_TABLE).delete().eq("id", tid);
        if (error) {
          const detailed = extractDetailedError(error, SUPABASE_LICENSES_TABLE);
          console.error("[supabase-licenses-delete-error]", detailed);
          return {
            ok: false,
            error: formatSupabaseLicenseError(detailed, diag),
            supabaseError: detailed,
          };
        }
      }
      if (pinCode) {
        const { error } = await client
          .from(SUPABASE_LICENSES_TABLE)
          .delete()
          .eq("pin_code", pinCode);
        if (error) {
          const detailed = extractDetailedError(error, SUPABASE_LICENSES_TABLE);
          console.error("[supabase-licenses-delete-pin-error]", detailed);
          return {
            ok: false,
            error: formatSupabaseLicenseError(detailed, diag),
            supabaseError: detailed,
          };
        }
      }
      return { ok: true };
    } catch (err) {
      const detailed = extractDetailedError(err, SUPABASE_LICENSES_TABLE);
      console.error("[supabase-licenses-delete-exception]", detailed);
      return {
        ok: false,
        error: formatSupabaseLicenseError(detailed, diag),
        supabaseError: detailed,
      };
    }
  };

  let res = await runDelete(realClient);
  if (!res.ok && authBearerToken) {
    const authClient = createSupabaseClientWithToken(authBearerToken);
    if (authClient) {
      const authRes = await runDelete(authClient);
      if (authRes.ok || authRes.error) {
        res = authRes;
      }
    }
  }

  return res;
}

async function syncLicensesWithSupabase(force = false): Promise<void> {
  const now = Date.now();
  if (!force && licensesCloudSyncPromise) {
    return licensesCloudSyncPromise;
  }
  if (!force && now - lastLicensesCloudSyncAt < CLOUD_SYNC_TTL_MS) {
    return;
  }

  const run = (async () => {
    try {
      const diag = getSupabaseCloudDiagnostics();
      if (diag.initError) {
        const detailed: DetailedSupabaseError = {
          code: "SUPABASE_CONFIG_ERROR",
          message: diag.initError,
          details: diag.url ? `SUPABASE_URL=${diag.url}` : null,
          hint: "Revisa SUPABASE_URL y SUPABASE_KEY en Cloudflare Pages.",
          table: SUPABASE_LICENSES_TABLE,
        };
        lastCloudLicenseReadError = formatSupabaseLicenseError(detailed, diag);
        lastCloudLicenseReadErrorDetails = detailed;
        return;
      }

      const realClient = createRealSupabaseAdminClient();

      if (!realClient) {
        lastCloudLicenseReadError = null;
        lastCloudLicenseReadErrorDetails = null;
        return;
      }

      const { data, error } = await realClient.from(SUPABASE_LICENSES_TABLE).select("*");
      if (error) {
        const detailed = extractDetailedError(error, SUPABASE_LICENSES_TABLE);
        console.error("[supabase-licenses-read-error]", detailed);
        lastCloudLicenseReadError = formatSupabaseLicenseError(detailed, diag);
        lastCloudLicenseReadErrorDetails = detailed;
        return;
      }
      if (Array.isArray(data)) {
        lastCloudLicenseReadError = null;
        lastCloudLicenseReadErrorDetails = null;
        lastLicensesCloudSyncAt = Date.now();
        const mapped: ClientLicense[] = data.map((d: Record<string, unknown>) => ({
          id: String(d["id"]),
          client_name: String(d["client_name"] || "Cliente"),
          pin_code: String(d["pin_code"] || ""),
          status: d["status"] === "paused" ? "paused" : "active",
          expires_at: safeIsoDate(d["expires_at"], null),
          max_devices: Number(d["max_devices"]) || 1,
          bound_device_ids: Array.isArray(d["bound_device_ids"])
            ? (d["bound_device_ids"] as string[])
            : [],
          notes: typeof d["notes"] === "string" ? d["notes"] : "",
          created_at: safeIsoDate(d["created_at"], new Date().toISOString()) as string,
        }));

        const deletedSet = new Set<string>(serverLicenseState.deletedIds || []);
        const deletedPinSet = new Set<string>(serverLicenseState.deletedPins || []);
        const mergedMap = new Map<string, ClientLicense>();
        const seenPins = new Set<string>();
        const localById = new Map<string, ClientLicense>();
        for (const lic of serverLicenseState.licenses) {
          localById.set(lic.id, lic);
        }

        if (mapped.length > 0) {
          for (const sLic of mapped) {
            if (deletedSet.has(sLic.id) || deletedPinSet.has(sLic.pin_code)) {
              if (isRecentLocalLicenseMutation(sLic.id)) {
                await deleteLicenseRowFromSupabase(sLic.id, sLic.pin_code);
                continue;
              }
            }

            if (sLic.id === "lic-master-admin" || sLic.pin_code === "291007") {
              if (!isRecentLocalLicenseMutation("require-license-toggle")) {
                const parsedReq = parseRequireFromMasterNotes(sLic.notes);
                if (parsedReq !== null) {
                  serverLicenseState.requireLicense = parsedReq;
                }
              }
            }

            const existing =
              localById.get(sLic.id) ||
              serverLicenseState.licenses.find((l) => l.pin_code === sLic.pin_code);

            if (
              existing &&
              (isRecentLocalLicenseMutation(existing.id) || isRecentLocalLicenseMutation(sLic.id))
            ) {
              const mergedLic: ClientLicense = {
                ...sLic,
                ...existing,
                id: sLic.id,
                bound_device_ids: Array.from(
                  new Set([...existing.bound_device_ids, ...sLic.bound_device_ids]),
                ),
              };
              mergedMap.set(mergedLic.id, mergedLic);
              if (mergedLic.pin_code) seenPins.add(mergedLic.pin_code);
            } else {
              mergedMap.set(sLic.id, sLic);
              if (sLic.pin_code) seenPins.add(sLic.pin_code);
            }
          }

          for (const lic of serverLicenseState.licenses) {
            if (
              !mergedMap.has(lic.id) &&
              !(lic.pin_code && seenPins.has(lic.pin_code)) &&
              !deletedSet.has(lic.id) &&
              !deletedPinSet.has(lic.pin_code) &&
              isRecentLocalLicenseMutation(lic.id)
            ) {
              mergedMap.set(lic.id, lic);
              if (lic.pin_code) seenPins.add(lic.pin_code);
            }
          }
        } else {
          for (const lic of serverLicenseState.licenses) {
            if (
              !deletedSet.has(lic.id) &&
              !deletedPinSet.has(lic.pin_code) &&
              !(lic.pin_code && seenPins.has(lic.pin_code))
            ) {
              const normalizedLic = { ...lic, id: toSupabaseLicenseUuid(lic.id, lic.pin_code) };
              mergedMap.set(normalizedLic.id, normalizedLic);
              if (normalizedLic.pin_code) seenPins.add(normalizedLic.pin_code);
            }
          }
        }

        if (!Array.from(mergedMap.values()).some((l) => l.pin_code === "291007")) {
          const masterLic: ClientLicense = {
            id: toSupabaseLicenseUuid("lic-master-admin", "291007"),
            client_name: "Administrador Maestro",
            pin_code: "291007",
            status: "active",
            expires_at: new Date(Date.now() + 3650 * 86400000).toISOString(),
            max_devices: 999,
            bound_device_ids: [],
            notes: packMasterNotesWithRequire(serverLicenseState.requireLicense),
            created_at: new Date().toISOString(),
          };
          mergedMap.set(masterLic.id, masterLic);
          await upsertLicenseRowToSupabase(masterLic);
        }

        if (mapped.length === 0) {
          for (const lic of Array.from(mergedMap.values())) {
            await upsertLicenseRowToSupabase(lic);
          }
        }

        const nextLicenses = Array.from(mergedMap.values()).map((l) =>
          l.id === "lic-master-admin" || l.pin_code === "291007"
            ? {
                ...l,
                notes: l.notes?.replace(/\|\|REQUIRE:[01]/g, "").trim() || "PIN Maestro: 291007",
              }
            : l,
        );
        serverLicenseState.licenses = nextLicenses;
        saveServerLicenses();
      }
    } catch (err) {
      const detailed = extractDetailedError(err, SUPABASE_LICENSES_TABLE);
      console.error("[supabase-licenses-sync-exception]", detailed);
      lastCloudLicenseReadError = formatSupabaseLicenseError(detailed);
      lastCloudLicenseReadErrorDetails = detailed;
    } finally {
      licensesCloudSyncPromise = null;
    }
  })();

  licensesCloudSyncPromise = run;
  return run;
}

function sanitizeResultsList(results: unknown[]): typeof mockStore.results {
  if (!Array.isArray(results)) return [];
  return results.filter((r) => {
    if (!r || typeof r !== "object") return false;
    const res = r as { game_id?: string; draw_time?: string };
    if (!res.game_id || !res.draw_time) return false;
    const game = mockStore.games.find((g) => g.id === res.game_id);
    if (!game) return true;
    const validSchedule = new Set(
      getGameScheduleTimes(game).map((t) => normalizeScheduleTime(t) ?? t),
    );
    const normDraw = normalizeScheduleTime(res.draw_time) ?? res.draw_time;
    return validSchedule.has(normDraw);
  });
}

function loadServerResults() {
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        mockStore.results = sanitizeResultsList(data);
        if (mockStore.results.length !== data.length) {
          fs.writeFileSync(RESULTS_FILE, JSON.stringify(mockStore.results));
        }
      }
    }
  } catch {
    // ignore
  }
}

function saveServerResults() {
  try {
    mockStore.results = sanitizeResultsList(mockStore.results);
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(mockStore.results));
  } catch {
    // ignore
  }
}

function loadServerAnimalImages() {
  try {
    let persistedWorkspace: AnimalImage[] = [];
    let persistedTmp: AnimalImage[] = [];
    let hadRedundantOrBrokenRefs = false;

    if (!initialAnimalImagesSeeded && Array.isArray(persistedAnimalImagesJson)) {
      initialAnimalImagesSeeded = true;
      persistedWorkspace = filterAdminCustomAnimalImages(
        persistedAnimalImagesJson as AnimalImage[],
      );
    }

    if (fs.existsSync(WORKSPACE_ANIMAL_IMAGES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(WORKSPACE_ANIMAL_IMAGES_FILE, "utf-8"));
      if (Array.isArray(parsed)) {
        hadRedundantOrBrokenRefs = parsed.some(
          (img: AnimalImage) =>
            typeof img?.image_url === "string" && isBaseOrDefaultCatalogImageUrl(img.image_url),
        );
        persistedWorkspace = filterAdminCustomAnimalImages(parsed);
      }
    }
    if (fs.existsSync(ANIMAL_IMAGES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ANIMAL_IMAGES_FILE, "utf-8"));
      if (Array.isArray(parsed)) {
        if (
          parsed.some(
            (img: AnimalImage) =>
              typeof img?.image_url === "string" && isBaseOrDefaultCatalogImageUrl(img.image_url),
          )
        ) {
          hadRedundantOrBrokenRefs = true;
        }
        persistedTmp = filterAdminCustomAnimalImages(parsed);
      }
    }

    if (persistedWorkspace.length > 0 || persistedTmp.length > 0 || hadRedundantOrBrokenRefs) {
      mockStore.animal_images = mergeAnimalImagesPreserveCustom(
        mockStore.animal_images,
        persistedTmp,
        persistedWorkspace,
      );
      if (hadRedundantOrBrokenRefs) {
        saveServerAnimalImages();
      }
    }
  } catch {
    // ignore
  }
}

function saveServerAnimalImages() {
  serverAnimalImagesVersion++;
  const customOnly = filterAdminCustomAnimalImages(mockStore.animal_images);
  try {
    fs.writeFileSync(WORKSPACE_ANIMAL_IMAGES_FILE, JSON.stringify(customOnly, null, 2));
  } catch {
    // ignore
  }
  try {
    fs.writeFileSync(ANIMAL_IMAGES_FILE, JSON.stringify(customOnly));
  } catch {
    // ignore
  }
}

async function syncAnimalImagesWithSupabase() {
  try {
    const realClient = createRealSupabaseAdminClient();
    if (!realClient) return;
    await ensureCustomCatalogLoaded();
    const { data, error } = await realClient.from("animal_images").select("*");
    if (!error && Array.isArray(data)) {
      const cloudCustom: AnimalImage[] = [];
      for (const row of data as Array<Record<string, unknown>>) {
        const gameId = String(row["game_id"] || "");
        const animalNumber = Number(row["animal_number"]);
        const imageUrl = String(row["image_url"] || "");
        if (!gameId || !Number.isFinite(animalNumber) || !imageUrl) continue;
        if (isBaseOrDefaultCatalogImageUrl(imageUrl)) continue;
        cloudCustom.push({
          id: String(row["id"] || `img-${gameId}-${animalNumber}`),
          game_id: gameId,
          animal_number: animalNumber,
          image_url: imageUrl,
        });
      }

      if (cloudCustom.length > 0) {
        mockStore.animal_images = mergeAnimalImagesPreserveCustom(
          mockStore.animal_images,
          cloudCustom,
        );
        saveServerAnimalImages();
      }

      const localCustom = filterAdminCustomAnimalImages(mockStore.animal_images);
      for (const item of localCustom) {
        const existsInCloud = cloudCustom.some(
          (c) =>
            c.game_id === item.game_id &&
            c.animal_number === item.animal_number &&
            c.image_url === item.image_url,
        );
        if (!existsInCloud) {
          let urlToSave = item.image_url;
          if (urlToSave.startsWith("data:image/")) {
            const uploaded = await uploadAnimalImageToSupabaseStorage(
              item.game_id,
              item.animal_number,
              urlToSave,
            );
            urlToSave = uploaded.url;
          }
          await realClient
            .from("animal_images")
            .upsert(
              {
                game_id: item.game_id,
                animal_number: item.animal_number,
                image_url: urlToSave,
              },
              { onConflict: "game_id,animal_number" },
            )
            .catch(() => {});
        }
      }
    }
  } catch {
    // ignore if table is unavailable
  }
}

function loadServerGameLogos() {
  try {
    if (persistedGameLogosJson && typeof persistedGameLogosJson === "object") {
      for (const [k, v] of Object.entries(persistedGameLogosJson as Record<string, unknown>)) {
        if (typeof v === "string" && isCustomUploadedGameLogo(v)) {
          serverCustomGameLogos[k.trim().toLowerCase()] = v;
        }
      }
    }
    for (const f of [WORKSPACE_GAME_LOGOS_FILE, GAME_LOGOS_FILE]) {
      if (fs.existsSync(f)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(f, "utf-8"));
          if (parsed && typeof parsed === "object") {
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === "string" && isCustomUploadedGameLogo(v)) {
                serverCustomGameLogos[k.trim().toLowerCase()] = v;
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

function saveServerGameLogos() {
  try {
    serverCustomGameLogosVersion++;
    const json = JSON.stringify(serverCustomGameLogos, null, 2);
    fs.writeFileSync(WORKSPACE_GAME_LOGOS_FILE, json);
    fs.writeFileSync(GAME_LOGOS_FILE, json);
  } catch {
    // ignore
  }
}

function loadServerGames() {
  try {
    loadServerGameLogos();
    let rawData: unknown = null;
    for (const f of [WORKSPACE_GAMES_FILE, GAMES_FILE]) {
      if (fs.existsSync(f)) {
        try {
          rawData = JSON.parse(fs.readFileSync(f, "utf-8"));
          if (Array.isArray(rawData) && rawData.length > 0) break;
        } catch {
          // ignore
        }
      }
    }
    let logosUpdated = false;
    if (Array.isArray(rawData) && rawData.length > 0) {
      for (const savedGame of rawData) {
        if (!savedGame || typeof savedGame !== "object") continue;
        const canonicalSlug = normalizeGameSlug(savedGame.slug || savedGame.id, savedGame.name);
        const normalizedSavedGame = {
          ...savedGame,
          slug: canonicalSlug || savedGame.slug,
        };

        if (isCustomUploadedGameLogo(savedGame.logo_url)) {
          const idKey = savedGame.id ? String(savedGame.id).trim().toLowerCase() : "";
          const aliasKeys = getGameSlugAliases(canonicalSlug || savedGame.slug);
          if (idKey && serverCustomGameLogos[idKey] !== savedGame.logo_url) {
            serverCustomGameLogos[idKey] = savedGame.logo_url;
            logosUpdated = true;
          }
          for (const aliasKey of aliasKeys) {
            if (aliasKey && serverCustomGameLogos[aliasKey] !== savedGame.logo_url) {
              serverCustomGameLogos[aliasKey] = savedGame.logo_url;
              logosUpdated = true;
            }
          }
        }

        const idx = mockStore.games.findIndex((g) => areSameCanonicalGame(g, normalizedSavedGame));
        if (idx >= 0) {
          const existing = mockStore.games[idx];
          const defaultSchedule = getDefaultGameScheduleTimes(
            canonicalSlug || existing?.slug || savedGame?.slug || "",
          );
          const preservedLogo = isCustomUploadedGameLogo(savedGame.logo_url)
            ? savedGame.logo_url
            : isCustomUploadedGameLogo(existing?.logo_url)
              ? existing!.logo_url
              : (savedGame.logo_url ?? existing?.logo_url ?? null);

          mockStore.games[idx] = {
            ...existing,
            ...normalizedSavedGame,
            slug: canonicalSlug || existing?.slug || savedGame.slug,
            logo_url: preservedLogo,
            schedule_times:
              Array.isArray(savedGame.schedule_times) && savedGame.schedule_times.length > 0
                ? savedGame.schedule_times
                : (existing?.schedule_times ?? defaultSchedule),
          };
        } else {
          const defaultSchedule = getDefaultGameScheduleTimes(
            canonicalSlug || savedGame?.slug || "",
          );
          mockStore.games.push({
            ...normalizedSavedGame,
            slug: canonicalSlug || savedGame.slug,
            schedule_times:
              Array.isArray(savedGame.schedule_times) && savedGame.schedule_times.length > 0
                ? savedGame.schedule_times
                : defaultSchedule,
          });
        }
      }
    }
    if (logosUpdated) {
      saveServerGameLogos();
    }
    // Ensure all catalog games from INITIAL_GAMES are present without duplicating canonical slugs
    for (const initGame of INITIAL_GAMES) {
      if (!mockStore.games.some((g) => areSameCanonicalGame(g, initGame))) {
        mockStore.games.push({
          ...initGame,
          slug: normalizeGameSlug(initGame.slug, initGame.name),
        });
      }
    }

    // Strictly deduplicate mockStore.games by canonical slug and remap any in-memory references
    consolidateInMemoryGamesAndResults();

    // Apply custom game logos from serverCustomGameLogos, clean broken external logos, and migrate legacy La Ricachona schedule
    let needsSave = false;
    for (const g of mockStore.games) {
      const canonicalSlug = normalizeGameSlug(g.slug, g.name);
      if (canonicalSlug && g.slug !== canonicalSlug) {
        g.slug = canonicalSlug;
        needsSave = true;
      }
      const idKey = (g.id || "").trim().toLowerCase();
      const aliasKeys = getGameSlugAliases(g.slug);
      let customLogo = serverCustomGameLogos[idKey];
      if (!customLogo) {
        for (const ak of aliasKeys) {
          if (serverCustomGameLogos[ak]) {
            customLogo = serverCustomGameLogos[ak];
            break;
          }
        }
      }
      if (customLogo && isCustomUploadedGameLogo(customLogo)) {
        if (g.logo_url !== customLogo) {
          g.logo_url = customLogo;
          needsSave = true;
        }
      } else if (isBrokenExternalLogo(g.logo_url)) {
        g.logo_url = getGameLogo(g, g.color);
        needsSave = true;
      }
      if (
        (g.slug === "la-ricachona" || g.id === "3b92f700-0000-4000-8000-000000000011") &&
        Array.isArray(g.schedule_times) &&
        g.schedule_times.every((t) => String(t).endsWith(":00"))
      ) {
        g.schedule_times = getDefaultGameScheduleTimes("la-ricachona");
        needsSave = true;
      }
    }
    if (needsSave) {
      saveServerGames();
    }
  } catch {
    // ignore
  }
}

function saveServerGames() {
  try {
    serverGamesVersion++;
    for (const g of mockStore.games) {
      if (isCustomUploadedGameLogo(g.logo_url)) {
        if (g.id) serverCustomGameLogos[g.id.trim().toLowerCase()] = g.logo_url;
        if (g.slug) serverCustomGameLogos[g.slug.trim().toLowerCase()] = g.logo_url;
      }
    }
    saveServerGameLogos();
    const json = JSON.stringify(mockStore.games, null, 2);
    fs.writeFileSync(GAMES_FILE, json);
    fs.writeFileSync(WORKSPACE_GAMES_FILE, json);
  } catch {
    // ignore
  }
}

let lastGamesCloudSyncAt = 0;
let gamesCloudSyncPromise: Promise<void> | null = null;
const recentLocalGameMutations = new Map<string, number>();

function markLocalGameMutation(id: string) {
  recentLocalGameMutations.set(id, Date.now());
}

function isRecentLocalGameMutation(id: string): boolean {
  const ts = recentLocalGameMutations.get(id);
  if (!ts) return false;
  if (Date.now() - ts <= LOCAL_MUTATION_GRACE_MS) return true;
  recentLocalGameMutations.delete(id);
  return false;
}

let lastCloudConsolidationAt = 0;
const CLOUD_CONSOLIDATION_TTL_MS = 10 * 60_000;
let lastResultsCloudSyncAt = 0;
let resultsCloudSyncPromise: Promise<void> | null = null;

async function syncGamesWithSupabase(force = false): Promise<void> {
  const now = Date.now();
  if (!force && gamesCloudSyncPromise) {
    return gamesCloudSyncPromise;
  }
  if (!force && now - lastGamesCloudSyncAt < CLOUD_SYNC_TTL_MS) {
    return;
  }

  const run = (async () => {
    try {
      loadServerGames();
      const realClient = createRealSupabaseAdminClient();
      if (!realClient) return;

      const { data, error } = await realClient
        .from("games")
        .select("*")
        .order("display_order", { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        lastGamesCloudSyncAt = Date.now();
        let changed = false;
        const preferredCloudIds = new Set<string>();
        const idRemap = new Map<string, string>();
        const seenCloudCanonicalSlugs = new Set<string>();
        let detectedCloudDuplicatesOrNonCanonical = false;

        // Ordenar filas de Supabase dando prioridad a las que ya tienen slug canónico y están activas
        const rows = [...(data as Array<Record<string, unknown>>)].sort((a, b) => {
          const slugA = String(a["slug"] || "").trim();
          const slugB = String(b["slug"] || "").trim();
          const canonA = normalizeGameSlug(slugA, String(a["name"] || ""));
          const canonB = normalizeGameSlug(slugB, String(b["name"] || ""));
          const exactA = slugA === canonA ? 0 : 1;
          const exactB = slugB === canonB ? 0 : 1;
          if (exactA !== exactB) return exactA - exactB;
          const activeA = a["is_active"] !== false ? 0 : 1;
          const activeB = b["is_active"] !== false ? 0 : 1;
          if (activeA !== activeB) return activeA - activeB;
          return (Number(a["display_order"]) || 99) - (Number(b["display_order"]) || 99);
        });

        for (const row of rows) {
          const id = String(row["id"] || "").trim();
          const rawSlug = String(row["slug"] || "").trim();
          const rawName = String(row["name"] || "").trim();
          if (!id && !rawSlug) continue;

          const canonicalSlug = normalizeGameSlug(rawSlug || id, rawName);
          if (!canonicalSlug) continue;

          if (rawSlug && rawSlug !== canonicalSlug) {
            detectedCloudDuplicatesOrNonCanonical = true;
          }
          if (seenCloudCanonicalSlugs.has(canonicalSlug)) {
            // Fila duplicada en Supabase para la misma lotería canónica: mapear su ID al ganador oficial
            detectedCloudDuplicatesOrNonCanonical = true;
            const officialWinner = mockStore.games.find(
              (g) => normalizeGameSlug(g.slug, g.name) === canonicalSlug,
            );
            if (officialWinner && id && id !== officialWinner.id) {
              idRemap.set(id, officialWinner.id);
            }
            continue;
          }
          seenCloudCanonicalSlugs.add(canonicalSlug);
          if (id) preferredCloudIds.add(id);

          const logoUrl = typeof row["logo_url"] === "string" ? row["logo_url"] : null;
          if (logoUrl && isCustomUploadedGameLogo(logoUrl)) {
            if (id && serverCustomGameLogos[id.toLowerCase()] !== logoUrl) {
              serverCustomGameLogos[id.toLowerCase()] = logoUrl;
              changed = true;
            }
            for (const aliasKey of getGameSlugAliases(canonicalSlug)) {
              if (aliasKey && serverCustomGameLogos[aliasKey] !== logoUrl) {
                serverCustomGameLogos[aliasKey] = logoUrl;
                changed = true;
              }
            }
          }

          const gameObj = mockStore.games.find(
            (g) => g.id === id || normalizeGameSlug(g.slug, g.name) === canonicalSlug,
          );
          if (gameObj) {
            // CRÍTICO: Adoptar el UUID real de Supabase como game.id oficial para que games[] y results[] coincidan 100%
            if (id && gameObj.id !== id) {
              idRemap.set(gameObj.id, id);
              gameObj.id = id;
              changed = true;
            }
            if (gameObj.slug !== canonicalSlug) {
              gameObj.slug = canonicalSlug;
              changed = true;
            }
            if (isRecentLocalGameMutation(gameObj.id)) {
              continue;
            }
            if (typeof row["is_active"] === "boolean" && gameObj.is_active !== row["is_active"]) {
              gameObj.is_active = row["is_active"];
              changed = true;
            }
            if (
              typeof row["display_order"] === "number" &&
              gameObj.display_order !== row["display_order"]
            ) {
              gameObj.display_order = row["display_order"];
              changed = true;
            }
            if (
              typeof row["color"] === "string" &&
              row["color"] &&
              gameObj.color !== row["color"]
            ) {
              gameObj.color = row["color"];
              changed = true;
            }
            if (rawName && gameObj.name !== rawName) {
              gameObj.name = rawName;
              changed = true;
            }
            if (
              typeof row["loading_mode"] === "string" &&
              (row["loading_mode"] === "manual" || row["loading_mode"] === "automatic") &&
              gameObj.loading_mode !== row["loading_mode"]
            ) {
              gameObj.loading_mode = row["loading_mode"];
              gameObj.mode = row["loading_mode"];
              changed = true;
            }
            if (
              Array.isArray(row["schedule_times"]) &&
              row["schedule_times"].length > 0 &&
              JSON.stringify(gameObj.schedule_times) !== JSON.stringify(row["schedule_times"])
            ) {
              gameObj.schedule_times = row["schedule_times"] as string[];
              changed = true;
            }
            if (logoUrl && isCustomUploadedGameLogo(logoUrl) && gameObj.logo_url !== logoUrl) {
              gameObj.logo_url = logoUrl;
              changed = true;
            }
          } else if (id) {
            const newMode =
              row["loading_mode"] === "manual" ? ("manual" as const) : ("automatic" as const);
            const resolvedLogo =
              logoUrl && isCustomUploadedGameLogo(logoUrl)
                ? logoUrl
                : getGameLogo(
                    {
                      id,
                      slug: canonicalSlug,
                      name: rawName || canonicalSlug || "JUEGO",
                      color: typeof row["color"] === "string" ? row["color"] : "#1a56db",
                    },
                    typeof row["color"] === "string" ? row["color"] : "#1a56db",
                  );
            mockStore.games.push({
              id,
              name: rawName || "JUEGO",
              slug: canonicalSlug,
              color: typeof row["color"] === "string" ? row["color"] : "#1a56db",
              logo_url: resolvedLogo,
              display_order:
                typeof row["display_order"] === "number"
                  ? row["display_order"]
                  : mockStore.games.length + 1,
              is_active: typeof row["is_active"] === "boolean" ? row["is_active"] : true,
              loading_mode: newMode,
              mode: newMode,
              schedule_times: Array.isArray(row["schedule_times"])
                ? (row["schedule_times"] as string[])
                : getDefaultGameScheduleTimes(canonicalSlug),
              created_at:
                typeof row["created_at"] === "string"
                  ? row["created_at"]
                  : new Date().toISOString(),
            });
            changed = true;
          }
        }

        // Deduplicación estricta final y remapeo de resultados/imágenes/entradas en memoria
        const { games: dedupedGames, idRemap: dedupRemap } = deduplicateGamesList(mockStore.games, {
          preferredCloudIds,
          isCustomLogo: isCustomUploadedGameLogo,
        });
        for (const [k, v] of dedupRemap.entries()) {
          idRemap.set(k, v);
        }
        if (dedupedGames.length !== mockStore.games.length || idRemap.size > 0) {
          changed = true;
        }
        mockStore.games = dedupedGames;
        const gamesById = new Map(mockStore.games.map((g) => [g.id, g]));
        const remappedResultsCount = remapInMemoryStoreIds(idRemap, gamesById);
        if (remappedResultsCount > 0) {
          saveServerResults();
        }
        if (changed) {
          saveServerGames();
        }

        // Si Supabase tiene duplicados o slugs sin normalizar, consolidarlos en background (con throttle)
        if (
          detectedCloudDuplicatesOrNonCanonical &&
          Date.now() - lastCloudConsolidationAt >= CLOUD_CONSOLIDATION_TTL_MS
        ) {
          lastCloudConsolidationAt = Date.now();
          void consolidateGamesAndOrphanResultsInSupabase(realClient, {
            onlyDate: lotteryDate(),
          }).catch(() => {});
        }
      }
    } catch {
      // ignore
    } finally {
      gamesCloudSyncPromise = null;
    }
  })();

  gamesCloudSyncPromise = run;
  return run;
}

async function syncResultsWithSupabase(force = false): Promise<void> {
  const now = Date.now();
  if (!force && resultsCloudSyncPromise) {
    return resultsCloudSyncPromise;
  }
  if (!force && now - lastResultsCloudSyncAt < CLOUD_SYNC_TTL_MS) {
    return;
  }

  const run = (async () => {
    try {
      const realClient = createRealSupabaseAdminClient();
      if (!realClient) return;

      const today = lotteryDate();
      const { data, error } = await realClient.from("results").select("*").eq("draw_date", today);

      if (!error && Array.isArray(data)) {
        lastResultsCloudSyncAt = Date.now();
        const gamesById = new Map(mockStore.games.map((g) => [g.id, g]));
        const gamesBySlug = new Map(
          mockStore.games.map((g) => [normalizeGameSlug(g.slug, g.name), g]),
        );

        let sawCloudOrphans = false;
        const cloudMapped: typeof mockStore.results = [];
        for (const row of data as Array<Record<string, unknown>>) {
          const rawGameId = String(row["game_id"] || "").trim();
          const drawDate = String(row["draw_date"] || "").trim();
          const drawTime = String(row["draw_time"] || "").trim();
          const animalNumber = Number(row["animal_number"]);
          const animalName = String(row["animal_name"] || "").trim();
          if (!rawGameId || !drawDate || !drawTime || !Number.isFinite(animalNumber)) continue;

          const rawSlug =
            typeof row["game_slug"] === "string" && row["game_slug"].trim()
              ? normalizeGameSlug(row["game_slug"])
              : undefined;

          let resolvedGame = gamesById.get(rawGameId);
          if (!resolvedGame) {
            sawCloudOrphans = true;
            if (rawSlug) {
              resolvedGame = gamesBySlug.get(rawSlug);
            }
          }

          const finalGameId = resolvedGame ? resolvedGame.id : rawGameId;
          const finalGameSlug = resolvedGame
            ? normalizeGameSlug(resolvedGame.slug, resolvedGame.name)
            : rawSlug;

          cloudMapped.push({
            id: String(row["id"] || `res-${finalGameId}-${drawDate}-${drawTime}`),
            game_id: finalGameId,
            ...(finalGameSlug ? { game_slug: finalGameSlug } : {}),
            draw_date: drawDate,
            draw_time: drawTime,
            animal_number: animalNumber,
            animal_name: animalName,
            source: row["source"] === "manual" ? "manual" : "automatic",
            created_at:
              typeof row["created_at"] === "string" ? row["created_at"] : new Date().toISOString(),
          });
        }

        if (cloudMapped.length > 0) {
          mockStore.results = sanitizeResultsList(
            mergeResultsPreserveToday(mockStore.results, cloudMapped),
          );
          consolidateInMemoryGamesAndResults();
          saveServerResults();
          // Seed cloud-persisted draw cache so synchronizeAutomaticResults skips redundant RPCs
          import("@/lib/result-sync.server")
            .then(({ markCloudDrawPersisted }) => {
              for (const row of cloudMapped) {
                markCloudDrawPersisted(
                  row.game_id,
                  row.draw_date,
                  row.draw_time,
                  row.animal_number,
                  row.animal_name,
                );
              }
            })
            .catch(() => {});
        }

        if (
          sawCloudOrphans &&
          Date.now() - lastCloudConsolidationAt >= CLOUD_CONSOLIDATION_TTL_MS
        ) {
          lastCloudConsolidationAt = Date.now();
          void consolidateGamesAndOrphanResultsInSupabase(realClient, {
            onlyDate: today,
          }).catch(() => {});
        }
      }
    } catch {
      // ignore
    } finally {
      resultsCloudSyncPromise = null;
    }
  })();

  resultsCloudSyncPromise = run;
  return run;
}

function loadServerAppSettings() {
  try {
    let loaded: Record<string, unknown> | null = null;
    if (
      !initialAppSettingsSeeded &&
      persistedAppSettingsJson &&
      typeof persistedAppSettingsJson === "object"
    ) {
      initialAppSettingsSeeded = true;
      loaded = persistedAppSettingsJson as Record<string, unknown>;
    }
    for (const f of [WORKSPACE_APP_SETTINGS_FILE, APP_SETTINGS_FILE]) {
      if (fs.existsSync(f)) {
        const parsed = JSON.parse(fs.readFileSync(f, "utf-8"));
        if (parsed && typeof parsed === "object") {
          loaded = parsed;
          break;
        }
      }
    }
    if (loaded) {
      const merged = { ...mockStore.app_settings[0], ...loaded, id: "global" };
      mockStore.app_settings = [merged];
    }
  } catch {
    // ignore
  }
}

function saveServerAppSettings() {
  try {
    serverAppSettingsVersion++;
    const current = mockStore.app_settings[0] || { id: "global" };
    const serialized = JSON.stringify(current, null, 2);
    fs.writeFileSync(WORKSPACE_APP_SETTINGS_FILE, serialized);
    fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(current));
  } catch {
    // ignore
  }
}

let backgroundSchedulerStarted = false;

function ensureServerDataInitialized() {
  if (serverDataInitialized) return;
  serverDataInitialized = true;
  loadServerAnimalImages();
  loadServerGameLogos();
  loadServerGames();
  loadServerResults();
  loadServerTripleResults();
  loadServerLicenses();
  loadServerAppSettings();
  try {
    if (fs.existsSync(LATEST_ALERT_FILE)) {
      serverLatestAlert = JSON.parse(fs.readFileSync(LATEST_ALERT_FILE, "utf-8"));
    }
  } catch {
    // ignore
  }

  ensureCustomCatalogLoaded()
    .then(() => {
      loadServerAnimalImages();
      return syncAnimalImagesWithSupabase();
    })
    .catch(() => {});
  syncLicensesWithSupabase().catch(() => {});
  syncAppSettingsWithSupabase().catch(() => {});
  syncGamesWithSupabase().catch(() => {});

  if (!backgroundSchedulerStarted && typeof setInterval !== "undefined") {
    backgroundSchedulerStarted = true;
    const timer = setInterval(() => {
      triggerBackgroundSync(false).catch(() => {});
    }, AUTO_SYNC_INTERVAL_MS);
    if (timer && typeof (timer as NodeJS.Timeout).unref === "function") {
      (timer as NodeJS.Timeout).unref();
    }
  }
}

let lastAppSettingsCloudSyncAt = 0;
let appSettingsCloudSyncPromise: Promise<void> | null = null;
const APP_SETTINGS_CLOUD_TTL_MS = 10_000;

function normalizeAppSettingsRecord(raw: Record<string, unknown> | null | undefined): AppSettings {
  const base = mockStore.app_settings[0] || DEFAULT_APP_SETTINGS;
  const decoded = parseAppSettingsFromSupabase(raw);
  return {
    ...DEFAULT_APP_SETTINGS,
    ...base,
    ...(raw as Partial<AppSettings>),
    ...(decoded || {}),
    id: "global",
  };
}

async function upsertAppSettingsToSupabase(
  settings: AppSettings,
  requestBearerToken?: string | null,
): Promise<{
  ok: boolean;
  error?: string;
  supabaseError?: DetailedSupabaseError;
}> {
  const diag = getSupabaseCloudDiagnostics();
  if (!diag.configured) {
    return { ok: true };
  }

  const adminClient = createRealSupabaseAdminClient();
  if (!adminClient) {
    return {
      ok: false,
      error: diag.reason || "No se pudo inicializar el cliente de Supabase para app_settings.",
    };
  }

  const sanitizedDb = sanitizeAppSettingsForSupabase(settings);

  const attemptUpsert = async (
    client: ReturnType<typeof createRealSupabaseAdminClient>,
  ): Promise<{ ok: boolean; error?: string; supabaseError?: DetailedSupabaseError }> => {
    if (!client) {
      return { ok: false, error: "Cliente Supabase no disponible." };
    }
    try {
      const { data, error } = await client
        .from("app_settings")
        .upsert(sanitizedDb as never, { onConflict: "id" })
        .select("id");

      if (error) {
        const detailed = toDetailedSupabaseError(error, "app_settings");
        return {
          ok: false,
          error: formatDetailedSupabaseError(detailed),
          supabaseError: detailed,
        };
      }

      if (!Array.isArray(data) || data.length === 0) {
        const detailed: DetailedSupabaseError = {
          code: "42501",
          message: "Supabase no confirmó filas guardadas en app_settings",
          details: "upsert().select('id') retornó 0 filas",
          hint: "Verifica RLS o permisos de escritura para SUPABASE_KEY en la tabla app_settings",
          table: "app_settings",
        };
        return {
          ok: false,
          error: formatDetailedSupabaseError(detailed),
          supabaseError: detailed,
        };
      }

      return { ok: true };
    } catch (err) {
      const detailed = toDetailedSupabaseError(err, "app_settings");
      return {
        ok: false,
        error: formatDetailedSupabaseError(detailed),
        supabaseError: detailed,
      };
    }
  };

  let res = await attemptUpsert(adminClient);
  if (
    !res.ok &&
    requestBearerToken &&
    (res.supabaseError?.code === "42501" ||
      /row-level security|permission denied|not allowed|0 filas/i.test(res.error || ""))
  ) {
    const tokenClient = createSupabaseClientWithToken(requestBearerToken);
    if (tokenClient) {
      const tokenRes = await attemptUpsert(tokenClient);
      if (tokenRes.ok) {
        res = tokenRes;
      }
    }
  }

  if (!res.ok) {
    console.error("[supabase-app-settings-upsert-failed]", res.supabaseError || res.error);
  } else {
    lastAppSettingsCloudSyncAt = Date.now();
  }

  return res;
}

async function syncAppSettingsWithSupabase(force = false): Promise<void> {
  const now = Date.now();
  if (!force && appSettingsCloudSyncPromise) return appSettingsCloudSyncPromise;
  if (!force && now - lastAppSettingsCloudSyncAt < APP_SETTINGS_CLOUD_TTL_MS) return;

  const client = createRealSupabaseAdminClient();
  if (!client) return;

  const run = (async () => {
    try {
      const { data, error } = await client
        .from("app_settings")
        .select("*")
        .eq("id", "global")
        .maybeSingle();

      if (!error && data) {
        lastAppSettingsCloudSyncAt = Date.now();
        const decoded = parseAppSettingsFromSupabase(data as Record<string, unknown>);
        const current = mockStore.app_settings[0] || DEFAULT_APP_SETTINGS;
        const merged: AppSettings = {
          ...DEFAULT_APP_SETTINGS,
          ...current,
          ...(decoded || {}),
          id: "global",
        };
        const prevSerialized = JSON.stringify(current);
        const nextSerialized = JSON.stringify(merged);
        if (prevSerialized !== nextSerialized) {
          mockStore.app_settings = [merged];
          saveServerAppSettings();
        }
      } else if (!error && !data && mockStore.app_settings[0]) {
        lastAppSettingsCloudSyncAt = Date.now();
        const sanitizedDb = sanitizeAppSettingsForSupabase({
          ...mockStore.app_settings[0],
          id: "global",
        });
        await client.from("app_settings").upsert(sanitizedDb as never, { onConflict: "id" });
      }
    } catch {
      // ignore
    } finally {
      appSettingsCloudSyncPromise = null;
    }
  })();

  appSettingsCloudSyncPromise = run;
  return run;
}

let lastAutoSyncTimestamp = 0;
let isAutoSyncing = false;
const AUTO_SYNC_INTERVAL_MS = 15_000;

let lastTriplesSyncTimestamp = 0;
let triplesFastSyncPromise: Promise<{ newlyAdded: TripleResult[]; newTripleCount: number }> | null =
  null;
const TRIPLES_SYNC_INTERVAL_MS = 15_000;

/**
 * Fast, isolated triples synchronization (LoteriaDeHoy + TuAzar + Multiloterias).
 * Never waits on animalitos Supabase RPCs, licenses, or animal images.
 * Applies partial results immediately as each upstream provider responds.
 */
async function syncTriplesFast(
  forceRefresh = false,
): Promise<{ newlyAdded: TripleResult[]; newTripleCount: number }> {
  const now = Date.now();
  const today = lotteryDate();
  const todayTriplesCount = serverTripleResults.filter((r) => r.draw_date === today).length;

  if (triplesFastSyncPromise) {
    return triplesFastSyncPromise;
  }
  if (
    !forceRefresh &&
    todayTriplesCount > 0 &&
    now - lastTriplesSyncTimestamp < TRIPLES_SYNC_INTERVAL_MS
  ) {
    return { newlyAdded: [], newTripleCount: 0 };
  }

  const run = (async () => {
    try {
      loadServerTripleResults();
      const hadPriorTriples = serverTripleResults.some((r) => r.draw_date === today);

      const [{ synchronizeAutomaticTriplesResults }, { synchronizeMultiloteriasData }] =
        await Promise.all([
          import("@/lib/triples-sync.server"),
          import("@/lib/multiloterias-provider.server"),
        ]);

      const resolveOfficialGameIdBySlug = (canonicalSlug: string): string | undefined => {
        const target = mockStore.games.find(
          (g) => normalizeGameSlug(g.slug, g.name) === canonicalSlug,
        );
        return target?.id;
      };

      const ldhTuazarTask = synchronizeAutomaticTriplesResults(serverTripleResults, {
        forceRefresh,
        onPartialResults: (partial) => {
          applyIncomingTriplesToServer(partial, today);
        },
      }).then((res) => {
        if (res.merged.length > 0) {
          applyIncomingTriplesToServer(res.merged, today);
        }
        return res;
      });

      const multiloteriasTask = synchronizeMultiloteriasData(
        mockStore.results,
        serverTripleResults,
        {
          resolveGameId: resolveOfficialGameIdBySlug,
          forceRefresh,
        },
      ).then((mlRes) => {
        if (mlRes.tripleResults.length > 0) {
          applyIncomingTriplesToServer(mlRes.tripleResults, today);
        }
        if (mlRes.newAnimalCount > 0 || mlRes.animalResults.length > 0) {
          const mergedAnimals = mergeResultsPreserveToday(mockStore.results, mlRes.animalResults);
          mockStore.results = sanitizeResultsList(mergedAnimals);
          consolidateInMemoryGamesAndResults();
          saveServerResults();
        }
        return mlRes;
      });

      const [triplesSync, mlSync] = await Promise.all([ldhTuazarTask, multiloteriasTask]);
      lastTriplesSyncTimestamp = Date.now();

      if ((hadPriorTriples && triplesSync.newlyAdded.length > 0) || mlSync.newTripleCount > 0) {
        const latestTriple =
          triplesSync.newlyAdded[triplesSync.newlyAdded.length - 1] ||
          serverTripleResults[serverTripleResults.length - 1];
        if (latestTriple) {
          const tripleGame = TRIPLE_GAMES.find(
            (g) => g.id === latestTriple.game_id || g.slug === latestTriple.game_slug,
          );
          if (tripleGame) {
            const alertPayload = buildTripleAlertItem(latestTriple, tripleGame);
            serverLatestAlert = alertPayload as unknown as Record<string, unknown>;
            try {
              fs.writeFileSync(LATEST_ALERT_FILE, JSON.stringify(alertPayload));
            } catch {
              // ignore
            }
          }
        }
      }

      return {
        newlyAdded: triplesSync.newlyAdded,
        newTripleCount: triplesSync.newlyAdded.length + mlSync.newTripleCount,
      };
    } catch (err) {
      console.warn("[triples-fast-sync-warn]", err);
      return { newlyAdded: [], newTripleCount: 0 };
    } finally {
      triplesFastSyncPromise = null;
    }
  })();

  triplesFastSyncPromise = run;
  return run;
}

async function triggerBackgroundSync(forceWait = false) {
  const now = Date.now();
  if (isAutoSyncing) return;
  if (!forceWait && now - lastAutoSyncTimestamp < AUTO_SYNC_INTERVAL_MS) return;

  isAutoSyncing = true;
  lastAutoSyncTimestamp = now;

  try {
    loadServerGames();
    loadServerResults();
    loadServerTripleResults();
    loadServerAnimalImages();
    loadServerLicenses();
    const prevCount = mockStore.results.length;

    // Launch fast triples sync IMMEDIATELY in parallel so it never waits for games/animalitos/images
    const triplesPromise = syncTriplesFast(forceWait).catch(() => ({
      newlyAdded: [] as TripleResult[],
      newTripleCount: 0,
    }));

    // Sincronizar juegos primero para asegurar que mockStore.games tenga los UUIDs oficiales de Supabase
    await syncGamesWithSupabase(false).catch(() => {});

    const [{ synchronizeAutomaticResults }, { getCachedMultiloteriasItems }] = await Promise.all([
      import("@/lib/result-sync.server"),
      import("@/lib/multiloterias-provider.server"),
    ]);

    const resolveOfficialGameIdBySlug = (canonicalSlug: string): string | undefined => {
      const target = mockStore.games.find(
        (g) => normalizeGameSlug(g.slug, g.name) === canonicalSlug,
      );
      return target?.id;
    };

    const [reports] = await Promise.all([
      synchronizeAutomaticResults(),
      triplesPromise,
      syncLicensesWithSupabase().catch(() => null),
      syncAnimalImagesWithSupabase().catch(() => null),
    ]);

    consolidateInMemoryGamesAndResults();
    saveServerResults();

    // Ensure Multiloterias official images (including 37-48 for Lottopantera) are stored in memory
    try {
      const [lotoItems, panteraItems] = await Promise.all([
        getCachedMultiloteriasItems("lotoanimalito"),
        getCachedMultiloteriasItems("lottopantera"),
      ]);
      const lotoOfficialId =
        resolveOfficialGameIdBySlug("lotoanimalito") || "d953f80c-4335-4bc9-9f78-9b56193286fe";
      for (const item of lotoItems) {
        const num = parseCanonicalAnimalNumber("lotoanimalito", item.number, item.name);
        if (Number.isFinite(num) && item.imageUrl) {
          if (
            !mockStore.animal_images.some(
              (img) =>
                (img.game_id === lotoOfficialId || img.game_id === "lotoanimalito") &&
                img.animal_number === num,
            )
          ) {
            mockStore.animal_images.push({
              id: `img-lotoanimalito-${num}`,
              game_id: lotoOfficialId,
              animal_number: num,
              image_url: item.imageUrl,
            });
          }
        }
      }
      const panteraOfficialId =
        resolveOfficialGameIdBySlug("lottopantera") || "61580ccf-5a2d-4d10-877e-4883515135e4";
      for (const item of panteraItems) {
        const num = parseCanonicalAnimalNumber("lottopantera", item.number, item.name);
        if (Number.isFinite(num) && item.imageUrl) {
          if (
            !mockStore.animal_images.some(
              (img) =>
                (img.game_id === panteraOfficialId || img.game_id === "lottopantera") &&
                img.animal_number === num,
            )
          ) {
            mockStore.animal_images.push({
              id: `img-lottopantera-${num}`,
              game_id: panteraOfficialId,
              animal_number: num,
              image_url: item.imageUrl,
            });
          }
        }
      }
    } catch {
      // ignore
    }

    const anyWritten = reports.some((r) => r.written > 0) || mockStore.results.length > prevCount;
    if (anyWritten) {
      const latest = mockStore.results[mockStore.results.length - 1];
      if (latest) {
        const gameObj = mockStore.games.find((g) => g.id === latest.game_id);
        const canonical = resolveCanonicalAnimal(
          gameObj?.slug ?? latest.game_id,
          latest.animal_number,
          latest.animal_name,
        );
        const exactImg = mockStore.animal_images.find(
          (img) =>
            (img.game_id === latest.game_id || (gameObj && img.game_id === gameObj.slug)) &&
            img.animal_number === canonical.number,
        );
        const alertAnimalImageUrl =
          exactImg?.image_url && !isBaseOrDefaultCatalogImageUrl(exactImg.image_url)
            ? exactImg.image_url
            : canonical.imageUrl;
        const alertPayload = {
          id: `auto-${latest.id || `${latest.game_id}-${latest.draw_date}-${latest.draw_time}`}`,
          gameId: latest.game_id,
          gameName: gameObj?.name || "Lotería",
          gameColor: gameObj?.color || "#10b981",
          gameLogoUrl: getGameLogo(gameObj || latest.game_id),
          drawDate: latest.draw_date,
          drawTime: latest.draw_time,
          animalNumber: canonical.number,
          animalLabel: canonical.label,
          animalName: canonical.name,
          animalImageUrl: alertAnimalImageUrl ?? null,
        };
        serverLatestAlert = alertPayload;
        try {
          fs.writeFileSync(LATEST_ALERT_FILE, JSON.stringify(alertPayload));
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn("[auto-sync-warn]", err);
  } finally {
    isAutoSyncing = false;
  }
}

function serveOnDemandAnimalImage(animalImageParam: string, labelParam: string): Response {
  const colonIdx = animalImageParam.lastIndexOf(":");
  const rawGameKey =
    colonIdx > 0 ? animalImageParam.slice(0, colonIdx).trim() : animalImageParam.trim();
  const rawNumStr = colonIdx > 0 ? animalImageParam.slice(colonIdx + 1).trim() : "0";

  const canonical = resolveCanonicalAnimal(rawGameKey, labelParam === "00" ? "00" : rawNumStr);
  const normalizedRawSlug = normalizeGameSlug(rawGameKey);
  const gameObj = mockStore.games.find(
    (g) =>
      g.id === rawGameKey ||
      g.slug === rawGameKey ||
      (normalizedRawSlug && normalizeGameSlug(g.slug, g.name) === normalizedRawSlug),
  );
  const candidateGameIds = new Set<string>([rawGameKey]);
  if (normalizedRawSlug) candidateGameIds.add(normalizedRawSlug);
  if (gameObj) {
    candidateGameIds.add(gameObj.id);
    candidateGameIds.add(gameObj.slug);
    for (const alias of getGameSlugAliases(gameObj.slug)) {
      candidateGameIds.add(alias);
    }
  }

  const isRealImagePayload = (url?: string | null): url is string =>
    Boolean(
      url && (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")),
    );

  const isBallena = canonical.label === "00";
  let matched = mockStore.animal_images.find(
    (img) =>
      candidateGameIds.has(img.game_id) &&
      img.animal_number === canonical.number &&
      isRealImagePayload(img.image_url),
  );

  if (!matched && isBallena) {
    matched = mockStore.animal_images.find(
      (img) =>
        candidateGameIds.has(img.game_id) &&
        (img.animal_number === 37 || img.animal_number === 76 || img.animal_number === 100) &&
        isRealImagePayload(img.image_url),
    );
  }

  // Fallback to shared reference catalogs in server RAM if this lottery delegates its animal art
  if (!matched) {
    const targetNum = isBallena ? 37 : canonical.number;
    const granjitaId =
      resolveOfficialGameIdBySlug("la-granjita") || "ca8a0400-0000-4000-8000-000000000006";
    const lottoActivoId =
      resolveOfficialGameIdBySlug("lotto-activo") || "7d21a00b-0dfa-4bdc-9edf-8115802df1d6";
    const lottoRdId =
      resolveOfficialGameIdBySlug("lotto-activo-rd") || "1e40af00-0000-4000-8000-000000000008";
    const guacharoId =
      resolveOfficialGameIdBySlug("guacharo-activo") || "01da9c54-392a-45e3-ab66-9a08befe7694";
    const guacharitoId =
      resolveOfficialGameIdBySlug("el-guacharito-millonario") ||
      "0519825d-e7ea-4e59-bf7d-cef2c832edd3";
    const lottoReyId =
      resolveOfficialGameIdBySlug("lotto-rey") || "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e";

    const fallbackGameIds =
      targetNum <= 37
        ? Array.from(
            new Set([
              granjitaId,
              "ca8a0400-0000-4000-8000-000000000006",
              lottoActivoId,
              "7d21a00b-0dfa-4bdc-9edf-8115802df1d6",
              lottoRdId,
              "1e40af00-0000-4000-8000-000000000008",
            ]),
          )
        : targetNum <= 76
          ? Array.from(
              new Set([
                guacharoId,
                "01da9c54-392a-45e3-ab66-9a08befe7694",
                guacharitoId,
                "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
                lottoReyId,
                "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e",
              ]),
            )
          : Array.from(
              new Set([
                guacharitoId,
                "0519825d-e7ea-4e59-bf7d-cef2c832edd3",
                lottoReyId,
                "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e",
              ]),
            );

    for (const fbGameId of fallbackGameIds) {
      const fbNum =
        isBallena &&
        (fbGameId === guacharoId || fbGameId === "01da9c54-392a-45e3-ab66-9a08befe7694")
          ? 76
          : isBallena &&
              (fbGameId === guacharitoId ||
                fbGameId === "0519825d-e7ea-4e59-bf7d-cef2c832edd3" ||
                fbGameId === lottoReyId ||
                fbGameId === "8f3aa087-6a0c-41a1-9ed3-5f6d5ed6918e")
            ? 100
            : targetNum;
      matched = mockStore.animal_images.find(
        (img) =>
          img.game_id === fbGameId &&
          img.animal_number === fbNum &&
          isRealImagePayload(img.image_url),
      );
      if (matched) break;
    }
  }

  const imageUrl = matched?.image_url;
  if (!imageUrl) {
    return new Response("Not found", { status: 404 });
  }

  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match && match[1] && match[2]) {
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], "base64");
      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }
  }

  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return Response.redirect(imageUrl, 302);
  }

  return new Response("Not found", { status: 404 });
}

export const Route = createFileRoute("/api/public/results/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        await ensureCloudflareEnvFromRequest(request);
        ensureServerDataInitialized();

        const reqUrl = new URL(request.url, "http://localhost");
        const animalImageQuery = reqUrl.searchParams.get("animalImage");
        if (animalImageQuery) {
          await ensureCustomCatalogLoaded().catch(() => {});
          loadServerAnimalImages();
          const labelParam = reqUrl.searchParams.get("label") ?? "";
          return serveOnDemandAnimalImage(animalImageQuery, labelParam);
        }

        const clientLogosVer = reqUrl.searchParams.get("logosVersion");
        const clientGamesVer = reqUrl.searchParams.get("gamesVersion");
        const clientImagesVer = reqUrl.searchParams.get("imagesVersion");
        const isPoll = reqUrl.searchParams.get("poll") === "1" || clientGamesVer !== null;

        const serverToday = lotteryDate();
        resetDeletedTriplesIfNewDay();

        const todayTriplesBefore = serverTripleResults.filter(
          (r) => r.draw_date === serverToday,
        ).length;
        const forceTriplesSync = reqUrl.searchParams.get("forceSync") === "1";

        // Start fast triples sync IN PARALLEL with Supabase reads when today's triples are empty or stale
        const triplesNeedSync =
          forceTriplesSync ||
          todayTriplesBefore === 0 ||
          Date.now() - lastTriplesSyncTimestamp >= TRIPLES_SYNC_INTERVAL_MS;
        const triplesSyncInFlight = triplesNeedSync
          ? syncTriplesFast(forceTriplesSync).catch(() => ({
              newlyAdded: [] as TripleResult[],
              newTripleCount: 0,
            }))
          : null;

        // 1. Sincronizar games[], licenses[], appSettings y results[] desde Supabase con timeouts acotados
        await Promise.race([
          (async () => {
            await Promise.all([
              syncGamesWithSupabase(!isPoll),
              syncLicensesWithSupabase(!isPoll),
              syncAppSettingsWithSupabase(!isPoll),
              ...(!isPoll ? [syncAnimalImagesWithSupabase()] : []),
            ]);
            await syncResultsWithSupabase(!isPoll);
          })(),
          new Promise((resolve) => setTimeout(resolve, isPoll ? 1200 : 2500)),
        ]);

        const todayResultsCount = mockStore.results.filter(
          (r) => r.draw_date === serverToday,
        ).length;
        const todayTriplesCount = serverTripleResults.filter(
          (r) => r.draw_date === serverToday,
        ).length;

        // 2. If today's triples are still empty (cold isolate), wait ONLY on the fast triples promise (max 4.5s)
        if (triplesSyncInFlight && (todayTriplesCount === 0 || forceTriplesSync)) {
          await Promise.race([
            triplesSyncInFlight,
            new Promise((resolve) => setTimeout(resolve, 4500)),
          ]);
        }

        // 3. Trigger full animalitos scraper sync when cold-empty or interval elapsed (non-blocking on warm polls!)
        const isStaleSync = Date.now() - lastAutoSyncTimestamp >= AUTO_SYNC_INTERVAL_MS;
        const isColdAnimalitosEmpty = todayResultsCount === 0;
        if (!initialAutoSyncDone || isColdAnimalitosEmpty || isStaleSync) {
          initialAutoSyncDone = true;
          const syncPromise = triggerBackgroundSync(isColdAnimalitosEmpty).catch(() => {});
          if (isColdAnimalitosEmpty) {
            await Promise.race([syncPromise, new Promise((resolve) => setTimeout(resolve, 4500))]);
          } else if (!isPoll) {
            await Promise.race([syncPromise, new Promise((resolve) => setTimeout(resolve, 900))]);
          }
        }

        // Garantizar siempre respuesta libre de duplicados y con game_id + game_slug 100% consistentes
        consolidateInMemoryGamesAndResults();

        const shouldSendLogos =
          !clientLogosVer || clientLogosVer !== String(serverCustomGameLogosVersion);
        const shouldSendGames = !clientGamesVer || clientGamesVer !== String(serverGamesVersion);
        const shouldSendImages =
          !clientImagesVer || clientImagesVer !== String(serverAnimalImagesVersion);

        if (shouldSendImages) {
          await ensureCustomCatalogLoaded().catch(() => {});
        }

        let latestAlert = serverLatestAlert;
        if (!latestAlert) {
          try {
            if (fs.existsSync(LATEST_ALERT_FILE)) {
              latestAlert = JSON.parse(fs.readFileSync(LATEST_ALERT_FILE, "utf-8"));
              serverLatestAlert = latestAlert;
            }
          } catch {
            // ignore
          }
        }
        if (
          latestAlert &&
          typeof latestAlert.animalImageUrl === "string" &&
          latestAlert.animalImageUrl.startsWith("data:") &&
          isBaseOrDefaultCatalogImageUrl(latestAlert.animalImageUrl)
        ) {
          latestAlert = {
            ...latestAlert,
            animalImageUrl: `/api/public/results/sync?animalImage=${encodeURIComponent(String(latestAlert.gameId))}:${latestAlert.animalNumber}&label=${encodeURIComponent(String(latestAlert.animalLabel || ""))}`,
          };
        }

        const cloudDiag = getSupabaseCloudDiagnostics();
        return noStoreJson({
          status: "ok",
          serverLotteryDate: serverToday,
          results: mockStore.results,
          tripleResults: serverTripleResults,
          deletedTripleIds: serverDeletedTripleIds,
          latestAlert,
          logosVersion: serverCustomGameLogosVersion,
          gamesVersion: serverGamesVersion,
          imagesVersion: serverAnimalImagesVersion,
          settingsVersion: serverAppSettingsVersion,
          animalImages: shouldSendImages
            ? filterAdminCustomAnimalImages(mockStore.animal_images)
            : null,
          games: shouldSendGames ? mockStore.games : null,
          customGameLogos: shouldSendLogos ? serverCustomGameLogos : null,
          // Always return decoded global appSettings (~400 bytes) so multi-isolate Cloudflare Workers
          // never skip pushing updated global design changes to Incognito or already-open TV screens.
          appSettings: mockStore.app_settings[0]
            ? normalizeAppSettingsRecord(
                mockStore.app_settings[0] as unknown as Record<string, unknown>,
              )
            : null,
          requireLicense: serverLicenseState.requireLicense,
          clientLicenses: isPoll ? null : serverLicenseState.licenses,
          deletedIds: isPoll ? null : serverLicenseState.deletedIds || [],
          deletedPins: isPoll ? null : serverLicenseState.deletedPins || [],
          cloudLicenseConfigured: cloudDiag.configured,
          cloudLicenseStorageMode: cloudDiag.configured ? "supabase" : "local-memory",
          workspaceLicenseFileActive: isWorkspaceLicensesFileActive(),
          cloudLicenseError: lastCloudLicenseReadError,
          supabaseError: lastCloudLicenseReadErrorDetails,
        });
      },
      POST: async ({ request }) => {
        await ensureCloudflareEnvFromRequest(request);
        if (process.env["SUPABASE_URL"]) {
          const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
          const authFailure = await authenticateCronRequest(request);
          if (authFailure) return authFailure;
        }
        try {
          loadServerGames();
          loadServerTripleResults();
          const postUrl = new URL(request.url, "http://localhost");
          let consolidationReport: ConsolidationReport | null = null;
          if (postUrl.searchParams.get("consolidate") === "1") {
            const realClient = createRealSupabaseAdminClient();
            if (realClient) {
              consolidationReport = await consolidateGamesAndOrphanResultsInSupabase(realClient);
            }
          }
          await syncGamesWithSupabase(true);
          const { synchronizeAutomaticResults } = await import("@/lib/result-sync.server");
          const [reports] = await Promise.all([
            synchronizeAutomaticResults(),
            syncTriplesFast(true),
          ]);
          await syncResultsWithSupabase(true);
          consolidateInMemoryGamesAndResults();
          saveServerResults();
          saveServerTripleResults();
          return noStoreJson({
            reports,
            consolidationReport,
            games: mockStore.games,
            results: mockStore.results,
            tripleResults: serverTripleResults,
            deletedTripleIds: serverDeletedTripleIds,
          });
        } catch (err) {
          console.error("[sync-error]", err);
          return noStoreJson(
            {
              error: "No se pudo sincronizar",
              details: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          );
        }
      },
      PUT: async ({ request }) => {
        await ensureCloudflareEnvFromRequest(request);
        try {
          loadServerGames();
          loadServerLicenses();
          loadServerTripleResults();
          loadServerAnimalImages();
          loadServerAppSettings();
          const body = await request.json();
          const {
            result,
            tripleResult,
            deleteTripleId,
            alert,
            animalImage,
            animalImagesBatch,
            deleteAnimalImage,
            gameUpdate,
            gameCreate,
            gameDelete,
            gameReorder,
            customGameLogosBatch,
            licenseAction,
            appSettings,
            consolidateOrphans,
            consolidationOptions,
            syncTriplesNow,
          } = body;
          let consolidationReport: ConsolidationReport | null = null;
          let licenseActivation: {
            valid: boolean;
            reason?: string;
            license?: ClientLicense;
          } | null = null;

          const authHeader = request.headers.get("authorization") || "";
          const rawToken = authHeader.toLowerCase().startsWith("bearer ")
            ? authHeader.slice(7).trim()
            : null;
          const bearerToken =
            rawToken && !rawToken.startsWith("mock-token-") && rawToken.split(".").length === 3
              ? rawToken
              : null;
          let cloudLicenseSyncOk: boolean | null = null;
          let cloudLicenseError: string | null = null;
          let cloudLicenseErrorDetails: DetailedSupabaseError | null = null;
          let uploadedAnimalImageUrl: string | null = null;
          let animalImageStorageError: string | null = null;
          const trackCloudResult = (res: {
            ok: boolean;
            error?: string;
            supabaseError?: DetailedSupabaseError;
          }) => {
            cloudLicenseSyncOk = res.ok;
            if (!res.ok) {
              if (res.error) cloudLicenseError = res.error;
              if (res.supabaseError) cloudLicenseErrorDetails = res.supabaseError;
            }
          };

          if (licenseAction && typeof licenseAction === "object") {
            await syncLicensesWithSupabase(true);
            const prevLicenseSnapshot = JSON.parse(
              JSON.stringify(serverLicenseState),
            ) as ServerLicenseState;
            const prevMutationKeys = new Set(recentLocalLicenseMutations.keys());
            const rollbackIfCloudFailed = (isAdminMutation: boolean) => {
              if (isAdminMutation && cloudLicenseSyncOk === false) {
                serverLicenseState = prevLicenseSnapshot;
                for (const key of Array.from(recentLocalLicenseMutations.keys())) {
                  if (!prevMutationKeys.has(key)) {
                    recentLocalLicenseMutations.delete(key);
                  }
                }
                saveServerLicenses();
              }
            };
            const act = licenseAction as {
              type: string;
              requireLicense?: boolean;
              id?: string;
              client_name?: string;
              pin_code?: string;
              days?: number | null;
              max_devices?: number;
              notes?: string;
              device_id?: string;
              licenses?: ClientLicense[];
              license?: ClientLicense;
              fallbackLicense?: ClientLicense;
            };

            if (act.type === "toggle_enforcement") {
              serverLicenseState.requireLicense = Boolean(act.requireLicense);
              markLocalLicenseMutation("require-license-toggle");
              saveServerLicenses();
              const masterLic = serverLicenseState.licenses.find(
                (l) => l.id === "lic-master-admin" || l.pin_code === "291007",
              );
              if (masterLic) {
                markLocalLicenseMutation(masterLic.id);
                const cloudRes = await upsertLicenseRowToSupabase(
                  masterLic,
                  packMasterNotesWithRequire(serverLicenseState.requireLicense),
                  bearerToken,
                );
                trackCloudResult(cloudRes);
              }
            } else if (act.type === "restore_batch" && Array.isArray(act.licenses)) {
              const deletedSet = new Set<string>(serverLicenseState.deletedIds || []);
              const deletedPinSet = new Set<string>(serverLicenseState.deletedPins || []);
              let changedAny = false;
              for (const cachedLic of act.licenses) {
                if (
                  !cachedLic ||
                  !cachedLic.pin_code ||
                  deletedSet.has(cachedLic.id) ||
                  deletedPinSet.has(cachedLic.pin_code)
                ) {
                  continue;
                }
                const existing = serverLicenseState.licenses.find(
                  (l) => l.id === cachedLic.id || l.pin_code === cachedLic.pin_code,
                );
                if (existing) {
                  const nextName = (cachedLic.client_name || existing.client_name).trim();
                  const nextStatus = cachedLic.status === "paused" ? "paused" : "active";
                  const nextExpires =
                    cachedLic.expires_at !== undefined ? cachedLic.expires_at : existing.expires_at;
                  const nextMax = Math.max(
                    1,
                    Number(cachedLic.max_devices) || existing.max_devices || 1,
                  );
                  if (
                    existing.client_name !== nextName ||
                    existing.status !== nextStatus ||
                    existing.expires_at !== nextExpires ||
                    existing.max_devices !== nextMax
                  ) {
                    existing.client_name = nextName;
                    existing.status = nextStatus;
                    existing.expires_at = nextExpires;
                    existing.max_devices = nextMax;
                    if (typeof cachedLic.notes === "string") {
                      existing.notes = cachedLic.notes;
                    }
                    changedAny = true;
                    const cloudRes = await upsertLicenseRowToSupabase(
                      existing,
                      undefined,
                      bearerToken,
                    );
                    trackCloudResult(cloudRes);
                  }
                } else {
                  const cleanPin = String(cachedLic.pin_code)
                    .replace(/[^0-9]/g, "")
                    .slice(0, 6);
                  const restored: ClientLicense = {
                    id: isValidUuid(cachedLic.id)
                      ? cachedLic.id
                      : toSupabaseLicenseUuid(cachedLic.id, cleanPin),
                    client_name: (cachedLic.client_name || "Cliente").trim(),
                    pin_code: cleanPin,
                    status: cachedLic.status === "paused" ? "paused" : "active",
                    expires_at: cachedLic.expires_at || null,
                    max_devices: Math.max(1, Number(cachedLic.max_devices) || 1),
                    bound_device_ids: Array.isArray(cachedLic.bound_device_ids)
                      ? cachedLic.bound_device_ids
                      : [],
                    notes: cachedLic.notes || "",
                    created_at: cachedLic.created_at || new Date().toISOString(),
                  };
                  serverLicenseState.licenses.unshift(restored);
                  changedAny = true;
                  const cloudRes = await upsertLicenseRowToSupabase(
                    restored,
                    undefined,
                    bearerToken,
                  );
                  trackCloudResult(cloudRes);
                }
              }
              if (changedAny) {
                saveServerLicenses();
              }
            } else if (act.type === "create") {
              const cleanPin =
                (act.pin_code || "").replace(/[^0-9]/g, "").slice(0, 6) ||
                String(Math.floor(100000 + Math.random() * 900000));
              const existingPinOwner = serverLicenseState.licenses.find(
                (l) => l.pin_code === cleanPin,
              );
              if (existingPinOwner) {
                const ownerName = existingPinOwner.client_name.split("||")[0]?.trim() || "Cliente";
                trackCloudResult({
                  ok: false,
                  error: `El PIN ${cleanPin} ya está asignado a "${ownerName}". Genera un PIN distinto para no sobrescribir esa licencia.`,
                  supabaseError: {
                    code: "23505",
                    message: `El PIN ${cleanPin} ya está asignado a "${ownerName}".`,
                    details: `existing_id=${existingPinOwner.id}`,
                    hint: "Usa un código PIN único para cada cliente.",
                    table: SUPABASE_LICENSES_TABLE,
                  },
                });
              } else {
                const daysNum =
                  act.days === null ? null : Math.max(1, Math.min(365, Number(act.days) || 30));
                const expiresAt =
                  typeof daysNum === "number" && daysNum > 0
                    ? new Date(Date.now() + daysNum * 86400000).toISOString()
                    : null;
                const newId =
                  act.id && isValidUuid(act.id)
                    ? act.id.trim().toLowerCase()
                    : generateLicenseUuid();
                const newLic: ClientLicense = {
                  id: newId,
                  client_name: (act.client_name || "Cliente").trim(),
                  pin_code: cleanPin,
                  status: "active",
                  expires_at: expiresAt,
                  max_devices: Math.max(1, Number(act.max_devices) || 1),
                  bound_device_ids: [],
                  notes: act.notes?.trim() || "",
                  created_at: new Date().toISOString(),
                };
                if (serverLicenseState.deletedIds) {
                  serverLicenseState.deletedIds = serverLicenseState.deletedIds.filter(
                    (id) => id !== newLic.id,
                  );
                }
                if (serverLicenseState.deletedPins) {
                  serverLicenseState.deletedPins = serverLicenseState.deletedPins.filter(
                    (pin) => pin !== cleanPin,
                  );
                }
                serverLicenseState.licenses = [
                  newLic,
                  ...serverLicenseState.licenses.filter((l) => l.id !== newLic.id),
                ];
                markLocalLicenseMutation(newLic.id);
                saveServerLicenses();

                const cloudRes = await upsertLicenseRowToSupabase(newLic, undefined, bearerToken, {
                  isCreate: true,
                });
                trackCloudResult(cloudRes);
                if (cloudRes.ok && cloudRes.resolvedId && cloudRes.resolvedId !== newLic.id) {
                  newLic.id = cloudRes.resolvedId;
                  markLocalLicenseMutation(newLic.id);
                  saveServerLicenses();
                }
              }
            } else if (act.type === "renew" && act.id) {
              let target =
                serverLicenseState.licenses.find((l) => l.id === act.id) ||
                (act.license?.pin_code
                  ? serverLicenseState.licenses.find((l) => l.pin_code === act.license?.pin_code)
                  : undefined);
              if (!target && act.license) {
                target = { ...act.license };
                serverLicenseState.licenses.unshift(target);
              }
              if (target) {
                if (act.days === null) {
                  target.expires_at = null;
                } else {
                  const daysToAdd = Math.max(1, Math.min(365, Number(act.days) || 30));
                  const isStillActive =
                    target.expires_at && new Date(target.expires_at).getTime() > Date.now();
                  const baseDate = isStillActive ? new Date(target.expires_at) : new Date();
                  target.expires_at = new Date(
                    baseDate.getTime() + daysToAdd * 86400000,
                  ).toISOString();
                }
                target.status = "active";
                markLocalLicenseMutation(target.id);
                saveServerLicenses();

                const cloudRes = await upsertLicenseRowToSupabase(target, undefined, bearerToken);
                trackCloudResult(cloudRes);
                if (cloudRes.ok && cloudRes.resolvedId && cloudRes.resolvedId !== target.id) {
                  target.id = cloudRes.resolvedId;
                  markLocalLicenseMutation(target.id);
                  saveServerLicenses();
                }
              }
            } else if (act.type === "toggle_status" && act.id) {
              let target =
                serverLicenseState.licenses.find((l) => l.id === act.id) ||
                (act.license?.pin_code
                  ? serverLicenseState.licenses.find((l) => l.pin_code === act.license?.pin_code)
                  : undefined);
              if (!target && act.license) {
                target = { ...act.license };
                serverLicenseState.licenses.unshift(target);
              }
              if (target) {
                target.status =
                  act.license?.status === "paused" || act.license?.status === "active"
                    ? act.license.status
                    : target.status === "active"
                      ? "paused"
                      : "active";
                markLocalLicenseMutation(target.id);
                saveServerLicenses();

                const cloudRes = await upsertLicenseRowToSupabase(target, undefined, bearerToken);
                trackCloudResult(cloudRes);
                if (cloudRes.ok && cloudRes.resolvedId && cloudRes.resolvedId !== target.id) {
                  target.id = cloudRes.resolvedId;
                  markLocalLicenseMutation(target.id);
                  saveServerLicenses();
                }
              }
            } else if (act.type === "reset_devices" && act.id) {
              let target =
                serverLicenseState.licenses.find((l) => l.id === act.id) ||
                (act.license?.pin_code
                  ? serverLicenseState.licenses.find((l) => l.pin_code === act.license?.pin_code)
                  : undefined);
              if (!target && act.license) {
                target = { ...act.license };
                serverLicenseState.licenses.unshift(target);
              }
              if (target) {
                target.bound_device_ids = [];
                markLocalLicenseMutation(target.id);
                saveServerLicenses();

                const cloudRes = await upsertLicenseRowToSupabase(target, undefined, bearerToken);
                trackCloudResult(cloudRes);
                if (cloudRes.ok && cloudRes.resolvedId && cloudRes.resolvedId !== target.id) {
                  target.id = cloudRes.resolvedId;
                  markLocalLicenseMutation(target.id);
                  saveServerLicenses();
                }
              }
            } else if (
              act.type === "update_lotteries" &&
              act.id &&
              typeof act.client_name === "string"
            ) {
              let target =
                serverLicenseState.licenses.find((l) => l.id === act.id) ||
                (act.license?.pin_code
                  ? serverLicenseState.licenses.find((l) => l.pin_code === act.license?.pin_code)
                  : undefined);
              if (!target && act.license) {
                target = { ...act.license };
                serverLicenseState.licenses.unshift(target);
              }
              if (target) {
                target.client_name = act.client_name.trim();
                markLocalLicenseMutation(target.id);
                saveServerLicenses();

                const notesToPersist =
                  target.id === "lic-master-admin" || target.pin_code === "291007"
                    ? packMasterNotesWithRequire(serverLicenseState.requireLicense)
                    : undefined;
                const cloudRes = await upsertLicenseRowToSupabase(
                  target,
                  notesToPersist,
                  bearerToken,
                );
                trackCloudResult(cloudRes);
                if (cloudRes.ok && cloudRes.resolvedId && cloudRes.resolvedId !== target.id) {
                  target.id = cloudRes.resolvedId;
                  markLocalLicenseMutation(target.id);
                  saveServerLicenses();
                }
              }
            } else if (act.type === "delete" && act.id) {
              const targetToDelete = serverLicenseState.licenses.find(
                (l) => l.id === act.id || l.id === toSupabaseLicenseUuid(act.id),
              );
              serverLicenseState.licenses = serverLicenseState.licenses.filter(
                (l) => l.id !== act.id && l.id !== targetToDelete?.id,
              );
              if (!serverLicenseState.deletedIds) {
                serverLicenseState.deletedIds = [];
              }
              if (!serverLicenseState.deletedIds.includes(act.id)) {
                serverLicenseState.deletedIds.push(act.id);
              }
              if (!serverLicenseState.deletedPins) {
                serverLicenseState.deletedPins = [];
              }
              if (
                targetToDelete?.pin_code &&
                !serverLicenseState.deletedPins.includes(targetToDelete.pin_code)
              ) {
                serverLicenseState.deletedPins.push(targetToDelete.pin_code);
              }
              markLocalLicenseMutation(act.id);
              saveServerLicenses();

              const cloudRes = await deleteLicenseRowFromSupabase(
                act.id,
                targetToDelete?.pin_code,
                bearerToken,
              );
              trackCloudResult(cloudRes);
              rollbackIfCloudFailed(true);
            } else if (act.type === "activate_pin") {
              const cleanPin = (act.pin_code || "").replace(/[^0-9]/g, "");
              const devId = (act.device_id || "TV-DEFAULT").trim();
              if (cleanPin === "291007") {
                const existingMaster = serverLicenseState.licenses.find(
                  (l) => l.pin_code === "291007",
                );
                licenseActivation = {
                  valid: true,
                  license: existingMaster || {
                    id: toSupabaseLicenseUuid("lic-master-admin", "291007"),
                    client_name: "Administrador Maestro",
                    pin_code: "291007",
                    status: "active",
                    expires_at: new Date(Date.now() + 3650 * 86400000).toISOString(),
                    max_devices: 999,
                    bound_device_ids: [devId],
                    notes: "PIN Maestro: 291007",
                    created_at: new Date().toISOString(),
                  },
                };
              } else {
                let match = serverLicenseState.licenses.find((l) => l.pin_code === cleanPin);

                // Direct Supabase lookup fallback if cold isolate didn't list it yet
                const realClient = createRealSupabaseAdminClient();
                if (!match && cleanPin && realClient) {
                  try {
                    const { data: directRow } = await realClient
                      .from(SUPABASE_LICENSES_TABLE)
                      .select("*")
                      .eq("pin_code", cleanPin)
                      .maybeSingle();
                    if (directRow && typeof directRow === "object") {
                      const d = directRow as Record<string, unknown>;
                      match = {
                        id: String(d["id"]),
                        client_name: String(d["client_name"] || "Cliente"),
                        pin_code: String(d["pin_code"] || cleanPin),
                        status: d["status"] === "paused" ? "paused" : "active",
                        expires_at: d["expires_at"]
                          ? new Date(d["expires_at"] as string).toISOString()
                          : null,
                        max_devices: Number(d["max_devices"]) || 1,
                        bound_device_ids: Array.isArray(d["bound_device_ids"])
                          ? (d["bound_device_ids"] as string[])
                          : [],
                        notes: typeof d["notes"] === "string" ? d["notes"] : "",
                        created_at: d["created_at"]
                          ? new Date(d["created_at"] as string).toISOString()
                          : new Date().toISOString(),
                      };
                      serverLicenseState.licenses.unshift(match);
                      saveServerLicenses();
                    }
                  } catch {
                    // ignore
                  }
                }

                // Fallback only if client explicitly supplied an existing cloud-synced record and server hasn't deleted it
                if (
                  !match &&
                  act.fallbackLicense &&
                  act.fallbackLicense.pin_code === cleanPin &&
                  !(serverLicenseState.deletedPins || []).includes(cleanPin) &&
                  !(serverLicenseState.deletedIds || []).includes(act.fallbackLicense.id)
                ) {
                  match = {
                    ...act.fallbackLicense,
                    id: toSupabaseLicenseUuid(act.fallbackLicense.id, cleanPin),
                    bound_device_ids: Array.isArray(act.fallbackLicense.bound_device_ids)
                      ? [...act.fallbackLicense.bound_device_ids]
                      : [],
                  };
                  serverLicenseState.licenses.unshift(match);
                  markLocalLicenseMutation(match.id);
                  saveServerLicenses();
                  const cloudRes = await upsertLicenseRowToSupabase(match, undefined, bearerToken);
                  trackCloudResult(cloudRes);
                }

                if (!match) {
                  licenseActivation = {
                    valid: false,
                    reason: "Código PIN inválido. Verifique los 6 dígitos con su proveedor.",
                  };
                } else if (match.status === "paused") {
                  licenseActivation = {
                    valid: false,
                    reason: "Esta licencia se encuentra suspendida temporalmente.",
                  };
                } else if (match.expires_at && new Date(match.expires_at) < new Date()) {
                  licenseActivation = {
                    valid: false,
                    reason: "Su suscripción ha vencido. Contacte al administrador para renovar.",
                  };
                } else {
                  const alreadyBound = match.bound_device_ids.includes(devId);
                  if (!alreadyBound && match.bound_device_ids.length >= (match.max_devices || 1)) {
                    licenseActivation = {
                      valid: false,
                      reason: `Este PIN ya está en uso en el máximo de pantallas permitidas (${match.max_devices}). Solicite liberar la pantalla anterior.`,
                    };
                  } else {
                    if (!alreadyBound) {
                      match.bound_device_ids.push(devId);
                      markLocalLicenseMutation(match.id);
                      saveServerLicenses();
                      const cloudRes = await upsertLicenseRowToSupabase(
                        match,
                        undefined,
                        bearerToken,
                      );
                      trackCloudResult(cloudRes);
                    } else {
                      cloudLicenseSyncOk = true;
                    }
                    licenseActivation = {
                      valid: true,
                      license: match,
                    };
                  }
                }
              }
            }

            if (
              act.type !== "activate_pin" &&
              act.type !== "restore_batch" &&
              cloudLicenseSyncOk === false
            ) {
              rollbackIfCloudFailed(true);
            }
          }

          if (consolidateOrphans) {
            const realClient = createRealSupabaseAdminClient();
            if (realClient) {
              const opts =
                consolidationOptions && typeof consolidationOptions === "object"
                  ? (consolidationOptions as {
                      dryRun?: boolean;
                      drawDate?: string;
                      explicitOrphanMap?: Record<string, string>;
                    })
                  : {};
              consolidationReport = await consolidateGamesAndOrphanResultsInSupabase(
                realClient,
                opts,
              );
            }
            await syncGamesWithSupabase(true);
            await syncResultsWithSupabase(true);
            consolidateInMemoryGamesAndResults();
            saveServerGames();
            saveServerResults();
          }

          if (result) {
            // Resolver siempre game_id oficial y game_slug canónico antes de guardar
            const rawResultGameId = String(result.game_id || "").trim();
            const rawResultGameSlug =
              typeof result.game_slug === "string" ? result.game_slug.trim() : "";
            const targetGameForResult =
              mockStore.games.find((g) => g.id === rawResultGameId) ??
              mockStore.games.find(
                (g) =>
                  normalizeGameSlug(g.slug, g.name) ===
                  normalizeGameSlug(rawResultGameSlug || rawResultGameId),
              );
            const resolvedGameId = targetGameForResult?.id ?? rawResultGameId;
            const resolvedGameSlug = targetGameForResult
              ? normalizeGameSlug(targetGameForResult.slug, targetGameForResult.name)
              : normalizeGameSlug(rawResultGameSlug || rawResultGameId) || null;
            const normalizedResult = {
              ...result,
              game_id: resolvedGameId,
              game_slug: resolvedGameSlug,
            };

            const conflictIndex = mockStore.results.findIndex(
              (r) =>
                r.game_id === normalizedResult.game_id &&
                r.draw_date === normalizedResult.draw_date &&
                r.draw_time === normalizedResult.draw_time,
            );
            if (conflictIndex >= 0) {
              mockStore.results[conflictIndex] = {
                ...mockStore.results[conflictIndex],
                ...normalizedResult,
              };
            } else {
              mockStore.results.push({
                id:
                  normalizedResult.id ??
                  `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                ...normalizedResult,
              });
            }
            saveServerResults();

            // Persistir también en Supabase con el game_id oficial y game_slug canónico
            const realClient = createRealSupabaseAdminClient();
            if (
              realClient &&
              resolvedGameId &&
              normalizedResult.draw_date &&
              normalizedResult.draw_time
            ) {
              try {
                const payloadWithSlug: Record<string, unknown> = {
                  game_id: resolvedGameId,
                  draw_date: normalizedResult.draw_date,
                  draw_time: normalizedResult.draw_time,
                  animal_number: normalizedResult.animal_number,
                  animal_name: normalizedResult.animal_name,
                  source: normalizedResult.source ?? "manual",
                  ...(resolvedGameSlug ? { game_slug: resolvedGameSlug } : {}),
                };
                const { error: upsertErr } = await realClient
                  .from("results")
                  .upsert(payloadWithSlug, { onConflict: "game_id,draw_date,draw_time" });
                if (upsertErr && /column.*game_slug|schema cache/i.test(upsertErr.message || "")) {
                  const { game_slug: _omit, ...payloadWithoutSlug } = payloadWithSlug;
                  await realClient
                    .from("results")
                    .upsert(payloadWithoutSlug, { onConflict: "game_id,draw_date,draw_time" });
                }
              } catch (err) {
                console.warn("[sync.ts] Supabase results upsert error:", err);
              }
            }
          }

          if (syncTriplesNow) {
            await syncTriplesFast(true);
          }

          if (tripleResult && typeof tripleResult === "object") {
            resetDeletedTriplesIfNewDay();
            const rawTr = tripleResult as TripleResult;
            const normTime = normalizeTripleDrawTime(rawTr.draw_time);
            const normTimeKey = normalizeTripleDrawTimeKey(rawTr.draw_time);
            const tr: TripleResult = {
              ...rawTr,
              game_slug: rawTr.game_slug || rawTr.game_id,
              draw_time: normTime,
              id: rawTr.id || `triple-${rawTr.game_id}-${rawTr.draw_date}-${normTime}`,
            };
            serverDeletedTripleIds = serverDeletedTripleIds.filter((id) => id !== tr.id);
            const conflictIdx = serverTripleResults.findIndex(
              (r) =>
                (r.game_id === tr.game_id || r.game_slug === tr.game_slug) &&
                r.draw_date === tr.draw_date &&
                normalizeTripleDrawTimeKey(r.draw_time) === normTimeKey,
            );
            if (conflictIdx >= 0) {
              serverTripleResults[conflictIdx] = {
                ...serverTripleResults[conflictIdx],
                ...tr,
              };
            } else {
              serverTripleResults.push(tr);
            }
            saveServerTripleResults();
          }

          if (deleteTripleId && typeof deleteTripleId === "string") {
            resetDeletedTriplesIfNewDay();
            if (!serverDeletedTripleIds.includes(deleteTripleId)) {
              serverDeletedTripleIds.push(deleteTripleId);
            }
            serverTripleResults = serverTripleResults.filter((r) => r.id !== deleteTripleId);
            saveServerTripleResults();
          }

          if (gameCreate && typeof gameCreate === "object") {
            const rawCreated = gameCreate as (typeof mockStore.games)[0];
            if (rawCreated.id && rawCreated.name) {
              const canonicalSlug = normalizeGameSlug(rawCreated.slug, rawCreated.name);
              const created: (typeof mockStore.games)[0] = {
                ...rawCreated,
                slug: canonicalSlug || rawCreated.slug,
              };
              const existingIdx = mockStore.games.findIndex(
                (g) => g.id === created.id || areSameCanonicalGame(g, created),
              );
              let persistedGame = created;
              if (existingIdx >= 0) {
                persistedGame = {
                  ...mockStore.games[existingIdx],
                  ...created,
                  // Mantener siempre el ID oficial existente si el juego ya existía por slug canónico
                  id: mockStore.games[existingIdx].id,
                  slug: canonicalSlug || mockStore.games[existingIdx].slug,
                };
                mockStore.games[existingIdx] = persistedGame;
              } else {
                mockStore.games.push(persistedGame);
              }
              markLocalGameMutation(persistedGame.id);
              saveServerGames();
              try {
                await supabaseAdmin.from("games").upsert(persistedGame);
              } catch {
                // ignore
              }
            }
          }

          if (gameDelete && typeof gameDelete === "object" && gameDelete.id) {
            mockStore.games = mockStore.games.filter((g) => g.id !== gameDelete.id);
            markLocalGameMutation(String(gameDelete.id));
            saveServerGames();
            try {
              await supabaseAdmin.from("games").delete().eq("id", gameDelete.id);
            } catch {
              // ignore
            }
          }

          if (Array.isArray(gameReorder)) {
            for (const item of gameReorder as Array<{ id: string; display_order: number }>) {
              const target = mockStore.games.find((g) => g.id === item.id);
              if (target && typeof item.display_order === "number") {
                target.display_order = item.display_order;
                markLocalGameMutation(target.id);
                try {
                  await supabaseAdmin
                    .from("games")
                    .update({ display_order: item.display_order })
                    .eq("id", target.id);
                } catch {
                  // ignore
                }
              }
            }
            mockStore.games.sort((a, b) => (a.display_order ?? 99) - (b.display_order ?? 99));
            saveServerGames();
          }

          if (gameUpdate) {
            const {
              id,
              slug,
              loading_mode,
              mode,
              schedule_times,
              color,
              name,
              is_active,
              logo_url,
              display_order,
            } = gameUpdate;
            const canonicalUpdateSlug = slug ? normalizeGameSlug(slug, name) : "";
            const targetGame = mockStore.games.find(
              (g) =>
                g.id === id ||
                (slug &&
                  (g.slug === slug ||
                    (canonicalUpdateSlug &&
                      normalizeGameSlug(g.slug, g.name) === canonicalUpdateSlug))),
            );
            if (targetGame) {
              if (mode !== undefined || loading_mode !== undefined) {
                const effectiveMode = (mode ?? loading_mode ?? "automatic") as
                  "manual" | "automatic";
                targetGame.loading_mode = effectiveMode;
                targetGame.mode = effectiveMode;
              }
              if (Array.isArray(schedule_times)) {
                targetGame.schedule_times = schedule_times;
              }
              if (color !== undefined) targetGame.color = color;
              if (name !== undefined) targetGame.name = name;
              if (slug !== undefined || name !== undefined) {
                const normalizedSlug = normalizeGameSlug(
                  slug ?? targetGame.slug,
                  name ?? targetGame.name,
                );
                if (normalizedSlug) {
                  targetGame.slug = normalizedSlug;
                }
              }
              if (is_active !== undefined) targetGame.is_active = Boolean(is_active);
              if (display_order !== undefined) targetGame.display_order = Number(display_order);
              if (logo_url !== undefined) {
                const idKey = targetGame.id.trim().toLowerCase();
                const slugKey = (targetGame.slug || "").trim().toLowerCase();
                if (logo_url && isCustomUploadedGameLogo(logo_url)) {
                  serverCustomGameLogos[idKey] = logo_url;
                  if (slugKey) serverCustomGameLogos[slugKey] = logo_url;
                  targetGame.logo_url = logo_url;
                } else {
                  delete serverCustomGameLogos[idKey];
                  if (slugKey) delete serverCustomGameLogos[slugKey];
                  targetGame.logo_url = getGameLogo(
                    {
                      id: targetGame.id,
                      slug: targetGame.slug,
                      name: targetGame.name,
                      color: targetGame.color,
                    },
                    targetGame.color,
                  );
                }
              }
              markLocalGameMutation(targetGame.id);
              saveServerGames();
              try {
                await supabaseAdmin
                  .from("games")
                  .update({
                    ...(color !== undefined ? { color: targetGame.color } : {}),
                    ...(name !== undefined ? { name: targetGame.name } : {}),
                    ...(slug !== undefined || name !== undefined ? { slug: targetGame.slug } : {}),
                    ...(is_active !== undefined ? { is_active: targetGame.is_active } : {}),
                    ...(display_order !== undefined
                      ? { display_order: targetGame.display_order }
                      : {}),
                    ...(loading_mode !== undefined || mode !== undefined
                      ? { loading_mode: targetGame.loading_mode }
                      : {}),
                    ...(logo_url !== undefined ? { logo_url: targetGame.logo_url } : {}),
                  })
                  .eq("id", targetGame.id);
              } catch {
                // ignore
              }
            }
          }

          if (customGameLogosBatch && typeof customGameLogosBatch === "object") {
            let anyLogoAdded = false;
            for (const [k, v] of Object.entries(customGameLogosBatch as Record<string, unknown>)) {
              const cleanKey = k.trim().toLowerCase();
              if (cleanKey && typeof v === "string" && isCustomUploadedGameLogo(v)) {
                if (serverCustomGameLogos[cleanKey] !== v) {
                  serverCustomGameLogos[cleanKey] = v;
                  anyLogoAdded = true;
                }
                const targetGame = mockStore.games.find(
                  (g) =>
                    g.id.toLowerCase() === cleanKey ||
                    g.slug.toLowerCase() === cleanKey ||
                    g.name.toLowerCase() === cleanKey,
                );
                if (targetGame && targetGame.logo_url !== v) {
                  targetGame.logo_url = v;
                  anyLogoAdded = true;
                }
              }
            }
            if (anyLogoAdded) {
              saveServerGames();
            }
          }

          if (animalImage && !isBaseOrDefaultCatalogImageUrl(animalImage.image_url)) {
            const storageRes = await uploadAnimalImageToSupabaseStorage(
              animalImage.game_id,
              animalImage.animal_number,
              animalImage.image_url,
            );
            const finalImageUrl = storageRes.url;
            uploadedAnimalImageUrl = finalImageUrl;
            if (storageRes.error) {
              animalImageStorageError = storageRes.error;
            }
            const resolvedAnimalImage: AnimalImage = {
              id: animalImage.id ?? `img-${animalImage.game_id}-${animalImage.animal_number}`,
              game_id: animalImage.game_id,
              animal_number: animalImage.animal_number,
              image_url: finalImageUrl,
            };

            const existingIdx = mockStore.animal_images.findIndex(
              (img) =>
                img.game_id === resolvedAnimalImage.game_id &&
                img.animal_number === resolvedAnimalImage.animal_number,
            );
            if (existingIdx >= 0) {
              mockStore.animal_images[existingIdx] = {
                ...mockStore.animal_images[existingIdx],
                ...resolvedAnimalImage,
              };
            } else {
              mockStore.animal_images.push(resolvedAnimalImage);
            }
            saveServerAnimalImages();
            try {
              await supabaseAdmin.from("animal_images").upsert(
                {
                  game_id: resolvedAnimalImage.game_id,
                  animal_number: resolvedAnimalImage.animal_number,
                  image_url: resolvedAnimalImage.image_url,
                },
                { onConflict: "game_id,animal_number" },
              );
            } catch {
              // ignore
            }
          }

          if (Array.isArray(animalImagesBatch) && animalImagesBatch.length > 0) {
            await ensureCustomCatalogLoaded();
            const rawValidBatch: AnimalImage[] = animalImagesBatch
              .filter(
                (item: unknown) =>
                  Boolean(item) &&
                  typeof item === "object" &&
                  typeof (item as AnimalImage).game_id === "string" &&
                  typeof (item as AnimalImage).animal_number === "number" &&
                  typeof (item as AnimalImage).image_url === "string" &&
                  Boolean((item as AnimalImage).image_url.trim()) &&
                  !isBaseOrDefaultCatalogImageUrl((item as AnimalImage).image_url),
              )
              .map((item: AnimalImage) => ({
                id: item.id ?? `img-${item.game_id}-${item.animal_number}`,
                game_id: item.game_id,
                animal_number: item.animal_number,
                image_url: item.image_url,
              }));
            const validBatch: AnimalImage[] = [];
            for (const item of rawValidBatch) {
              const storageRes = await uploadAnimalImageToSupabaseStorage(
                item.game_id,
                item.animal_number,
                item.image_url,
              );
              if (storageRes.error && !animalImageStorageError) {
                animalImageStorageError = storageRes.error;
              }
              validBatch.push({ ...item, image_url: storageRes.url });
            }
            if (validBatch.length > 0) {
              mockStore.animal_images = mergeAnimalImagesPreserveCustom(
                mockStore.animal_images,
                validBatch,
              );
              saveServerAnimalImages();
              try {
                await supabaseAdmin.from("animal_images").upsert(
                  validBatch.map((item) => ({
                    game_id: item.game_id,
                    animal_number: item.animal_number,
                    image_url: item.image_url,
                  })),
                  { onConflict: "game_id,animal_number" },
                );
              } catch {
                // ignore
              }
            }
          }

          if (deleteAnimalImage && typeof deleteAnimalImage === "object") {
            const existingToDelete = mockStore.animal_images.find(
              (img) =>
                img.game_id === deleteAnimalImage.game_id &&
                img.animal_number === deleteAnimalImage.animal_number,
            );
            mockStore.animal_images = mockStore.animal_images.filter(
              (img) =>
                !(
                  img.game_id === deleteAnimalImage.game_id &&
                  img.animal_number === deleteAnimalImage.animal_number
                ),
            );
            saveServerAnimalImages();
            await removeAnimalImageFromSupabaseStorage(
              deleteAnimalImage.game_id,
              deleteAnimalImage.animal_number,
              existingToDelete?.image_url,
            );
            try {
              await supabaseAdmin
                .from("animal_images")
                .delete()
                .eq("game_id", deleteAnimalImage.game_id)
                .eq("animal_number", deleteAnimalImage.animal_number);
            } catch {
              // ignore
            }
          }

          let cloudSettingsSyncOk: boolean | null = null;
          let cloudSettingsError: string | null = null;
          let cloudSettingsSupabaseError: DetailedSupabaseError | null = null;

          if (appSettings && typeof appSettings === "object") {
            const prevAppSettings = mockStore.app_settings[0]
              ? { ...mockStore.app_settings[0] }
              : null;
            const merged = normalizeAppSettingsRecord({
              ...(mockStore.app_settings[0] as unknown as Record<string, unknown>),
              ...(appSettings as Record<string, unknown>),
              id: "global",
              updated_at:
                typeof (appSettings as Record<string, unknown>).updated_at === "string" &&
                String((appSettings as Record<string, unknown>).updated_at).trim()
                  ? String((appSettings as Record<string, unknown>).updated_at)
                  : new Date().toISOString(),
            });
            mockStore.app_settings = [merged];
            saveServerAppSettings();

            const cloudSettingsRes = await upsertAppSettingsToSupabase(merged, bearerToken);
            cloudSettingsSyncOk = cloudSettingsRes.ok;
            if (!cloudSettingsRes.ok) {
              cloudSettingsError =
                cloudSettingsRes.error || "No se pudo guardar app_settings en Supabase.";
              cloudSettingsSupabaseError = cloudSettingsRes.supabaseError || null;
              if (prevAppSettings) {
                mockStore.app_settings = [prevAppSettings];
                saveServerAppSettings();
              }
            }
          }

          if (alert) {
            serverLatestAlert = alert as Record<string, unknown>;
            try {
              fs.writeFileSync(LATEST_ALERT_FILE, JSON.stringify(alert));
            } catch {
              // ignore
            }
          }

          const putCloudDiag = getSupabaseCloudDiagnostics();
          return noStoreJson({
            status: "ok",
            consolidationReport,
            results: mockStore.results,
            tripleResults: serverTripleResults,
            deletedTripleIds: serverDeletedTripleIds,
            animalImages: filterAdminCustomAnimalImages(mockStore.animal_images),
            uploadedAnimalImageUrl,
            animalImageStorageError,
            games: mockStore.games,
            customGameLogos: serverCustomGameLogos,
            logosVersion: serverCustomGameLogosVersion,
            gamesVersion: serverGamesVersion,
            imagesVersion: serverAnimalImagesVersion,
            settingsVersion: serverAppSettingsVersion,
            appSettings: mockStore.app_settings[0]
              ? normalizeAppSettingsRecord(
                  mockStore.app_settings[0] as unknown as Record<string, unknown>,
                )
              : null,
            cloudSettingsSyncOk,
            cloudSettingsError,
            cloudSettingsSupabaseError,
            requireLicense: serverLicenseState.requireLicense,
            clientLicenses: serverLicenseState.licenses,
            deletedIds: serverLicenseState.deletedIds || [],
            deletedPins: serverLicenseState.deletedPins || [],
            licenseActivation,
            cloudLicenseSyncOk,
            cloudLicenseError,
            supabaseError: cloudLicenseErrorDetails,
            cloudLicenseConfigured: putCloudDiag.configured,
            cloudLicenseStorageMode: putCloudDiag.configured ? "supabase" : "local-memory",
            workspaceLicenseFileActive: isWorkspaceLicensesFileActive(),
          });
        } catch (err) {
          const detailed = extractDetailedError(err);
          console.error("[sync-put-unhandled-error]", detailed, err);
          const formatted = [
            detailed.code ? `code: ${detailed.code}` : null,
            `message: ${detailed.message}`,
            detailed.details ? `details: ${detailed.details}` : null,
            detailed.hint ? `hint: ${detailed.hint}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          return noStoreJson(
            {
              error: formatted,
              message: detailed.message,
              code: detailed.code,
              details: detailed.details,
              hint: detailed.hint,
              supabaseError: detailed,
              cloudLicenseSyncOk: false,
              cloudLicenseError: formatted,
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
