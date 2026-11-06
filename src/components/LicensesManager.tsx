import { useState, useEffect, useCallback } from "react";
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
  CheckSquare,
  Square,
  X,
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
  type CardsPerScreenOption,
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

  // Edit lotteries & cards per screen modal state
  const [editingLicense, setEditingLicense] = useState<ClientLicense | null>(null);
  const [editingLotteries, setEditingLotteries] = useState<string[]>([]);
  const [editingCardsPerScreen, setEditingCardsPerScreen] =
    useState<CardsPerScreenOption>(DEFAULT_CARDS_PER_SCREEN);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => {
      setFeedbackMsg((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const fetchLicenses = useCallback(async () => {
    try {
      const res = await fetch("/api/public/results/sync");
      if (res.ok) {
        const data = await res.json();
        if (typeof data.requireLicense === "boolean") {
          setRequireLicense(data.requireLicense);
        }
        if (Array.isArray(data.clientLicenses)) {
          let finalLicenses: ClientLicense[] = data.clientLicenses;

          try {
            const localDeletedRaw = localStorage.getItem("pizarra_deleted_licenses_v2");
            const localDeleted = localDeletedRaw
              ? JSON.parse(localDeletedRaw)
              : { ids: [], pins: [] };
            const deletedIdSet = new Set<string>([
              ...(Array.isArray(data.deletedIds) ? data.deletedIds : []),
              ...(Array.isArray(localDeleted.ids) ? localDeleted.ids : []),
            ]);
            const deletedPinSet = new Set<string>([
              ...(Array.isArray(data.deletedPins) ? data.deletedPins : []),
              ...(Array.isArray(localDeleted.pins) ? localDeleted.pins : []),
            ]);

            const cachedRaw = localStorage.getItem("pizarra_client_licenses_cache_v2");
            if (cachedRaw) {
              const cached = JSON.parse(cachedRaw);
              if (Array.isArray(cached.licenses)) {
                const missing = cached.licenses.filter(
                  (oldLic: ClientLicense) =>
                    oldLic &&
                    oldLic.pin_code &&
                    oldLic.pin_code !== "291007" &&
                    !deletedIdSet.has(oldLic.id) &&
                    !deletedPinSet.has(oldLic.pin_code) &&
                    !finalLicenses.some(
                      (l: ClientLicense) => l.id === oldLic.id || l.pin_code === oldLic.pin_code,
                    ),
                );

                if (missing.length > 0) {
                  const restoreRes = await fetch("/api/public/results/sync", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      licenseAction: {
                        type: "restore_batch",
                        licenses: missing,
                      },
                    }),
                  });
                  if (restoreRes.ok) {
                    const restoreData = await restoreRes.json();
                    if (Array.isArray(restoreData.clientLicenses)) {
                      finalLicenses = restoreData.clientLicenses;
                    }
                  }
                }
              }
            }

            localStorage.setItem(
              "pizarra_client_licenses_cache_v2",
              JSON.stringify({
                requireLicense: data.requireLicense,
                licenses: finalLicenses,
              }),
            );
          } catch {
            // ignore
          }

          setLicenses(finalLicenses);
        }
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

  const runLicenseAction = async (actionPayload: Record<string, unknown>, successText?: string) => {
    setSaving(true);
    // Optimistic local update so UI reflects action immediately without flicker
    if (actionPayload.type === "delete" && typeof actionPayload.id === "string") {
      setLicenses((prev) => {
        const targetToDelete = prev.find((l) => l.id === actionPayload.id);
        const next = prev.filter((l) => l.id !== actionPayload.id);
        try {
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
          localStorage.setItem(
            "pizarra_client_licenses_cache_v2",
            JSON.stringify({ requireLicense, licenses: next }),
          );
        } catch {
          // ignore
        }
        return next;
      });
    } else if (actionPayload.type === "toggle_status" && typeof actionPayload.id === "string") {
      setLicenses((prev) => {
        const next = prev.map((l) =>
          l.id === actionPayload.id
            ? { ...l, status: l.status === "active" ? ("paused" as const) : ("active" as const) }
            : l,
        );
        try {
          localStorage.setItem(
            "pizarra_client_licenses_cache_v2",
            JSON.stringify({ requireLicense, licenses: next }),
          );
        } catch {
          // ignore
        }
        return next;
      });
    }

    try {
      const res = await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseAction: actionPayload }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.requireLicense === "boolean") {
          setRequireLicense(data.requireLicense);
        }
        if (Array.isArray(data.clientLicenses)) {
          setLicenses(data.clientLicenses);
          try {
            localStorage.setItem(
              "pizarra_client_licenses_cache_v2",
              JSON.stringify({
                requireLicense: data.requireLicense,
                licenses: data.clientLicenses,
              }),
            );
          } catch {
            // ignore
          }
        }
        if (successText) showToast(successText);
      }
    } catch {
      showToast("Error de red al actualizar licencias.");
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
    const { allowedLotteries, cardsPerScreen } = parseClientLicenseName(lic.client_name);
    setEditingLicense(lic);
    setEditingLotteries(
      allowedLotteries && allowedLotteries.length > 0
        ? [...allowedLotteries]
        : ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
    );
    setEditingCardsPerScreen(cardsPerScreen ?? DEFAULT_CARDS_PER_SCREEN);
  };

  const handleSaveEditLotteries = async () => {
    if (!editingLicense) return;
    const { cleanName } = parseClientLicenseName(editingLicense.client_name);
    const packedName = formatClientLicenseName(
      cleanName,
      editingLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      editingCardsPerScreen,
    );
    const cardsLabel =
      editingCardsPerScreen === "TODAS" ? "Todas" : `${editingCardsPerScreen} por pantalla`;
    await runLicenseAction(
      {
        type: "update_lotteries",
        id: editingLicense.id,
        client_name: packedName,
      },
      `Configuración actualizada para ${cleanName} (${editingLotteries.length}/${ALL_AVAILABLE_LOTTERIES.length} loterías · ${cardsLabel})`,
    );
    setEditingLicense(null);
  };

  const handleQuickChangeCardsPerScreen = async (
    lic: ClientLicense,
    newCards: CardsPerScreenOption,
  ) => {
    const { cleanName, allowedLotteries } = parseClientLicenseName(lic.client_name);
    const packedName = formatClientLicenseName(
      cleanName,
      allowedLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      newCards,
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

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    const days =
      durationDays === "unlimited" ? null : Math.max(1, Math.min(30, Number(durationDays) || 30));

    const packedName = formatClientLicenseName(
      clientName.trim(),
      formLotteries,
      ALL_AVAILABLE_LOTTERIES.length,
      formCardsPerScreen,
    );

    const cardsLabel =
      formCardsPerScreen === "TODAS" ? "Todas" : `${formCardsPerScreen} por pantalla`;

    await runLicenseAction(
      {
        type: "create",
        client_name: packedName,
        pin_code: pinCode.replace(/[^0-9]/g, "").slice(0, 6) || generateRandomPin(),
        days,
        max_devices: maxDevices,
        notes: notes.trim(),
      },
      `Licencia creada para ${clientName.trim()} (${formLotteries.length}/${ALL_AVAILABLE_LOTTERIES.length} loterías · ${cardsLabel} · ${days ? `${days} ${days === 1 ? "día" : "días"}` : "Permanente"})`,
    );
    setClientName("");
    setPinCode(generateRandomPin());
    setNotes("");
    setDurationDays("30");
    setFormLotteries(ALL_AVAILABLE_LOTTERIES.map((l) => l.id));
    setFormCardsPerScreen(DEFAULT_CARDS_PER_SCREEN);
    setShowForm(false);
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

                  const { cleanName, allowedLotteries, cardsPerScreen } = parseClientLicenseName(
                    lic.client_name,
                  );
                  const isAll =
                    !allowedLotteries || allowedLotteries.length >= ALL_AVAILABLE_LOTTERIES.length;
                  const totalAllowedCount = allowedLotteries
                    ? allowedLotteries.length
                    : ALL_AVAILABLE_LOTTERIES.length;

                  return (
                    <tr key={lic.id} className="hover:bg-slate-800/30 transition">
                      {/* Client Name & Notes */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{cleanName}</div>
                        {lic.notes && (
                          <div className="text-xs text-slate-400 mt-0.5">{lic.notes}</div>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              isAll
                                ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/50"
                                : "bg-blue-950/60 text-blue-300 border-blue-700/50"
                            }`}
                            title={
                              isAll
                                ? "Tiene acceso a todas las loterías"
                                : `Loterías activas: ${allowedLotteries.join(", ")}`
                            }
                          >
                            <ListFilter className="w-3 h-3" />
                            {isAll
                              ? `Todas (${ALL_AVAILABLE_LOTTERIES.length} loterías)`
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

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingLicense(null)}
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
