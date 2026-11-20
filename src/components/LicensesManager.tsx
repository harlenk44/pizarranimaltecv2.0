import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  Tv,
  Trash2,
  ShieldCheck,
  ShieldOff,
  CalendarPlus,
  Loader2,
  Share2,
  Eye,
  ListFilter,
  LayoutGrid,
  Clock,
  CheckSquare,
  Square,
  X,
  Volume2,
  VolumeX,
  Sparkles,
  Maximize,
  Minimize,
  AlertTriangle,
} from "lucide-react";
import type { ClientLicense } from "@/lib/types";
import LicenseGate from "@/components/LicenseGate";
import {
  parseClientLicenseName,
  formatClientLicenseName,
  ALL_AVAILABLE_LOTTERIES,
  DEFAULT_ANIMAL_LOTTERIES,
  ALL_TRIPLE_LOTTERIES,
  DEFAULT_CARDS_PER_SCREEN,
  PRODUCTS_PER_SCREEN_OPTIONS,
  DEFAULT_TRANSITION_SECONDS,
  TRANSITION_SECONDS_OPTIONS,
  DEFAULT_CLIENT_VOICE_CONFIG,
  saveLocalLicenseOverride,
  removeLocalLicenseOverride,
  saveLocalLicensesSnapshot,
  reconcileClientLicensesWithLocal,
  generateLicenseUuid,
  toSupabaseLicenseUuid,
  isValidUuid,
  type CardsPerScreenOption,
  type ClientVoiceConfig,
  type ClientDesignConfig,
} from "@/lib/license-lotteries";

function generateRandomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getDaysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diffMs / 86400000);
}

