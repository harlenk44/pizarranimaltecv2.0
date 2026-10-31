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
} from "lucide-react";
import type { ClientLicense } from "@/lib/types";
import LicenseGate from "@/components/LicenseGate";

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
          setLicenses(data.clientLicenses);
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
        }
        if (successText) showToast(successText);
      }
    } catch {
      showToast("Error de red al actualizar licencias.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    const days = durationDays === "unlimited" ? null : Number(durationDays) || 30;
    await runLicenseAction(
      {
        type: "create",
        client_name: clientName.trim(),
        pin_code: pinCode.replace(/[^0-9]/g, "").slice(0, 6) || generateRandomPin(),
        days,
        max_devices: maxDevices,
        notes: notes.trim(),
      },
      `Licencia creada para ${clientName.trim()}`,
    );
    setClientName("");
    setPinCode(generateRandomPin());
    setNotes("");
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
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">
                Tiempo de Vigencia
              </label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="7">7 Días (Prueba / Semanal)</option>
                <option value="15">15 Días (Quincenal)</option>
                <option value="30">30 Días (Mensual)</option>
                <option value="90">90 Días (Trimestral)</option>
                <option value="365">365 Días (1 Año)</option>
                <option value="unlimited">Ilimitado / Permanente</option>
              </select>
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
                  <th className="py-3.5 px-4 text-right">Acciones Rápidas (1 Clic)</th>
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

                  return (
                    <tr key={lic.id} className="hover:bg-slate-800/30 transition">
                      {/* Client Name & Notes */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{lic.client_name}</div>
                        {lic.notes && (
                          <div className="text-xs text-slate-400 mt-0.5">{lic.notes}</div>
                        )}
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

                      {/* Quick Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              runLicenseAction(
                                { type: "renew", id: lic.id, days: 30 },
                                `+30 días agregados a ${lic.client_name}`,
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-700/50 text-emerald-300 text-xs font-mono font-bold tabular-nums transition flex items-center gap-1 cursor-pointer"
                            title="Renovar por 30 días más"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            <span>+30d</span>
                          </button>

                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              runLicenseAction(
                                { type: "renew", id: lic.id, days: 7 },
                                `+7 días agregados a ${lic.client_name}`,
                              )
                            }
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold tabular-nums transition cursor-pointer"
                            title="Extender 7 días"
                          >
                            +7d
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
    </div>
  );
}
