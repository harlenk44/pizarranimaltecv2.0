import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  KeyRound,
  ShieldAlert,
  Tv,
  Settings,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  type AppSettings,
  type ClientLicense,
  type Game,
  type Result,
  parseGlobalSettingsFromMasterNotes,
  stripInternalMasterNotes,
} from "@/lib/types";
import { useBoardSettings } from "@/context/BoardSettingsContext";
import { mockStore, mergeGamesPreserveCustomLogos, mergeResultsPreserveToday } from "@/lib/mock-db";
import { mergeCustomGameLogosMap } from "@/lib/game-logos";
import { mergeTripleResultsPreserveToday, type TripleResult } from "@/lib/triples";
import { lotteryDate } from "@/lib/lottery-date";
import { isExternalSupabaseActive, supabase } from "@/integrations/supabase/client";
import {
  parseClientLicenseName,
  isLotteryPermitted,
  resolveEffectiveLicense,
  DEFAULT_CARDS_PER_SCREEN,
  DEFAULT_TRANSITION_SECONDS,
  LICENSE_CACHE_STORAGE_KEY,
  reconcileClientLicensesWithLocal,
  saveLocalLicensesSnapshot,
  type CardsPerScreenOption,
} from "@/lib/license-lotteries";
import {
  LicenseContext,
  ACTIVATED_PIN_STORAGE_KEY,
  getOrCreateDeviceId,
  type LicenseContextValue,
} from "@/context/LicenseContext";

function hasExternalSupabaseConfigured(): boolean {
  return isExternalSupabaseActive();
}