function formatExpirationDate(expiresAt: string | null): string {
  if (!expiresAt) return "Ilimitado";
  try {
    return new Date(expiresAt).toLocaleDateString("es-VE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return expiresAt;
  }
}

export default function LicensesManager() {
  const [licenses, setLicenses] = useState<ClientLicense[]>([]);
  const [requireLicense, setRequireLicense] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [previewClientScreen, setPreviewClientScreen] = useState<boolean>(false);
  const licensesRef = useRef<ClientLicense[]>([]);
  licensesRef.current = licenses;
  const requireLicenseRef = useRef<boolean>(false);
  requireLicenseRef.current = requireLicense;

  // New license form state
  const [showForm, setShowForm] = useState<boolean>(false);
  const [clientName, setClientName] = useState<string>("");
  const [pinCode, setPinCode] = useState<string>(() => generateRandomPin());
  const [durationDays, setDurationDays] = useState<string>("30");
  const [maxDevices, setMaxDevices] = useState<number>(1);
  const [notes, setNotes] = useState<string>("");
  const [extendDays, setExtendDays] = useState<Record<string, number>>({});
  const [formLotteries, setFormLotteries] = useState<string[]>(() =>
    ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
  );
  const [formCardsPerScreen, setFormCardsPerScreen] =
    useState<CardsPerScreenOption>(DEFAULT_CARDS_PER_SCREEN);
  const [formTransitionSeconds, setFormTransitionSeconds] = useState<number>(
    DEFAULT_TRANSITION_SECONDS,
  );
  const [formVoiceConfig, setFormVoiceConfig] = useState<ClientVoiceConfig>(
    DEFAULT_CLIENT_VOICE_CONFIG,
  );
  const [formCardStyle, setFormCardStyle] = useState<"global" | "neon" | "solid">("global");
  const [formFullscreenAuto, setFormFullscreenAuto] = useState<boolean>(false);

  // Edit lotteries, voice & design modal state
  const [editingLicense, setEditingLicense] = useState<ClientLicense | null>(null);
  const [editingLotteries, setEditingLotteries] = useState<string[]>([]);
  const [editingCardsPerScreen, setEditingCardsPerScreen] =
    useState<CardsPerScreenOption>(DEFAULT_CARDS_PER_SCREEN);
  const [editingTransitionSeconds, setEditingTransitionSeconds] = useState<number>(
    DEFAULT_TRANSITION_SECONDS,
  );
  const [editingVoiceConfig, setEditingVoiceConfig] = useState<ClientVoiceConfig>(
    DEFAULT_CLIENT_VOICE_CONFIG,
  );
  const [editingDesignConfig, setEditingDesignConfig] = useState<ClientDesignConfig>({});
  const [editingFullscreenAuto, setEditingFullscreenAuto] = useState<boolean>(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [cloudErrorAlert, setCloudErrorAlert] = useState<string | null>(null);
  const [modalCloudError, setModalCloudError] = useState<string | null>(null);
  const [cloudStorageMode, setCloudStorageMode] = useState<"supabase" | "local-memory" | null>(
    null,
  );
  const [workspaceFileActive, setWorkspaceFileActive] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => {
      setFeedbackMsg((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const fetchLicenses = useCallback(async () => {
    try {
      const res = await fetch("/api/public/results/sync", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const nextRequire =
          typeof data.requireLicense === "boolean"
            ? data.requireLicense
            : requireLicenseRef.current;
        if (typeof data.requireLicense === "boolean") {
          setRequireLicense(data.requireLicense);
        }

        let serverList: ClientLicense[] = Array.isArray(data.clientLicenses)
          ? data.clientLicenses
          : [];

        // If external Supabase is configured in browser and server list failed to reach Supabase, also merge direct admin query
        const sbUrl = import.meta.env["VITE_SUPABASE_URL"];
        const isActiveSupabaseUrl =
          typeof sbUrl === "string" &&
          sbUrl.includes(".supabase.co") &&
          !sbUrl.includes("ebpunrzbagmcdtammjqn.supabase.co") &&
          !sbUrl.includes("dqpomustswauzejggfui.supabase.co") &&
          !sbUrl.includes(".lovable.cloud");
        if (isActiveSupabaseUrl) {
          try {
            const { data: sbRows, error: sbErr } = await supabase.from("licenses").select("*");
            if (!sbErr && Array.isArray(sbRows) && sbRows.length > 0) {
              const mappedSb: ClientLicense[] = sbRows.map((d: Record<string, unknown>) => ({
                id: String(d["id"]),
                client_name: String(d["client_name"] || "Cliente"),
                pin_code: String(d["pin_code"] || ""),
                status: d["status"] === "paused" ? "paused" : "active",
                expires_at: d["expires_at"]
                  ? new Date(d["expires_at"] as string).toISOString()
                  : null,
                max_devices: Number(d["max_devices"]) || 1,
                bound_device_ids: Array.isArray(d["bound_device_ids"])
                  ? (d["bound_device_ids"] as string[])
                  : [],
                notes:
                  typeof d["notes"] === "string"
                    ? d["notes"].replace(/\|\|REQUIRE:[01]/g, "").trim()
                    : "",
                created_at: d["created_at"]
                  ? new Date(d["created_at"] as string).toISOString()
                  : new Date().toISOString(),
              }));
              const mapById = new Map<string, ClientLicense>();
              for (const l of serverList) mapById.set(l.id, l);
              for (const l of mappedSb) mapById.set(l.id, l);
              serverList = Array.from(mapById.values());
            }
          } catch {
            // ignore
          }
        }

        if (typeof data.cloudLicenseError === "string" && data.cloudLicenseError.trim()) {
          setCloudErrorAlert(data.cloudLicenseError);
        } else {
          setCloudErrorAlert(null);
        }
        if (
          data.cloudLicenseStorageMode === "supabase" ||
          data.cloudLicenseStorageMode === "local-memory"
        ) {
          setCloudStorageMode(data.cloudLicenseStorageMode);
        }
        if (typeof data.workspaceLicenseFileActive === "boolean") {
          setWorkspaceFileActive(data.workspaceLicenseFileActive);
        }

        const isEphemeralServer = data.cloudLicenseConfigured === false;
        const reconciled = reconcileClientLicensesWithLocal(
          serverList,
          data.deletedIds,
          data.deletedPins,
          { allowOverrideServer: true, preserveLocalOnEphemeralServer: isEphemeralServer },
        );
        let finalLicenses: ClientLicense[] = reconciled.licenses;

        if (!data.cloudLicenseError && reconciled.needsServerSync.length > 0) {
          try {
            const restoreRes = await fetch("/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseAction: {
                  type: "restore_batch",
                  licenses: reconciled.needsServerSync,
                },
              }),
            });
            if (restoreRes.ok) {
              const restoreData = await restoreRes.json();
              if (
                restoreData.cloudLicenseSyncOk === true &&
                Array.isArray(restoreData.clientLicenses)
              ) {
                finalLicenses = reconcileClientLicensesWithLocal(
                  restoreData.clientLicenses,
                  restoreData.deletedIds,
                  restoreData.deletedPins,
                  { allowOverrideServer: true, preserveLocalOnEphemeralServer: isEphemeralServer },
                ).licenses;
              }
            }
          } catch {
            // ignore
          }
        }

        saveLocalLicensesSnapshot(nextRequire, finalLicenses);
        setLicenses(finalLicenses);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLicenses();
  }, [fetchLicenses]);

  const broadcastLicenseChange = () => {
    try {
      const bc = new BroadcastChannel("pizarra_lottery_channel");
      bc.postMessage({ type: "LICENSES_UPDATED" });
      setTimeout(() => bc.close(), 1000);
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pizarra:licenses-updated"));
    }
  };

  const runLicenseAction = async (
    actionPayload: Record<string, unknown>,
    successText?: string,
  ): Promise<boolean> => {
    setSaving(true);
    const enrichedPayload: Record<string, unknown> = { ...actionPayload };
    let updatedSnapshot: ClientLicense | null = null;
    const currentReq = requireLicenseRef.current;
    const prevList = licensesRef.current;

    // Build payload snapshot ONLY in memory; do NOT persist to localStorage or UI until cloud confirms
    if (actionPayload.type === "create") {
      const daysVal = actionPayload.days as number | null | undefined;
      const expiresAt =
        typeof daysVal === "number" && daysVal > 0
          ? new Date(Date.now() + daysVal * 86400000).toISOString()
          : null;
      const newLic: ClientLicense = {
        id:
          typeof actionPayload.id === "string" && isValidUuid(actionPayload.id)
            ? actionPayload.id
            : generateLicenseUuid(),
        client_name: String(actionPayload.client_name || "Cliente").trim(),
        pin_code: String(actionPayload.pin_code || generateRandomPin()),
        status: "active",
        expires_at: expiresAt,
        max_devices: Math.max(1, Number(actionPayload.max_devices) || 1),
        bound_device_ids: [],
        notes: typeof actionPayload.notes === "string" ? actionPayload.notes : "",
        created_at: new Date().toISOString(),
      };
      enrichedPayload.id = newLic.id;
      enrichedPayload.pin_code = newLic.pin_code;
      enrichedPayload.license = newLic;
      updatedSnapshot = newLic;
    } else if (actionPayload.type === "toggle_status" && typeof actionPayload.id === "string") {
      const existing = prevList.find((l) => l.id === actionPayload.id);
      if (existing) {
        updatedSnapshot = {
          ...existing,
          status: existing.status === "active" ? ("paused" as const) : ("active" as const),
        };
        enrichedPayload.license = updatedSnapshot;
      }
    } else if (
      actionPayload.type === "update_lotteries" &&
      typeof actionPayload.id === "string" &&
      typeof actionPayload.client_name === "string"
    ) {
      const existing = prevList.find((l) => l.id === actionPayload.id);
      if (existing) {
        updatedSnapshot = {
          ...existing,
          client_name: actionPayload.client_name.trim(),
        };
        enrichedPayload.license = updatedSnapshot;
      }
    } else if (actionPayload.type === "renew" && typeof actionPayload.id === "string") {
      const existing = prevList.find((l) => l.id === actionPayload.id);
      if (existing) {
        const daysToAdd =
          actionPayload.days === null
            ? null
            : Math.max(1, Math.min(365, Number(actionPayload.days) || 30));
        const isStillActive =
          existing.expires_at && new Date(existing.expires_at).getTime() > Date.now();
        const baseDate =
          isStillActive && existing.expires_at ? new Date(existing.expires_at) : new Date();
        updatedSnapshot = {
          ...existing,
          status: "active",
          expires_at:
            daysToAdd === null
              ? null
              : new Date(baseDate.getTime() + daysToAdd * 86400000).toISOString(),
        };
        enrichedPayload.license = updatedSnapshot;
      }
    } else if (actionPayload.type === "reset_devices" && typeof actionPayload.id === "string") {
      const existing = prevList.find((l) => l.id === actionPayload.id);
      if (existing) {
        updatedSnapshot = { ...existing, bound_device_ids: [] };
        enrichedPayload.license = updatedSnapshot;
      }
    }

    // Direct Supabase write ONLY if external Supabase + real non-mock Supabase JWT session exists
    let directCloudOk = false;
    let directCloudError: string | null = null;
    let accessToken: string | null = null;
    const sbUrl = import.meta.env["VITE_SUPABASE_URL"];
    const isActiveSupabaseUrl =
      typeof sbUrl === "string" &&
      sbUrl.includes(".supabase.co") &&
      !sbUrl.includes("ebpunrzbagmcdtammjqn.supabase.co") &&
      !sbUrl.includes("dqpomustswauzejggfui.supabase.co") &&
      !sbUrl.includes(".lovable.cloud");
    if (isActiveSupabaseUrl) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const rawTok = sessionData.session?.access_token ?? null;
        if (rawTok && !rawTok.startsWith("mock-token-") && rawTok.split(".").length === 3) {
          accessToken = rawTok;
        }
        if (accessToken) {
          if (actionPayload.type === "delete" && typeof actionPayload.id === "string") {
            const targetToDelete = prevList.find((l) => l.id === actionPayload.id);
            const sbId = toSupabaseLicenseUuid(actionPayload.id, targetToDelete?.pin_code);
            const candidateIds = Array.from(
              new Set(
                [isValidUuid(actionPayload.id) ? actionPayload.id : null, sbId].filter(Boolean),
              ),
            ) as string[];
            for (const cid of candidateIds) {
              const { error: delErr } = await supabase.from("licenses").delete().eq("id", cid);
              if (delErr) directCloudError = delErr.message;
              else directCloudOk = true;
            }
            if (targetToDelete?.pin_code) {
              const { error: delPinErr } = await supabase
                .from("licenses")
                .delete()
                .eq("pin_code", targetToDelete.pin_code);
              if (!delPinErr) directCloudOk = true;
            }
          } else if (updatedSnapshot) {
            const snap: ClientLicense = updatedSnapshot;
            let targetSbId = toSupabaseLicenseUuid(snap.id, snap.pin_code);
            if (snap.pin_code) {
              const { data: existingByPin } = await supabase
                .from("licenses")
                .select("id")
                .eq("pin_code", snap.pin_code)
                .maybeSingle();
              if (existingByPin && typeof existingByPin.id === "string" && existingByPin.id) {
                targetSbId = existingByPin.id;
              }
            }
            const { data: upsertedRows, error: upsertErr } = await supabase
              .from("licenses")
              .upsert(
                {
                  id: targetSbId,
                  client_name: snap.client_name,
                  pin_code: snap.pin_code,
                  status: snap.status,
                  expires_at: snap.expires_at,
                  max_devices: snap.max_devices,
                  bound_device_ids: snap.bound_device_ids,
                  notes: snap.notes ?? "",
                  created_at: snap.created_at,
                },
                { onConflict: "id" },
              )
              .select("id");
            if (upsertErr) {
              directCloudError = upsertErr.message;
            } else if (Array.isArray(upsertedRows) && upsertedRows.length > 0) {
              directCloudOk = true;
              if (targetSbId !== snap.id) {
                updatedSnapshot = { ...snap, id: targetSbId };
                enrichedPayload.id = targetSbId;
                enrichedPayload.license = updatedSnapshot;
              }
            }
          }
        }
      } catch (err) {
        directCloudError = err instanceof Error ? err.message : String(err);
      }
    }

    try {
      const res = await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ licenseAction: enrichedPayload }),
      });

      const data = await res.json().catch(() => null);
      const serverCloudOk = Boolean(res.ok && data && data.cloudLicenseSyncOk === true);
      const persistedInCloud = serverCloudOk || directCloudOk;

      if (!persistedInCloud) {
        const exactError =
          (data && typeof data.cloudLicenseError === "string" && data.cloudLicenseError) ||
          (data && typeof data.error === "string" && data.error) ||
          directCloudError ||
          (!res.ok
            ? `Error HTTP ${res.status} al sincronizar la licencia con el servidor.`
            : "El servidor no confirmó el guardado en la nube (cloudLicenseSyncOk=false).");
        setCloudErrorAlert(exactError);
        setModalCloudError(exactError);
        return false;
      }

      setCloudErrorAlert(null);
      setModalCloudError(null);
      if (
        data &&
        (data.cloudLicenseStorageMode === "supabase" ||
          data.cloudLicenseStorageMode === "local-memory")
      ) {
        setCloudStorageMode(data.cloudLicenseStorageMode);
      }
      if (data && typeof data.workspaceLicenseFileActive === "boolean") {
        setWorkspaceFileActive(data.workspaceLicenseFileActive);
      }

      const nextRequire =
        data && typeof data.requireLicense === "boolean" ? data.requireLicense : currentReq;
      if (data && typeof data.requireLicense === "boolean") {
        setRequireLicense(data.requireLicense);
      }

      if (actionPayload.type === "delete" && typeof actionPayload.id === "string") {
        const targetToDelete = prevList.find((l) => l.id === actionPayload.id);
        try {
          removeLocalLicenseOverride(actionPayload.id, targetToDelete?.pin_code);
          const localDeletedRaw = localStorage.getItem("pizarra_deleted_licenses_v2");
          const localDeleted = localDeletedRaw
            ? JSON.parse(localDeletedRaw)
            : { ids: [], pins: [] };
          const ids = Array.isArray(localDeleted.ids) ? localDeleted.ids : [];
          const pins = Array.isArray(localDeleted.pins) ? localDeleted.pins : [];
          if (!ids.includes(actionPayload.id)) ids.push(actionPayload.id);
          if (targetToDelete?.pin_code && !pins.includes(targetToDelete.pin_code)) {
            pins.push(targetToDelete.pin_code);
          }
          localStorage.setItem("pizarra_deleted_licenses_v2", JSON.stringify({ ids, pins }));
        } catch {
          // ignore
        }
      }

      if (data && Array.isArray(data.clientLicenses)) {
        if (
          actionPayload.type === "create" ||
          actionPayload.type === "renew" ||
          actionPayload.type === "toggle_status" ||
          actionPayload.type === "update_lotteries" ||
          actionPayload.type === "reset_devices"
        ) {
          const targetPin =
            typeof enrichedPayload.pin_code === "string"
              ? enrichedPayload.pin_code
              : updatedSnapshot?.pin_code;
          const targetId =
            typeof enrichedPayload.id === "string" ? enrichedPayload.id : updatedSnapshot?.id;
          const confirmedLic = (data.clientLicenses as ClientLicense[]).find(
            (l) => (targetId && l.id === targetId) || (targetPin && l.pin_code === targetPin),
          );
          if (confirmedLic) {
            saveLocalLicenseOverride(confirmedLic);
          }
        }
        const reconciled = reconcileClientLicensesWithLocal(
          data.clientLicenses,
          data.deletedIds,
          data.deletedPins,
          {
            allowOverrideServer: true,
            preserveLocalOnEphemeralServer: data.cloudLicenseConfigured === false,
          },
        );
        setLicenses(reconciled.licenses);
        saveLocalLicensesSnapshot(nextRequire, reconciled.licenses);
        broadcastLicenseChange();
      } else if (directCloudOk) {
        await fetchLicenses();
        broadcastLicenseChange();
      }

      if (successText) {
        showToast(successText);
      }
      return true;
    } catch (err) {
      const netErr = err instanceof Error ? err.message : String(err);
      const exactError = `Error de red al guardar la licencia en la nube: ${netErr}`;
      setCloudErrorAlert(exactError);
      setModalCloudError(exactError);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleFormLottery = (id: string) => {
    setFormLotteries((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleEditingLottery = (id: string) => {
    setEditingLotteries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleOpenEditLotteries = (lic: ClientLicense) => {
    const {
      allowedLotteries,
      cardsPerScreen,
      transitionSeconds,
      voiceConfig,
      designConfig,
      fullscreenAuto,
    } = parseClientLicenseName(lic.client_name);
    setModalCloudError(null);
    setEditingLicense(lic);
    setEditingLotteries(
      allowedLotteries !== null ? [...allowedLotteries] : ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
    );
    setEditingCardsPerScreen(cardsPerScreen ?? DEFAULT_CARDS_PER_SCREEN);
    setEditingTransitionSeconds(transitionSeconds ?? DEFAULT_TRANSITION_SECONDS);
    setEditingVoiceConfig(voiceConfig ?? DEFAULT_CLIENT_VOICE_CONFIG);
    setEditingDesignConfig(designConfig ?? {});
    setEditingFullscreenAuto(Boolean(fullscreenAuto));
  };

  const handleSaveEditLotteries = async () => {
    if (!editingLicense) return;
    const { cleanName } = parseClientLicenseName(editingLicense.client_name);
    const packedName = formatClientLicenseName(
      cleanName,
      editingLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      editingCardsPerScreen,
      editingTransitionSeconds,
      editingVoiceConfig,
      editingDesignConfig,
      editingFullscreenAuto,
    );
    const cardsLabel =
      editingCardsPerScreen === "TODAS" ? "Todas" : `${editingCardsPerScreen} por pantalla`;
    const voiceLabel = editingVoiceConfig.enabled ? "Voz Activa" : "Voz Silenciada";
    const fsLabel = editingFullscreenAuto ? "Pantalla Completa AUTO" : "Pantalla Normal";
    const ok = await runLicenseAction(
      {
        type: "update_lotteries",
        id: editingLicense.id,
        client_name: packedName,
      },
      `Configuración actualizada para ${cleanName} (${editingLotteries.length}/${ALL_AVAILABLE_LOTTERIES.length} loterías · ${cardsLabel} · ${voiceLabel} · ${fsLabel})`,
    );
    if (ok) {
      setEditingLicense(null);
      setModalCloudError(null);
    }
  };

  const handleQuickChangeCardsPerScreen = async (
    lic: ClientLicense,
    newCards: CardsPerScreenOption,
  ) => {
    const {
      cleanName,
      allowedLotteries,
      transitionSeconds,
      voiceConfig,
      designConfig,
      fullscreenAuto,
    } = parseClientLicenseName(lic.client_name);
    const packedName = formatClientLicenseName(
      cleanName,
      allowedLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      newCards,
      transitionSeconds,
      voiceConfig,
      designConfig,
      fullscreenAuto,
    );
    const cardsLabel = newCards === "TODAS" ? "Todas" : `${newCards} productos por pantalla`;
    await runLicenseAction(
      {
        type: "update_lotteries",
        id: lic.id,
        client_name: packedName,
      },
      `${cleanName}: configurado a ${cardsLabel}`,
    );
  };

  const handleQuickChangeTransitionSeconds = async (lic: ClientLicense, newSeconds: number) => {
    const {
      cleanName,
      allowedLotteries,
      cardsPerScreen,
      voiceConfig,
      designConfig,
      fullscreenAuto,
    } = parseClientLicenseName(lic.client_name);
    const packedName = formatClientLicenseName(
      cleanName,
      allowedLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      cardsPerScreen,
      newSeconds,
      voiceConfig,
      designConfig,
      fullscreenAuto,
    );
    await runLicenseAction(
      {
        type: "update_lotteries",
        id: lic.id,
        client_name: packedName,
      },
      `${cleanName}: tiempo de transición configurado a ${newSeconds}s`,
    );
  };

  const handleQuickToggleVoice = async (lic: ClientLicense) => {
    const {
      cleanName,
      allowedLotteries,
      cardsPerScreen,
      transitionSeconds,
      voiceConfig,
      designConfig,
      fullscreenAuto,
    } = parseClientLicenseName(lic.client_name);
    const nextVoice: ClientVoiceConfig = {
      ...(voiceConfig ?? DEFAULT_CLIENT_VOICE_CONFIG),
      enabled: !(voiceConfig?.enabled ?? true),
    };
    const packedName = formatClientLicenseName(
      cleanName,
      allowedLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      cardsPerScreen,
      transitionSeconds,
      nextVoice,
      designConfig,
      fullscreenAuto,
    );
    await runLicenseAction(
      {
        type: "update_lotteries",
        id: lic.id,
        client_name: packedName,
      },
      `${cleanName}: locución de voz ${nextVoice.enabled ? "ACTIVADA" : "DESACTIVADA"}`,
    );
  };

  const handleQuickToggleFullscreen = async (lic: ClientLicense) => {
    const {
      cleanName,
      allowedLotteries,
      cardsPerScreen,
      transitionSeconds,
      voiceConfig,
      designConfig,
      fullscreenAuto,
    } = parseClientLicenseName(lic.client_name);
    const nextFullscreen = !fullscreenAuto;
    const packedName = formatClientLicenseName(
      cleanName,
      allowedLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      cardsPerScreen,
      transitionSeconds,
      voiceConfig,
      designConfig,
      nextFullscreen,
    );
    await runLicenseAction(
      {
        type: "update_lotteries",
        id: lic.id,
        client_name: packedName,
      },
      `${cleanName}: pantalla completa automática (APK/TV) ${nextFullscreen ? "ACTIVADA" : "DESACTIVADA"}`,
    );
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    const days =
      durationDays === "unlimited" ? null : Math.max(1, Math.min(30, Number(durationDays) || 30));

    const initialDesign: ClientDesignConfig | null =
      formCardStyle === "global" ? null : { card_style: formCardStyle };

    const packedName = formatClientLicenseName(
      clientName.trim(),
      formLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      formCardsPerScreen,
      formTransitionSeconds,
      formVoiceConfig,
      initialDesign,
      formFullscreenAuto,
    );

    const cardsLabel =
      formCardsPerScreen === "TODAS" ? "Todas" : `${formCardsPerScreen} por pantalla`;

    const cleanPin = pinCode.replace(/[^0-9]/g, "").slice(0, 6) || generateRandomPin();
    const newId = generateLicenseUuid();

    const ok = await runLicenseAction(
      {
        type: "create",
        id: newId,
        client_name: packedName,
        pin_code: cleanPin,
        days,
        max_devices: maxDevices,
        notes: notes.trim(),
      },
      `Licencia creada para ${clientName.trim()} (${formLotteries.length}/${ALL_AVAILABLE_LOTTERIES.length} loterías · ${cardsLabel} · ${formTransitionSeconds}s rotación · ${days ? `${days} ${days === 1 ? "día" : "días"}` : "Permanente"})`,
    );
    if (ok) {
      setClientName("");
      setPinCode(generateRandomPin());
      setNotes("");
      setDurationDays("30");
      setFormLotteries(ALL_AVAILABLE_LOTTERIES.map((l) => l.id));
      setFormCardsPerScreen(DEFAULT_CARDS_PER_SCREEN);
      setFormTransitionSeconds(DEFAULT_TRANSITION_SECONDS);
      setFormVoiceConfig(DEFAULT_CLIENT_VOICE_CONFIG);
      setFormCardStyle("global");
      setFormFullscreenAuto(false);
      setShowForm(false);
    }
  };

  const handleCopyPin = (lic: ClientLicense) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(lic.pin_code).catch(() => {});
    }
    setCopiedId(`pin-${lic.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyWhatsAppMsg = (lic: ClientLicense) => {
    const expStr = lic.expires_at
      ? `Vence: ${formatExpirationDate(lic.expires_at)}`
      : "Licencia Permanente";
    const text = `Hola *${lic.client_name}*, tu código PIN de activación para *Pizarra Animaltec* es: *${lic.pin_code}* (${lic.max_devices} TV máx. · ${expStr}).`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(`wa-${lic.id}`);
    showToast("Mensaje copiado al portapapeles listo para pegar en WhatsApp");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeCount = licenses.filter((l) => {
    const rem = getDaysRemaining(l.expires_at);
    return l.status === "active" && (rem === null || rem > 0);
  }).length;

  const expiredOrPausedCount = licenses.length - activeCount;
  const totalBoundScreens = licenses.reduce(
    (acc, l) => acc + (Array.isArray(l.bound_device_ids) ? l.bound_device_ids.length : 0),
    0,
  );

  if (previewClientScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 overflow-auto">
        <LicenseGate
          isAdmin={false}
          forceClientPreview={true}
          onAdminClick={() => setPreviewClientScreen(false)}
          onExitPreview={() => {
            setPreviewClientScreen(false);
            fetchLicenses();
          }}
        >
          <div />
        </LicenseGate>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Banner & Master Switch */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <KeyRound className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              Control de Licencias y Activación por PIN
            </h2>
            <span
              className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded border ${
                requireLicense
                  ? "bg-emerald-950/60 text-emerald-400 border-emerald-700/60"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              {requireLicense ? "CANDADO ACTIVO" : "ACCESO LIBRE"}
            </span>
            {cloudStorageMode === "supabase" && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded border bg-emerald-950/50 text-emerald-300 border-emerald-700/50">
                NUBE ACTIVA: SUPABASE
              </span>
            )}
            {cloudStorageMode === "local-memory" && workspaceFileActive && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded border bg-blue-950/60 text-blue-300 border-blue-700/60">
                GUARDADO EN REPO: client_licenses.persisted.json
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Asigna un código PIN de 6 dígitos a cada cliente o agencia. Como administrador siempre
            entras directo a la pizarra; tus clientes verán la pantalla de PIN cuando el candado
            esté activo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setPreviewClientScreen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-2 cursor-pointer"
            title="Ver cómo le aparece la pantalla de bloqueo al cliente en su televisor"
          >
            <Eye className="w-4 h-4 text-blue-400" />
            <span>Ver Pantalla de Cliente</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() =>
              runLicenseAction(
                { type: "toggle_enforcement", requireLicense: !requireLicense },
                !requireLicense
                  ? "Protección por PIN activada en las pizarras"
                  : "Protección desactivada (Acceso libre a la pizarra)",
              )
            }
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
              requireLicense
                ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {requireLicense ? (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Exigir PIN en Pizarra: SÍ</span>
              </>
            ) : (
              <>
                <ShieldOff className="w-4 h-4 text-slate-400" />
                <span>Exigir PIN en Pizarra: NO</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Licencia / Cliente</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Total Clientes</div>
          <div className="text-2xl font-black text-white font-mono tabular-nums mt-1">
            {licenses.length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Licencias Activas</div>
          <div className="text-2xl font-black text-emerald-400 font-mono tabular-nums mt-1">
            {activeCount}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Pausadas o Vencidas</div>
          <div className="text-2xl font-black text-amber-400 font-mono tabular-nums mt-1">
            {expiredOrPausedCount}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium">Pantallas Conectadas</div>
          <div className="text-2xl font-black text-blue-400 font-mono tabular-nums mt-1">
            {totalBoundScreens}
          </div>
        </div>
      </div>

      {cloudStorageMode === "local-memory" && workspaceFileActive && !cloudErrorAlert && (
        <div
          role="status"
          className="bg-blue-950/60 border border-blue-500/60 text-blue-100 px-4 py-3 rounded-xl text-xs space-y-2 shadow-md"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 font-bold text-blue-300">
              <ShieldCheck className="w-4 h-4 shrink-0 text-blue-400" />
              <span>Preview local (AI Studio no sube cambios en tiempo de ejecución al Push)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const jsonPayload = JSON.stringify(
                  {
                    requireLicense,
                    licenses,
                    deletedIds: [],
                    deletedPins: [],
                  },
                  null,
                  2,
                );
                navigator.clipboard?.writeText(jsonPayload);
                showToast("JSON copiado. Pégalo en client_licenses.persisted.json en GitHub.");
              }}
              className="px-2.5 py-1 rounded-lg bg-blue-900/70 hover:bg-blue-800 border border-blue-600/60 text-blue-100 font-semibold text-[11px] flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar JSON para GitHub</span>
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-blue-100/90">
            Nota: los cambios hechos aquí en Preview se guardan solo en esta sesión (AI Studio no
            incluye archivos escritos en runtime al hacer Push a GitHub). En producción, configura{" "}
            <span className="font-mono font-semibold text-white">SUPABASE_URL</span> y{" "}
            <span className="font-mono font-semibold text-white">SUPABASE_KEY</span> en Cloudflare
            Pages para guardar en vivo en la tabla{" "}
            <span className="font-mono font-semibold text-white">licenses</span>.
          </p>
        </div>
      )}

      {cloudStorageMode === "local-memory" && !workspaceFileActive && !cloudErrorAlert && (
        <div
          role="status"
          className="bg-amber-950/70 border border-amber-500/60 text-amber-100 px-4 py-3 rounded-xl text-xs space-y-1.5 shadow-md"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Modo empaquetado local (sin Supabase conectado en Cloudflare Pages)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const jsonPayload = JSON.stringify(
                  {
                    requireLicense,
                    licenses,
                    deletedIds: [],
                    deletedPins: [],
                  },
                  null,
                  2,
                );
                navigator.clipboard?.writeText(jsonPayload);
                showToast("JSON copiado para client_licenses.persisted.json.");
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-900/70 hover:bg-amber-800 border border-amber-600/60 text-amber-100 font-semibold text-[11px] flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar JSON para GitHub</span>
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-100/90">
            En Cloudflare Pages ahora mismo solo persisten entre dispositivos las licencias
            guardadas en{" "}
            <span className="font-mono font-semibold text-white">
              client_licenses.persisted.json
            </span>
            . Para guardar en vivo en la tabla{" "}
            <span className="font-mono font-semibold text-white">licenses</span>, configura{" "}
            <span className="font-mono font-semibold text-white">SUPABASE_URL</span> y{" "}
            <span className="font-mono font-semibold text-white">SUPABASE_KEY</span> en Cloudflare
            Pages → Settings → Variables and Secrets.
          </p>
        </div>
      )}

      {cloudErrorAlert && (
        <div
          role="alert"
          className="bg-red-950/85 border border-red-500/70 text-red-100 px-4 py-3.5 rounded-xl text-xs space-y-1.5 shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-bold text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>Error de persistencia en la nube (guardado local bloqueado)</span>
            </div>
            <button
              type="button"
              onClick={() => setCloudErrorAlert(null)}
              className="text-red-300 hover:text-white text-xs font-bold shrink-0 cursor-pointer"
              aria-label="Cerrar alerta de error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-red-100 bg-red-950/90 border border-red-800/70 rounded-lg px-3 py-2 break-words">
            {cloudErrorAlert}
          </p>
        </div>
      )}

      {feedbackMsg && (
        <div className="bg-blue-950/60 border border-blue-700/60 text-blue-200 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-blue-400 hover:text-white text-xs font-bold ml-4"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Create License Form */}
      {showForm && (
        <form
          onSubmit={handleCreateLicense}
          className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white">Registrar Nuevo Cliente / Agencia</h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                Nombre del Cliente / Agencia
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ej: Agencia El Centro"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                Código PIN (6 dígitos)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono font-bold tracking-widest text-emerald-400 tabular-nums focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setPinCode(generateRandomPin())}
                  className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Generar otro PIN aleatorio"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs text-slate-400 font-medium">
                  Duración (1 a 30 Días)
                </label>
                <span className="text-[11px] font-mono font-bold text-emerald-400">
                  {durationDays === "unlimited"
                    ? "Permanente"
                    : `${durationDays} ${durationDays === "1" ? "día" : "días"}`}
                </span>
              </div>
              <div className="space-y-1.5">
                <select
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                >
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>
                      {d} {d === 1 ? "Día" : "Días"}{" "}
                      {d === 1
                        ? "· (Prueba 24h)"
                        : d === 7
                          ? "· (1 Semana)"
                          : d === 15
                            ? "· (Quincenal)"
                            : d === 30
                              ? "· (1 Mes Completo)"
                              : ""}
                    </option>
                  ))}
                  <option value="unlimited">Ilimitado / Permanente</option>
                </select>

                <div className="flex items-center gap-1 flex-wrap">
                  {[1, 3, 7, 15, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDurationDays(String(d))}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                        durationDays === String(d)
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDurationDays("unlimited")}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer ${
                      durationDays === "unlimited"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Ilim.
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                Pantallas (TVs) Permitidas
              </label>
              <select
                value={maxDevices}
                onChange={(e) => setMaxDevices(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono tabular-nums focus:outline-none focus:border-blue-500"
              >
                <option value={1}>1 Pantalla (TV)</option>
                <option value={2}>2 Pantallas (TVs)</option>
                <option value={3}>3 Pantallas (TVs)</option>
                <option value={5}>5 Pantallas (TVs)</option>
                <option value={10}>10 Pantallas (TVs)</option>
              </select>
            </div>
          </div>

          {/* Selector de Productos por Pantalla */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Productos por Pantalla (Tarjetas por Ventana)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Si eliges menos de 8 (ej. 2, 3 o 4), las tarjetas se expandirán automáticamente para
                ocupar toda la pantalla del TV con números e imágenes más grandes.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                aria-label="Productos por Pantalla"
                value={String(formCardsPerScreen)}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormCardsPerScreen(val === "TODAS" ? "TODAS" : Number(val));
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {PRODUCTS_PER_SCREEN_OPTIONS.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de Tiempo de Transición */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Tiempo de Transición por Ventana
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Velocidad de rotación automática entre páginas de productos (25 segundos por
                defecto).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                aria-label="Tiempo de Transición"
                value={String(formTransitionSeconds)}
                onChange={(e) => {
                  setFormTransitionSeconds(Number(e.target.value) || DEFAULT_TRANSITION_SECONDS);
                }}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-blue-400 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {TRANSITION_SECONDS_OPTIONS.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.value} segundos{" "}
                    {opt.value === DEFAULT_TRANSITION_SECONDS ? "(Por defecto)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Control de Voz y Estilo Visual para el Nuevo Cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {formVoiceConfig.enabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  )}
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Control de Voz por Usuario (PIN)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFormVoiceConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
                  }
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    formVoiceConfig.enabled
                      ? "bg-emerald-950/70 border-emerald-600/60 text-emerald-300"
                      : "bg-red-950/60 border-red-700/60 text-red-300"
                  }`}
                >
                  {formVoiceConfig.enabled ? "Locución: ACTIVA" : "Locución: DESACTIVADA"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={formVoiceConfig.engine}
                  onChange={(e) =>
                    setFormVoiceConfig((prev) => ({
                      ...prev,
                      engine: e.target.value as ClientVoiceConfig["engine"],
                    }))
                  }
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="agency_voice">Voz Agencia (Repetición)</option>
                  <option value="online_hd">Voz HD Corta de Radio</option>
                  <option value="browser">Voz Nativa Smart TV</option>
                </select>
                <select
                  value={String(formVoiceConfig.rate)}
                  onChange={(e) =>
                    setFormVoiceConfig((prev) => ({
                      ...prev,
                      rate: Number(e.target.value) || 0.98,
                    }))
                  }
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                >
                  <option value="0.9">Velocidad 0.90x (Pausada)</option>
                  <option value="0.98">Velocidad 0.98x (Normal)</option>
                  <option value="1.05">Velocidad 1.05x (Ágil)</option>
                  <option value="1.15">Velocidad 1.15x (Rápida)</option>
                </select>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Acabado Visual de Tarjetas (Neón vs. Sólido)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "global", label: "🌐 Global" },
                    { id: "neon", label: "⚡ Estilo Neón" },
                    { id: "solid", label: "🎨 Estilo Normal" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFormCardStyle(item.id)}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                      formCardStyle === item.id
                        ? "bg-blue-600/30 border-blue-400 text-white"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pantalla Completa Automática (APK Android / TV) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                {formFullscreenAuto ? (
                  <Maximize className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Minimize className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Pantalla Completa Automática (APK Android / Smart TV)
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Activa automáticamente el modo presentación a pantalla completa sin necesidad de
                buscar el botón en la APK o TV.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormFullscreenAuto((prev) => !prev)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition cursor-pointer shrink-0 ${
                formFullscreenAuto
                  ? "bg-cyan-950/70 border-cyan-500 text-cyan-300"
                  : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {formFullscreenAuto ? "📺 Pantalla Completa: ACTIVA" : "Vista Normal"}
            </button>
          </div>

          {/* Loterías Permitidas Selector */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Loterías Permitidas para esta Agencia
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-950 border border-blue-700/60 text-blue-300 font-semibold">
                  {formLotteries.length} de {ALL_AVAILABLE_LOTTERIES.length} activas
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFormLotteries(ALL_AVAILABLE_LOTTERIES.map((l) => l.id))}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition cursor-pointer"
                >
                  Marcar Todas
                </button>
                <button
                  type="button"
                  onClick={() => setFormLotteries([])}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  Desmarcar
                </button>
                <button
                  type="button"
                  onClick={() => setFormLotteries(DEFAULT_ANIMAL_LOTTERIES.map((l) => l.id))}
                  className="px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800/60 hover:bg-emerald-900/60 text-emerald-300 text-[11px] font-semibold transition cursor-pointer"
                >
                  Solo Animalitos
                </button>
                <button
                  type="button"
                  onClick={() => setFormLotteries(ALL_TRIPLE_LOTTERIES.map((l) => l.id))}
                  className="px-2 py-1 rounded bg-purple-950/60 border border-purple-800/60 hover:bg-purple-900/60 text-purple-300 text-[11px] font-semibold transition cursor-pointer"
                >
                  Solo Triples
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Animalitos Group */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Animalitos ({DEFAULT_ANIMAL_LOTTERIES.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = DEFAULT_ANIMAL_LOTTERIES.map((l) => l.id);
                      const allSelected = ids.every((id) => formLotteries.includes(id));
                      setFormLotteries((prev) =>
                        allSelected
                          ? prev.filter((id) => !ids.includes(id))
                          : Array.from(new Set([...prev, ...ids])),
                      );
                    }}
                    className="text-[10px] text-slate-400 hover:text-emerald-300 underline font-normal"
                  >
                    Alternar grupo
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DEFAULT_ANIMAL_LOTTERIES.map((lottery) => {
                    const isChecked = formLotteries.includes(lottery.id);
                    return (
                      <label
                        key={lottery.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                          isChecked
                            ? "bg-emerald-950/40 border-emerald-700/60 text-white font-medium"
                            : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleFormLottery(lottery.id)}
                          className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                        />
                        <span className="truncate">{lottery.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Triples Group */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Triples ({ALL_TRIPLE_LOTTERIES.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = ALL_TRIPLE_LOTTERIES.map((l) => l.id);
                      const allSelected = ids.every((id) => formLotteries.includes(id));
                      setFormLotteries((prev) =>
                        allSelected
                          ? prev.filter((id) => !ids.includes(id))
                          : Array.from(new Set([...prev, ...ids])),
                      );
                    }}
                    className="text-[10px] text-slate-400 hover:text-amber-300 underline font-normal"
                  >
                    Alternar grupo
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_TRIPLE_LOTTERIES.map((lottery) => {
                    const isChecked = formLotteries.includes(lottery.id);
                    return (
                      <label
                        key={lottery.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                          isChecked
                            ? "bg-amber-950/40 border-amber-700/60 text-white font-medium"
                            : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleFormLottery(lottery.id)}
                          className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                        />
                        <span className="truncate">{lottery.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {cloudErrorAlert && (
            <div
              role="alert"
              className="bg-red-950/90 border border-red-500/70 text-red-100 px-3.5 py-2.5 rounded-xl text-xs space-y-1"
            >
              <div className="flex items-center gap-2 font-bold text-red-300">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>No se pudo guardar en la nube (guardado local bloqueado)</span>
              </div>
              <p className="font-mono text-[11px] text-red-100 break-words">{cloudErrorAlert}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-4 pt-1">
            <div className="flex-1">
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                Nota o Teléfono (Opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: WhatsApp 0414-0000000 · Pago móvil mensual"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>Guardar y Generar PIN</span>
            </button>
          </div>
        </form>
      )}

      {/* Licenses Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando licencias...
          </div>
        ) : licenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No hay licencias creadas todavía. Haz clic en &ldquo;Nueva Licencia / Cliente&rdquo;
            para crear el primer PIN.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">Cliente / Agencia</th>
                  <th className="py-3.5 px-4">PIN de Activación</th>
                  <th className="py-3.5 px-4">Estado y Vencimiento</th>
                  <th className="py-3.5 px-4">Pantallas (TV)</th>
                  <th className="py-3.5 px-4 text-right">
                    Ampliar Tiempo (1 a 30 Días) y Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {licenses.map((lic) => {
                  const daysLeft = getDaysRemaining(lic.expires_at);
                  const isExpired = daysLeft !== null && daysLeft <= 0;
                  const isPaused = lic.status === "paused";
                  const boundCount = Array.isArray(lic.bound_device_ids)
                    ? lic.bound_device_ids.length
                    : 0;

                  const {
                    cleanName,
                    allowedLotteries,
                    cardsPerScreen,
                    transitionSeconds,
                    voiceConfig,
                    designConfig,
                    fullscreenAuto,
                  } = parseClientLicenseName(lic.client_name);
                  const isAll =
                    allowedLotteries === null ||
                    allowedLotteries.length >= ALL_AVAILABLE_LOTTERIES.length;
                  const totalAllowedCount =
                    allowedLotteries !== null
                      ? allowedLotteries.length
                      : ALL_AVAILABLE_LOTTERIES.length;
                  const cleanNotes = lic.notes
                    ? lic.notes.replace(/\|\|REQUIRE:[01]/g, "").trim()
                    : "";
                  const isVoiceOn = voiceConfig?.enabled ?? true;
                  const customCardStyle = designConfig?.card_style;

                  return (
                    <tr key={lic.id} className="hover:bg-slate-800/30 transition">
                      {/* Client Name & Notes */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{cleanName}</div>
                        {cleanNotes && (
                          <div className="text-xs text-slate-400 mt-0.5">{cleanNotes}</div>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              isAll
                                ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/50"
                                : totalAllowedCount === 0
                                  ? "bg-red-950/60 text-red-300 border-red-700/50"
                                  : "bg-blue-950/60 text-blue-300 border-blue-700/50"
                            }`}
                            title={
                              isAll
                                ? "Tiene acceso a todas las loterías"
                                : totalAllowedCount === 0
                                  ? "Ninguna lotería seleccionada"
                                  : `Loterías activas: ${allowedLotteries?.join(", ")}`
                            }
                          >
                            <ListFilter className="w-3 h-3" />
                            {isAll
                              ? `Todas (${ALL_AVAILABLE_LOTTERIES.length} loterías)`
                              : totalAllowedCount === 0
                                ? `0 de ${ALL_AVAILABLE_LOTTERIES.length} (Ninguna)`
                                : `${totalAllowedCount} de ${ALL_AVAILABLE_LOTTERIES.length} loterías`}
                          </span>

                          {/* Selector rápido de Productos por Pantalla en la fila */}
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border bg-purple-950/50 text-purple-300 border-purple-700/50">
                            <LayoutGrid className="w-3 h-3 text-purple-400" />
                            <select
                              aria-label={`Productos por pantalla para ${cleanName}`}
                              value={String(cardsPerScreen)}
                              disabled={saving}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleQuickChangeCardsPerScreen(
                                  lic,
                                  val === "TODAS" ? "TODAS" : Number(val),
                                );
                              }}
                              className="bg-transparent text-purple-200 font-mono font-bold text-[10px] focus:outline-none cursor-pointer"
                              title="Cambiar cantidad de productos por pantalla para esta licencia"
                            >
                              {[2, 3, 4, 6, 8, 9, 10, 12, "TODAS"].map((optVal) => (
                                <option
                                  key={String(optVal)}
                                  value={String(optVal)}
                                  className="bg-slate-900 text-white"
                                >
                                  {optVal === "TODAS" ? "Todas/pant." : `${optVal} prod./pant.`}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Selector rápido de Tiempo de Transición en la fila */}
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border bg-blue-950/50 text-blue-300 border-blue-700/50">
                            <Clock className="w-3 h-3 text-blue-400" />
                            <select
                              aria-label={`Tiempo de transición para ${cleanName}`}
                              value={String(transitionSeconds ?? DEFAULT_TRANSITION_SECONDS)}
                              disabled={saving}
                              onChange={(e) => {
                                const val = Number(e.target.value) || DEFAULT_TRANSITION_SECONDS;
                                handleQuickChangeTransitionSeconds(lic, val);
                              }}
                              className="bg-transparent text-blue-200 font-mono font-bold text-[10px] focus:outline-none cursor-pointer"
                              title="Cambiar tiempo de transición por ventana para esta licencia"
                            >
                              {TRANSITION_SECONDS_OPTIONS.map((opt) => (
                                <option
                                  key={String(opt.value)}
                                  value={String(opt.value)}
                                  className="bg-slate-900 text-white"
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Botón rápido de Voz por Usuario */}
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleQuickToggleVoice(lic)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                              isVoiceOn
                                ? "bg-emerald-950/50 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50"
                                : "bg-red-950/50 text-red-300 border-red-700/50 hover:bg-red-900/50"
                            }`}
                            title="Activar o desactivar la locución de voz para este cliente"
                          >
                            {isVoiceOn ? (
                              <Volume2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <VolumeX className="w-3 h-3 text-red-400" />
                            )}
                            <span>{isVoiceOn ? "Voz ON" : "Voz OFF"}</span>
                          </button>

                          {/* Botón rápido de Pantalla Completa Automática (APK/TV) */}
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleQuickToggleFullscreen(lic)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer ${
                              fullscreenAuto
                                ? "bg-cyan-950/60 text-cyan-300 border-cyan-600/60 hover:bg-cyan-900/50"
                                : "bg-slate-900/80 text-slate-400 border-slate-700/70 hover:text-slate-200 hover:bg-slate-800"
                            }`}
                            title="Activar o desactivar la pantalla completa automática en APK Android y TV para este usuario"
                          >
                            {fullscreenAuto ? (
                              <Maximize className="w-3 h-3 text-cyan-400" />
                            ) : (
                              <Minimize className="w-3 h-3 text-slate-400" />
                            )}
                            <span>{fullscreenAuto ? "Pant. Completa ON" : "Pant. Normal"}</span>
                          </button>

                          {customCardStyle && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border bg-amber-950/50 text-amber-300 border-amber-700/50">
                              <Sparkles className="w-3 h-3 text-amber-400" />
                              {customCardStyle === "neon" ? "Estilo Neón" : "Estilo Normal"}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenEditLotteries(lic)}
                            className="text-[10px] text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer"
                          >
                            Configurar
                          </button>
                        </div>
                      </td>

                      {/* PIN Code + Copy */}
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
                          <span className="font-mono font-black text-base tracking-widest text-blue-400 tabular-nums">
                            {lic.pin_code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPin(lic)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                            title="Copiar PIN"
                          >
                            {copiedId === `pin-${lic.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyWhatsAppMsg(lic)}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition"
                            title="Copiar mensaje listo para enviar por WhatsApp"
                          >
                            {copiedId === `wa-${lic.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Share2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Status & Expiration */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isPaused
                                ? "bg-amber-400"
                                : isExpired
                                  ? "bg-red-500"
                                  : "bg-emerald-400"
                            }`}
                          />
                          <span
                            className={`text-xs font-bold uppercase ${
                              isPaused
                                ? "text-amber-400"
                                : isExpired
                                  ? "text-red-400"
                                  : "text-emerald-400"
                            }`}
                          >
                            {isPaused ? "PAUSADO" : isExpired ? "VENCIDO" : "ACTIVO"}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                          {lic.expires_at === null ? (
                            "Sin vencimiento"
                          ) : isExpired ? (
                            `Venció hace ${Math.abs(daysLeft)}d (${formatExpirationDate(lic.expires_at)})`
                          ) : (
                            <>
                              Quedan <strong className="text-slate-200">{daysLeft}d</strong> ·{" "}
                              {formatExpirationDate(lic.expires_at)}
                            </>
                          )}
                        </div>
                      </td>

                      {/* Bound TVs */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-slate-200">
                          <Tv className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {boundCount} / {lic.max_devices || 1} TV
                          </span>
                        </div>
                        {boundCount > 0 && (
                          <div className="text-[11px] text-slate-500 font-mono truncate max-w-[140px]">
                            {lic.bound_device_ids.join(", ")}
                          </div>
                        )}
                      </td>

                      {/* Quick Actions & Extension */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-2 flex-wrap">
                          {/* Selector de 1 a 30 días + Botón Ampliar / + Días */}
                          <div className="inline-flex items-center gap-1 bg-slate-950 border border-emerald-600/60 rounded-lg p-1 shadow-sm">
                            <select
                              value={extendDays[lic.id] ?? 30}
                              onChange={(e) =>
                                setExtendDays((prev) => ({
                                  ...prev,
                                  [lic.id]: Number(e.target.value),
                                }))
                              }
                              className="bg-transparent text-emerald-400 font-mono font-bold text-xs px-1.5 py-1 focus:outline-none cursor-pointer"
                              title="Seleccionar días a sumar (1 a 30 días)"
                            >
                              {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                                <option
                                  key={d}
                                  value={d}
                                  className="bg-slate-900 text-white font-mono"
                                >
                                  +{d} {d === 1 ? "día" : "días"}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                const daysToAdd = extendDays[lic.id] ?? 30;
                                runLicenseAction(
                                  { type: "renew", id: lic.id, days: daysToAdd },
                                  `+${daysToAdd} ${daysToAdd === 1 ? "día sumado" : "días sumados"} a ${cleanName}`,
                                );
                              }}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              title="Sumar días sin perder los días restantes de la licencia"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>Ampliar / + Días</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleOpenEditLotteries(lic)}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-950/60 border border-blue-700/60 hover:bg-blue-900/60 text-blue-300 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                            title="Configurar qué loterías puede ver esta agencia"
                          >
                            <ListFilter className="w-3.5 h-3.5" />
                            <span>Loterías</span>
                          </button>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              runLicenseAction(
                                { type: "toggle_status", id: lic.id },
                                isPaused
                                  ? `Licencia de ${lic.client_name} reactivada`
                                  : `Licencia de ${lic.client_name} pausada`,
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                              isPaused
                                ? "bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30"
                                : "bg-amber-950/50 border border-amber-700/50 text-amber-300 hover:bg-amber-900/50"
                            }`}
                            title={isPaused ? "Reactivar servicio" : "Pausar servicio"}
                          >
                            {isPaused ? (
                              <>
                                <PlayCircle className="w-3.5 h-3.5" />
                                <span>Activar</span>
                              </>
                            ) : (
                              <>
                                <PauseCircle className="w-3.5 h-3.5" />
                                <span>Pausar</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            disabled={saving || boundCount === 0}
                            onClick={() =>
                              runLicenseAction(
                                { type: "reset_devices", id: lic.id },
                                `Pantallas liberadas para ${lic.client_name}`,
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-xs font-medium transition flex items-center gap-1 cursor-pointer"
                            title="Desvincular TV actual para permitir activar en otro televisor"
                          >
                            <Tv className="w-3.5 h-3.5" />
                            <span>Liberar TV</span>
                          </button>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              runLicenseAction(
                                { type: "delete", id: lic.id },
                                `Licencia de ${lic.client_name} eliminada`,
                              )
                            }
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-950/50 transition cursor-pointer"
                            title="Eliminar licencia"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para Editar Loterías Permitidas */}
      {editingLicense && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <ListFilter className="w-5 h-5 text-blue-400" />
                  <h3 className="text-base font-bold text-white">
                    Loterías Permitidas para{" "}
                    <span className="text-blue-400">
                      {parseClientLicenseName(editingLicense.client_name).cleanName}
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  PIN:{" "}
                  <span className="font-mono text-emerald-400 font-bold tracking-widest">
                    {editingLicense.pin_code}
                  </span>{" "}
                  · La pizarra y los anuncios de voz solo mostrarán las loterías marcadas aquí.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditingLicense(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector de Productos por Pantalla en el Modal */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Productos por Pantalla
                  </span>
                </div>
                <select
                  aria-label="Productos por Pantalla Modal"
                  value={String(editingCardsPerScreen)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingCardsPerScreen(val === "TODAS" ? "TODAS" : Number(val));
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-purple-300 focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  {PRODUCTS_PER_SCREEN_OPTIONS.map((opt) => (
                    <option key={String(opt.value)} value={String(opt.value)}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {([2, 3, 4, 6, 8, 9, 10, 12, "TODAS"] as CardsPerScreenOption[]).map((val) => {
                  const active = editingCardsPerScreen === val;
                  return (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setEditingCardsPerScreen(val)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition border cursor-pointer ${
                        active
                          ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800"
                      }`}
                    >
                      {val === "TODAS" ? "Todas" : `${val}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selector de Tiempo de Transición en el Modal */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Tiempo de Transición por Ventana
                  </span>
                </div>
                <select
                  aria-label="Tiempo de Transición Modal"
                  value={String(editingTransitionSeconds)}
                  onChange={(e) => {
                    setEditingTransitionSeconds(
                      Number(e.target.value) || DEFAULT_TRANSITION_SECONDS,
                    );
                  }}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-blue-300 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {TRANSITION_SECONDS_OPTIONS.map((opt) => (
                    <option key={String(opt.value)} value={String(opt.value)}>
                      {opt.value} segundos{" "}
                      {opt.value === DEFAULT_TRANSITION_SECONDS ? "(Por defecto)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {TRANSITION_SECONDS_OPTIONS.map((opt) => {
                  const active = editingTransitionSeconds === opt.value;
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setEditingTransitionSeconds(opt.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition border cursor-pointer ${
                        active
                          ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Control de Voz y Estilo de Tarjeta por Usuario en el Modal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {editingVoiceConfig.enabled ? (
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Voz de Sorteos (PIN)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingVoiceConfig((prev) => ({
                        ...prev,
                        enabled: !prev.enabled,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                      editingVoiceConfig.enabled
                        ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                        : "bg-red-950/60 border-red-700 text-red-300"
                    }`}
                  >
                    {editingVoiceConfig.enabled ? "🔊 Activa" : "🔇 Silenciada"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={editingVoiceConfig.engine}
                    onChange={(e) =>
                      setEditingVoiceConfig((prev) => ({
                        ...prev,
                        engine: e.target.value as ClientVoiceConfig["engine"],
                      }))
                    }
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="agency_voice">Voz Agencia</option>
                    <option value="online_hd">Voz HD Corta</option>
                    <option value="browser">Voz Nativa TV</option>
                  </select>
                  <select
                    value={String(editingVoiceConfig.rate)}
                    onChange={(e) =>
                      setEditingVoiceConfig((prev) => ({
                        ...prev,
                        rate: Number(e.target.value) || 0.98,
                      }))
                    }
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="0.9">0.90x (Pausada)</option>
                    <option value="0.98">0.98x (Normal)</option>
                    <option value="1.05">1.05x (Ágil)</option>
                    <option value="1.15">1.15x (Rápida)</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Estilo de Tarjeta (Neón vs. Sólido)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: undefined, label: "🌐 Global" },
                      { id: "neon", label: "⚡ Neón" },
                      { id: "solid", label: "🎨 Normal" },
                    ] as const
                  ).map((opt) => {
                    const active = editingDesignConfig.card_style === opt.id;
                    return (
                      <button
                        key={String(opt.id ?? "global")}
                        type="button"
                        onClick={() =>
                          setEditingDesignConfig((prev) => {
                            const next = { ...prev };
                            if (!opt.id) {
                              delete next.card_style;
                            } else {
                              next.card_style = opt.id;
                            }
                            return next;
                          })
                        }
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          active
                            ? "bg-amber-600/30 border-amber-400 text-white"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Pantalla Completa Automática por Usuario (APK / TV) en el Modal */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  {editingFullscreenAuto ? (
                    <Maximize className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <Minimize className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Pantalla Completa Automática (APK Android / TV)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Expande automáticamente la pizarra a pantalla completa al abrirla con este PIN,
                  sin necesidad de ubicar el botón manualmente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFullscreenAuto((prev) => !prev)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer shrink-0 ${
                  editingFullscreenAuto
                    ? "bg-cyan-600/25 border-cyan-400 text-cyan-200"
                    : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                {editingFullscreenAuto ? "📺 Pantalla Completa: ACTIVA" : "Vista Normal"}
              </button>
            </div>

            {/* Quick buttons */}
            <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-xs">
              <span className="font-mono text-[11px] text-blue-300 font-semibold">
                {editingLotteries.length} de {ALL_AVAILABLE_LOTTERIES.length} loterías seleccionadas
              </span>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setEditingLotteries(ALL_AVAILABLE_LOTTERIES.map((l) => l.id))}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition cursor-pointer"
                >
                  Marcar Todas
                </button>
                <button
                  type="button"
                  onClick={() => setEditingLotteries([])}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] font-semibold transition cursor-pointer"
                >
                  Desmarcar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingLotteries(DEFAULT_ANIMAL_LOTTERIES.map((l) => l.id))}
                  className="px-2 py-1 rounded bg-emerald-950/60 border border-emerald-800/60 hover:bg-emerald-900/60 text-emerald-300 text-[11px] font-semibold transition cursor-pointer"
                >
                  Solo Animalitos
                </button>
                <button
                  type="button"
                  onClick={() => setEditingLotteries(ALL_TRIPLE_LOTTERIES.map((l) => l.id))}
                  className="px-2 py-1 rounded bg-purple-950/60 border border-purple-800/60 hover:bg-purple-900/60 text-purple-300 text-[11px] font-semibold transition cursor-pointer"
                >
                  Solo Triples
                </button>
              </div>
            </div>

            {/* Checkbox columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto p-1">
              {/* Animalitos */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Animalitos ({DEFAULT_ANIMAL_LOTTERIES.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = DEFAULT_ANIMAL_LOTTERIES.map((l) => l.id);
                      const allSelected = ids.every((id) => editingLotteries.includes(id));
                      setEditingLotteries((prev) =>
                        allSelected
                          ? prev.filter((id) => !ids.includes(id))
                          : Array.from(new Set([...prev, ...ids])),
                      );
                    }}
                    className="text-[10px] text-slate-400 hover:text-emerald-300 underline font-normal cursor-pointer"
                  >
                    Alternar grupo
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DEFAULT_ANIMAL_LOTTERIES.map((lottery) => {
                    const isChecked = editingLotteries.includes(lottery.id);
                    return (
                      <label
                        key={lottery.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                          isChecked
                            ? "bg-emerald-950/40 border-emerald-700/60 text-white font-medium"
                            : "bg-slate-950/40 border-slate-800 text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEditingLottery(lottery.id)}
                          className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                        />
                        <span className="truncate">{lottery.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Triples */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Triples ({ALL_TRIPLE_LOTTERIES.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = ALL_TRIPLE_LOTTERIES.map((l) => l.id);
                      const allSelected = ids.every((id) => editingLotteries.includes(id));
                      setEditingLotteries((prev) =>
                        allSelected
                          ? prev.filter((id) => !ids.includes(id))
                          : Array.from(new Set([...prev, ...ids])),
                      );
                    }}
                    className="text-[10px] text-slate-400 hover:text-amber-300 underline font-normal cursor-pointer"
                  >
                    Alternar grupo
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_TRIPLE_LOTTERIES.map((lottery) => {
                    const isChecked = editingLotteries.includes(lottery.id);
                    return (
                      <label
                        key={lottery.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                          isChecked
                            ? "bg-amber-950/40 border-amber-700/60 text-white font-medium"
                            : "bg-slate-950/40 border-slate-800 text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEditingLottery(lottery.id)}
                          className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                        />
                        <span className="truncate">{lottery.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {modalCloudError && (
              <div
                role="alert"
                className="bg-red-950/85 border border-red-500/70 text-red-100 px-3.5 py-2.5 rounded-xl text-xs space-y-1"
              >
                <div className="flex items-center gap-1.5 font-bold text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                  <span>No se pudo guardar en la nube:</span>
                </div>
                <p className="font-mono text-[11px] break-words text-red-100">{modalCloudError}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setEditingLicense(null);
                  setModalCloudError(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveEditLotteries}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>Guardar Loterías Permitidas</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