function mapSupabaseRowToClientLicense(d: Record<string, unknown>): ClientLicense {
  return {
    id: String(d["id"]),
    client_name: String(d["client_name"] || "Cliente"),
    pin_code: String(d["pin_code"] || ""),
    status: d["status"] === "paused" ? "paused" : "active",
    expires_at: d["expires_at"] ? new Date(d["expires_at"] as string).toISOString() : null,
    max_devices: Number(d["max_devices"]) || 1,
    bound_device_ids: Array.isArray(d["bound_device_ids"])
      ? (d["bound_device_ids"] as string[])
      : [],
    notes: typeof d["notes"] === "string" ? d["notes"] : "",
    created_at: d["created_at"]
      ? new Date(d["created_at"] as string).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Detects if the current instance is executing strictly within a development or
 * AI Studio sandbox preview environment.
 *
 * Strict security constraints:
 * - Native Android TV APKs, WebViews, Capacitor, or Cordova apps will ALWAYS return false.
 * - Packaged local files (file://) will ALWAYS return false.
 * - Custom production domains or client premises will ALWAYS return false.
 * - Only local development (localhost, 127.0.0.1) or official cloud preview hostnames return true.
 */
function isDevelopmentPreviewEnvironment(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Strict APK and native container rejection
  const win = window as unknown as {
    Android?: unknown;
    Capacitor?: unknown;
    cordova?: unknown;
  };
  if (win.Android || win.Capacitor || win.cordova) return false;
  if (window.location.protocol === "file:") return false;

  const ua = window.navigator?.userAgent || "";
  // Exclude embedded WebViews used in native agency TV APKs
  if (/\bwv\b/i.test(ua) || /Android.*Version\/[0-9]/i.test(ua)) {
    return false;
  }

  // 2. Localhost and development hostnames
  const hostname = window.location.hostname.toLowerCase();
  const isLocalDev =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local");

  // 3. AI Studio preview cloud runner hostnames
  const isAiStudioSandbox =
    hostname.includes(".run.app") ||
    hostname.includes(".googleusercontent.com") ||
    hostname.includes("aistudio") ||
    hostname.includes("webcontainer");

  if (isLocalDev || (import.meta.env.DEV && isLocalDev)) {
    return true;
  }

  if (isAiStudioSandbox) {
    return true;
  }

  return false;
}

interface LicenseGateProps {
  children: ReactNode;
  isAdmin: boolean;
  onAdminClick: () => void;
  forceClientPreview?: boolean;
  onExitPreview?: () => void;
}

export default function LicenseGate({
  children,
  isAdmin,
  onAdminClick,
  forceClientPreview = false,
  onExitPreview,
}: LicenseGateProps) {
  const { updateSettings } = useBoardSettings();
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [activatedPin, setActivatedPin] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      const saved = localStorage.getItem(ACTIVATED_PIN_STORAGE_KEY) || "";
      if (saved) return saved;

      // In development or preview sandbox, auto-apply the master PIN so the preview loads directly
      if (isDevelopmentPreviewEnvironment()) {
        try {
          localStorage.setItem(ACTIVATED_PIN_STORAGE_KEY, "291007");
        } catch {
          // ignore storage error
        }
        return "291007";
      }

      return "";
    } catch {
      return "";
    }
  });
  const [pinInput, setPinInput] = useState<string>(activatedPin);
  const [requireLicense, setRequireLicense] = useState<boolean>(true);
  const [licenses, setLicenses] = useState<ClientLicense[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(LICENSE_CACHE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.licenses)) {
          return reconcileClientLicensesWithLocal(parsed.licenses).licenses;
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [initialLoaded, setInitialLoaded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const cleanPin = activatedPin.trim();
    if (cleanPin === "291007") return true;
    if (cleanPin && licenses.some((l) => l.pin_code === cleanPin)) return true;
    return false;
  });
  const [checking, setChecking] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [adminBypass, setAdminBypass] = useState<boolean>(false);
  const [forceLicenseScreen, setForceLicenseScreen] = useState<boolean>(false);
  const [, setLogoClicks] = useState<number>(0);

  const handleSecretAdminAccess = () => {
    setLogoClicks((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        onAdminClick();
        return 0;
      }
      return next;
    });
  };

  const lastLicensesJsonRef = useRef<string>("");
  const lastBoardPayloadAtRef = useRef<number>(0);
  const syncVersionsRef = useRef<{ logos: number; games: number; images: number }>({
    logos: 1,
    games: 0,
    images: 0,
  });

  const applyIncomingLicensePayload = useCallback(
    (data: Record<string, unknown> | null, sbRows: unknown[] | null) => {
      if (data) {
        if (data["logosVersion"]) syncVersionsRef.current.logos = Number(data["logosVersion"]);
        if (data["gamesVersion"]) syncVersionsRef.current.games = Number(data["gamesVersion"]);
        if (data["imagesVersion"]) syncVersionsRef.current.images = Number(data["imagesVersion"]);
      }

      let nextRequire =
        data && typeof data["requireLicense"] === "boolean"
          ? (data["requireLicense"] as boolean)
          : true;
      let serverList: ClientLicense[] =
        data && Array.isArray(data["clientLicenses"])
          ? [...(data["clientLicenses"] as ClientLicense[])]
          : [];
      let latestGlobalSettings: Partial<AppSettings> | null =
        data?.["appSettings"] && typeof data["appSettings"] === "object"
          ? (data["appSettings"] as Partial<AppSettings>)
          : null;

      if (Array.isArray(sbRows) && sbRows.length > 0) {
        const mappedSb = sbRows.map((row) =>
          mapSupabaseRowToClientLicense(row as Record<string, unknown>),
        );
        const masterSb = mappedSb.find((l) => l.pin_code === "291007");
        if (masterSb?.notes?.includes("||REQUIRE:0")) {
          nextRequire = false;
        } else if (masterSb?.notes?.includes("||REQUIRE:1")) {
          nextRequire = true;
        }
        const masterNotesGlobalSettings = parseGlobalSettingsFromMasterNotes(masterSb?.notes);
        if (masterNotesGlobalSettings) {
          const masterTs = masterNotesGlobalSettings.updated_at
            ? new Date(masterNotesGlobalSettings.updated_at).getTime()
            : 0;
          const serverTs = latestGlobalSettings?.updated_at
            ? new Date(latestGlobalSettings.updated_at).getTime()
            : 0;
          if (!latestGlobalSettings || masterTs >= serverTs) {
            latestGlobalSettings = masterNotesGlobalSettings;
          }
        }
        const byPin = new Map<string, ClientLicense>();
        for (const l of serverList) {
          if (l.pin_code) byPin.set(l.pin_code, l);
        }
        for (const l of mappedSb) {
          const cleanNotes =
            l.pin_code === "291007"
              ? stripInternalMasterNotes(l.notes) || "PIN Maestro: 291007"
              : l.notes;
          if (l.pin_code) byPin.set(l.pin_code, { ...l, notes: cleanNotes });
        }
        serverList = Array.from(byPin.values());
      }

      if (latestGlobalSettings) {
        updateSettings(latestGlobalSettings);
      }

      const hasLicenseData =
        (data && Array.isArray(data["clientLicenses"])) ||
        (Array.isArray(sbRows) && sbRows.length > 0);
      if (hasLicenseData) {
        setRequireLicense((prev) => (prev === nextRequire ? prev : nextRequire));
        const reconciled = reconcileClientLicensesWithLocal(
          serverList,
          Array.isArray(data?.["deletedIds"]) ? (data?.["deletedIds"] as string[]) : undefined,
          Array.isArray(data?.["deletedPins"]) ? (data?.["deletedPins"] as string[]) : undefined,
          {
            allowOverrideServer: false,
            preserveLocalOnEphemeralServer: data?.["cloudLicenseConfigured"] === false,
          },
        );
        const nextJson = JSON.stringify(reconciled.licenses);
        if (lastLicensesJsonRef.current !== nextJson) {
          lastLicensesJsonRef.current = nextJson;
          setLicenses(reconciled.licenses);
        }
        saveLocalLicensesSnapshot(nextRequire, reconciled.licenses);
      }
    },
    [updateSettings],
  );

  const syncLicenseState = useCallback(
    async (force = false) => {
      if (!force && typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      // If BoardPage already synced within the last 45s, avoid redundant Cloudflare Worker invocation
      if (!force && Date.now() - lastBoardPayloadAtRef.current < 45_000) {
        if (hasExternalSupabaseConfigured()) {
          try {
            const r = await supabase.from("licenses").select("*");
            if (!r.error && Array.isArray(r.data) && r.data.length > 0) {
              applyIncomingLicensePayload(null, r.data);
            }
          } catch {
            // ignore
          }
        }
        return;
      }

      try {
        const sbRows = hasExternalSupabaseConfigured()
          ? await Promise.resolve(supabase.from("licenses").select("*"))
              .then((r) => (!r.error && Array.isArray(r.data) ? r.data : null))
              .catch(() => null)
          : null;

        // When direct Supabase returned licenses cleanly, skip calling Cloudflare Worker (0 Worker invocations!)
        if (sbRows && sbRows.length > 0) {
          applyIncomingLicensePayload(null, sbRows);
          return;
        }

        const q = new URLSearchParams();
        q.set("includeLicenses", "1");
        if (!force) {
          q.set("poll", "1");
        }
        if (syncVersionsRef.current.logos) {
          q.set("logosVersion", String(syncVersionsRef.current.logos));
        }
        if (syncVersionsRef.current.games) {
          q.set("gamesVersion", String(syncVersionsRef.current.games));
        }
        if (syncVersionsRef.current.images) {
          q.set("imagesVersion", String(syncVersionsRef.current.images));
        }

        const res = await fetch(
          `/api/public/results/sync?${q.toString()}`,
          force ? { cache: "no-store" } : undefined,
        ).catch(() => null);

        const data = res && res.ok ? await res.json() : null;
        if (data?.customGameLogos && typeof data.customGameLogos === "object") {
          mergeCustomGameLogosMap(data.customGameLogos as Record<string, string>);
        }
        if (data && Array.isArray(data.games) && data.games.length > 0) {
          const serverGames = data.games as Game[];
          const serverIds = new Set(serverGames.map((g) => g.id));
          const prunedLocal = mockStore.games.filter((g) => serverIds.has(g.id));
          mockStore.games = mergeGamesPreserveCustomLogos(prunedLocal, serverGames);
          try {
            localStorage.setItem("pizarra_persisted_games", JSON.stringify(mockStore.games));
          } catch {
            // ignore
          }
        }
        const todayDate = lotteryDate();
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          mockStore.results = mergeResultsPreserveToday(
            mockStore.results,
            data.results as Result[],
            todayDate,
          );
          try {
            localStorage.setItem("pizarra_mock_results", JSON.stringify(mockStore.results));
          } catch {
            // ignore
          }
        }
        if (data && Array.isArray(data.tripleResults) && data.tripleResults.length > 0) {
          try {
            const existingRaw = localStorage.getItem("pizarra_triple_results");
            const existingList = existingRaw ? (JSON.parse(existingRaw) as TripleResult[]) : [];
            const deletedTripleIds = Array.isArray(data.deletedTripleIds)
              ? (data.deletedTripleIds as string[])
              : [];
            const mergedTriples = mergeTripleResultsPreserveToday(
              Array.isArray(existingList) ? existingList : [],
              data.tripleResults as TripleResult[],
              todayDate,
              deletedTripleIds,
            );
            localStorage.setItem("pizarra_triple_results", JSON.stringify(mergedTriples));
          } catch {
            // ignore
          }
        }
        if (data && typeof window !== "undefined") {
          (window as unknown as Record<string, unknown>)["__PIZARRA_LAST_SYNC_DATA__"] = data;
          window.dispatchEvent(new CustomEvent("pizarra:server-sync-payload", { detail: data }));
        }

        applyIncomingLicensePayload(data, sbRows);
      } catch {
        try {
          const raw = localStorage.getItem(LICENSE_CACHE_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.requireLicense === "boolean") {
              setRequireLicense((prev) =>
                prev === parsed.requireLicense ? prev : parsed.requireLicense,
              );
            }
            if (Array.isArray(parsed.licenses)) {
              const nextList = reconcileClientLicensesWithLocal(parsed.licenses).licenses;
              const nextJson = JSON.stringify(nextList);
              if (lastLicensesJsonRef.current !== nextJson) {
                lastLicensesJsonRef.current = nextJson;
                setLicenses(nextList);
              }
            }
          }
        } catch {
          // ignore
        }
      } finally {
        setInitialLoaded((prev) => (prev ? prev : true));
      }
    },
    [applyIncomingLicensePayload],
  );

  useEffect(() => {
    void syncLicenseState(true);
    const timer = setInterval(() => {
      void syncLicenseState(false);
    }, 120_000);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("pizarra_lottery_channel");
      bc.onmessage = (event) => {
        if (
          event.data?.type === "LICENSES_UPDATED" ||
          event.data?.type === "APP_SETTINGS_UPDATED"
        ) {
          void syncLicenseState(true);
        }
      };
    } catch {
      // ignore
    }
    const handleLocalLicenseEvent = () => {
      void syncLicenseState(true);
    };
    const handleServerSyncFromBoard = (ev: Event) => {
      const payload = (ev as CustomEvent<Record<string, unknown>>).detail;
      if (payload && payload["__fromBoardPage"] === true) {
        lastBoardPayloadAtRef.current = Date.now();
        applyIncomingLicensePayload(payload, null);
      }
    };
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void syncLicenseState(false);
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === LICENSE_CACHE_STORAGE_KEY ||
        e.key === "pizarra_license_overrides_v3" ||
        e.key === "pizarra_client_licenses_cache_v2"
      ) {
        void syncLicenseState(true);
      }
    };
    window.addEventListener("pizarra:licenses-updated", handleLocalLicenseEvent);
    window.addEventListener("pizarra:server-sync-payload", handleServerSyncFromBoard);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(timer);
      bc?.close();
      window.removeEventListener("pizarra:licenses-updated", handleLocalLicenseEvent);
      window.removeEventListener("pizarra:server-sync-payload", handleServerSyncFromBoard);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [applyIncomingLicensePayload, syncLicenseState]);

  // Listen for custom event when user clicks "Licencia" button on the board header to open PIN screen
  useEffect(() => {
    const handleOpenLicenseModal = () => {
      try {
        localStorage.removeItem(ACTIVATED_PIN_STORAGE_KEY);
      } catch {
        // ignore
      }
      setActivatedPin("");
      setAdminBypass(false);
      setForceLicenseScreen(true);
    };
    window.addEventListener("pizarra:open-license-screen", handleOpenLicenseModal);
    return () => window.removeEventListener("pizarra:open-license-screen", handleOpenLicenseModal);
  }, []);

  // Check if current activatedPin is valid
  const matchedLicense = activatedPin
    ? licenses.find((l) => l.pin_code === activatedPin.trim())
    : undefined;

  const isExpired = matchedLicense?.expires_at
    ? new Date(matchedLicense.expires_at) < new Date()
    : false;
  const isPaused = matchedLicense?.status === "paused";
  const isDeviceAllowed = matchedLicense
    ? matchedLicense.bound_device_ids.includes(deviceId) ||
      matchedLicense.bound_device_ids.length < (matchedLicense.max_devices || 1)
    : false;

  const isMasterPin = activatedPin.trim() === "291007";
  const isAuthorized = Boolean(
    isMasterPin || (matchedLicense && !isExpired && !isPaused && isDeviceAllowed),
  );

  // Strict per-PIN license resolution: saving or editing one client license MUST NEVER
  // hijack Master PIN (291007), admin bypass, unlocked boards, or another client's PIN.
  const effectiveLicense = resolveEffectiveLicense({
    licenses,
    activatedPin,
    requireLicense,
    adminBypass,
  });

  const effectiveClientName = effectiveLicense?.client_name ?? "";
  const parsedLicenseInfo = useMemo(
    () => (effectiveClientName ? parseClientLicenseName(effectiveClientName) : null),
    [effectiveClientName],
  );
  const allowedLotteries = parsedLicenseInfo?.allowedLotteries ?? null;
  const cardsPerScreen: CardsPerScreenOption =
    parsedLicenseInfo?.cardsPerScreen ?? DEFAULT_CARDS_PER_SCREEN;
  const transitionSeconds: number =
    parsedLicenseInfo?.transitionSeconds ?? DEFAULT_TRANSITION_SECONDS;
  const voiceConfig = parsedLicenseInfo?.voiceConfig ?? null;
  const designConfig = parsedLicenseInfo?.designConfig ?? null;
  const fullscreenAuto = parsedLicenseInfo?.fullscreenAuto ?? false;

  const isGameAllowed = useCallback(
    (gameIdOrSlug?: string | null, fallbackName?: string | null) => {
      return isLotteryPermitted(gameIdOrSlug, allowedLotteries, fallbackName);
    },
    [allowedLotteries],
  );

  const licenseContextValue = useMemo<LicenseContextValue>(
    () => ({
      matchedLicense,
      isAuthorized,
      allowedLotteries,
      cardsPerScreen,
      transitionSeconds,
      voiceConfig,
      designConfig,
      fullscreenAuto,
      isGameAllowed,
    }),
    [
      matchedLicense,
      isAuthorized,
      allowedLotteries,
      cardsPerScreen,
      transitionSeconds,
      voiceConfig,
      designConfig,
      fullscreenAuto,
      isGameAllowed,
    ],
  );

  // If device has a valid saved PIN but isn't listed in bound_device_ids yet, register it automatically
  useEffect(() => {
    if (
      matchedLicense &&
      isAuthorized &&
      !matchedLicense.bound_device_ids.includes(deviceId) &&
      !forceClientPreview
    ) {
      fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseAction: {
            type: "activate_pin",
            pin_code: matchedLicense.pin_code,
            device_id: deviceId,
            fallbackLicense: matchedLicense,
          },
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.clientLicenses)) {
            const reconciled = reconcileClientLicensesWithLocal(
              data.clientLicenses,
              data.deletedIds,
              data.deletedPins,
              { allowOverrideServer: false },
            );
            setLicenses(reconciled.licenses);
          }
        })
        .catch(() => {});
    }
  }, [matchedLicense, isAuthorized, deviceId, forceClientPreview]);

  if (!initialLoaded && !forceClientPreview) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 gap-2 text-sm">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span>Verificando licencia de pantalla...</span>
      </div>
    );
  }

  // Show the live board only if:
  // 1. Not forced to license screen AND
  // 2. Not in preview mode AND
  // 3. Either requireLicense is turned off, OR a valid PIN is activated on this screen, OR admin clicked explicit bypass
  if (
    !forceLicenseScreen &&
    !forceClientPreview &&
    (!requireLicense || isAuthorized || (isAdmin && adminBypass))
  ) {
    return (
      <LicenseContext.Provider value={licenseContextValue}>{children}</LicenseContext.Provider>
    );
  }

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pinInput.replace(/[^0-9]/g, "").slice(0, 6);
    if (cleanPin.length < 4) {
      setErrorMsg("Ingrese un código PIN válido de 6 dígitos.");
      return;
    }

    setChecking(true);
    setErrorMsg("");

    if (cleanPin === "291007") {
      setActivatedPin("291007");
      setForceLicenseScreen(false);
      try {
        localStorage.setItem(ACTIVATED_PIN_STORAGE_KEY, "291007");
      } catch {
        // ignore
      }
      setChecking(false);
      if (onExitPreview) onExitPreview();
      fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseAction: {
            type: "activate_pin",
            pin_code: "291007",
            device_id: deviceId,
          },
        }),
      }).catch(() => {});
      return;
    }

    try {
      let localCandidate = licenses.find((l) => l.pin_code === cleanPin);

      // Check Supabase directly when external Supabase is configured so new PINs work even across cold Cloudflare isolates
      let supabaseDirectMatch: ClientLicense | null = null;
      if (hasExternalSupabaseConfigured()) {
        try {
          const { data: sbRow, error: sbErr } = await supabase
            .from("licenses")
            .select("*")
            .eq("pin_code", cleanPin)
            .maybeSingle();
          if (!sbErr && sbRow) {
            supabaseDirectMatch = mapSupabaseRowToClientLicense(sbRow as Record<string, unknown>);
            if (!localCandidate) {
              localCandidate = supabaseDirectMatch;
            }
          }
        } catch {
          // ignore and let server route handle
        }
      }

      const res = await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseAction: {
            type: "activate_pin",
            pin_code: cleanPin,
            device_id: deviceId,
            ...(localCandidate ? { fallbackLicense: localCandidate } : {}),
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.clientLicenses)) {
          const baseList = supabaseDirectMatch
            ? [
                supabaseDirectMatch,
                ...(data.clientLicenses as ClientLicense[]).filter(
                  (l) => l.pin_code !== cleanPin && l.id !== supabaseDirectMatch!.id,
                ),
              ]
            : data.clientLicenses;
          const reconciled = reconcileClientLicensesWithLocal(
            baseList,
            data.deletedIds,
            data.deletedPins,
            { allowOverrideServer: false },
          );
          lastLicensesJsonRef.current = JSON.stringify(reconciled.licenses);
          setLicenses(reconciled.licenses);
          saveLocalLicensesSnapshot(requireLicense, reconciled.licenses);
        }
        if (data.licenseActivation?.valid) {
          setActivatedPin(cleanPin);
          setForceLicenseScreen(false);
          try {
            localStorage.setItem(ACTIVATED_PIN_STORAGE_KEY, cleanPin);
          } catch {
            // ignore
          }
          setErrorMsg("");
          if (onExitPreview) onExitPreview();
        } else if (supabaseDirectMatch) {
          // Validate directly against the live Supabase record if Worker isolate lacked it
          const isMatchExpired = supabaseDirectMatch.expires_at
            ? new Date(supabaseDirectMatch.expires_at) < new Date()
            : false;
          const isMatchPaused = supabaseDirectMatch.status === "paused";
          const alreadyBound = supabaseDirectMatch.bound_device_ids.includes(deviceId);
          const canBind =
            alreadyBound ||
            supabaseDirectMatch.bound_device_ids.length < (supabaseDirectMatch.max_devices || 1);

          if (isMatchPaused) {
            setErrorMsg("Esta licencia se encuentra suspendida temporalmente.");
          } else if (isMatchExpired) {
            setErrorMsg("Su suscripción ha vencido. Contacte al administrador para renovar.");
          } else if (!canBind) {
            setErrorMsg(
              `Este PIN ya está en uso en el máximo de pantallas permitidas (${supabaseDirectMatch.max_devices}). Solicite liberar la pantalla anterior.`,
            );
          } else {
            const nextBound = alreadyBound
              ? supabaseDirectMatch.bound_device_ids
              : [...supabaseDirectMatch.bound_device_ids, deviceId];
            const activatedRecord: ClientLicense = {
              ...supabaseDirectMatch,
              bound_device_ids: nextBound,
            };
            if (!alreadyBound) {
              void supabase
                .from("licenses")
                .update({ bound_device_ids: nextBound })
                .eq("id", supabaseDirectMatch.id)
                .then(
                  () => {},
                  () => {},
                );
            }
            const merged = [
              activatedRecord,
              ...licenses.filter((l) => l.pin_code !== cleanPin && l.id !== activatedRecord.id),
            ];
            lastLicensesJsonRef.current = JSON.stringify(merged);
            setLicenses(merged);
            saveLocalLicensesSnapshot(requireLicense, merged);
            setActivatedPin(cleanPin);
            setForceLicenseScreen(false);
            try {
              localStorage.setItem(ACTIVATED_PIN_STORAGE_KEY, cleanPin);
            } catch {
              // ignore
            }
            setErrorMsg("");
            if (onExitPreview) onExitPreview();
          }
        } else {
          setErrorMsg(
            data.licenseActivation?.reason || "No se pudo validar el PIN. Verifique con soporte.",
          );
        }
      } else {
        setErrorMsg("Error de conexión al validar el PIN.");
      }
    } catch {
      setErrorMsg("Error de red al validar la licencia.");
    } finally {
      setChecking(false);
    }
  };

  let statusHeading = "Activación de Licencia de Pizarra";
  let statusDescription =
    "Ingrese el código PIN de 6 dígitos asignado a su agencia para activar y mostrar la pizarra en vivo.";

  if (matchedLicense && isExpired) {
    statusHeading = "Suscripción Vencida";
    statusDescription = `La licencia de "${matchedLicense.client_name}" ha vencido. Contacte al administrador para renovar su servicio.`;
  } else if (matchedLicense && isPaused) {
    statusHeading = "Servicio Suspendido Temporalmente";
    statusDescription = `La licencia de "${matchedLicense.client_name}" se encuentra en pausa. Comuníquese con administración para reactivarla.`;
  } else if (matchedLicense && !isDeviceAllowed) {
    statusHeading = "Límite de Pantallas Alcanzado";
    statusDescription = `Este PIN ya está vinculado a otra pantalla (${matchedLicense.max_devices} máx.). Solicite al administrador liberar el televisor.`;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 select-none">
      {/* Top Bar */}
      <header className="flex items-center justify-between max-w-5xl w-full mx-auto">
        <div
          onClick={handleSecretAdminAccess}
          className="flex items-center gap-2.5 cursor-default select-none"
          title=""
        >
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <span className="text-sm font-black tracking-tight text-white uppercase">
              Pizarra Animaltec
            </span>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums">
              ID de Pantalla: {deviceId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && !onExitPreview && (
            <button
              type="button"
              onClick={() => {
                setForceLicenseScreen(false);
                setAdminBypass(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-950/60 border border-emerald-700/60 hover:bg-emerald-900/60 text-xs text-emerald-300 font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Ver Pizarra (Modo Admin)</span>
            </button>
          )}
          {(isAdmin || onExitPreview) && (
            <button
              type="button"
              onClick={onExitPreview ?? onAdminClick}
              className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 font-semibold transition flex items-center gap-2 cursor-pointer"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>{onExitPreview ? "Cerrar Vista Previa" : "Panel de Administración"}</span>
            </button>
          )}
        </div>
      </header>

      {/* Center Lock / Activation Card */}
      <main className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center justify-center mb-5">
            {matchedLicense && (isExpired || isPaused || !isDeviceAllowed) ? (
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <ShieldAlert className="w-7 h-7" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-blue-500/15 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <KeyRound className="w-7 h-7" />
              </div>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-center text-white tracking-tight">
            {statusHeading}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 text-center mt-2 leading-relaxed">
            {statusDescription}
          </p>

          <form onSubmit={handleActivate} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="license-pin-input"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 text-center"
              >
                Código PIN de Licencia (6 Dígitos)
              </label>
              <input
                id="license-pin-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full bg-slate-950 border-2 border-slate-800 focus:border-blue-500 rounded-xl px-4 py-3.5 text-center text-2xl sm:text-3xl font-mono font-black tracking-[0.35em] text-white tabular-nums focus:outline-none transition"
              />
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-800/60 text-xs text-red-300 text-center font-medium">
                {errorMsg}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="submit"
                disabled={checking}
                className="flex-1 py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                {checking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Activar Licencia en Pantalla</span>
              </button>

              {activatedPin && (
                <button
                  type="button"
                  onClick={syncLicenseState}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Verificar si su renovación ya fue procesada"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Verificar Estado</span>
                </button>
              )}
            </div>
          </form>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="text-center text-[11px] text-slate-600 font-mono">
        Sistema de Control de Licencias · Pizarra Animaltec
      </footer>
    </div>
  );
}
