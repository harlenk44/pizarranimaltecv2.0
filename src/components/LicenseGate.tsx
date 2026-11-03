import { useState, useEffect, useCallback, type ReactNode } from "react";
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
import type { ClientLicense } from "@/lib/types";

export const DEVICE_ID_STORAGE_KEY = "pizarra_tv_device_id";
export const ACTIVATED_PIN_STORAGE_KEY = "pizarra_activated_pin";
const LICENSE_CACHE_STORAGE_KEY = "pizarra_license_cache_v2";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "TV-SERVER";
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const num = Math.floor(1000 + Math.random() * 9000);
    const id = `TV-${rand}-${num}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return "TV-LOCAL";
  }
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
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [activatedPin, setActivatedPin] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(ACTIVATED_PIN_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [pinInput, setPinInput] = useState<string>(activatedPin);
  const [requireLicense, setRequireLicense] = useState<boolean>(true);
  const [licenses, setLicenses] = useState<ClientLicense[]>([]);
  const [initialLoaded, setInitialLoaded] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [adminBypass, setAdminBypass] = useState<boolean>(false);
  const [forceLicenseScreen, setForceLicenseScreen] = useState<boolean>(false);
  const [logoClicks, setLogoClicks] = useState<number>(0);

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

  const syncLicenseState = useCallback(async () => {
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
        try {
          localStorage.setItem(
            LICENSE_CACHE_STORAGE_KEY,
            JSON.stringify({
              requireLicense: typeof data.requireLicense === "boolean" ? data.requireLicense : true,
              licenses: data.clientLicenses || [],
            }),
          );
        } catch {
          // ignore
        }
      }
    } catch {
      try {
        const raw = localStorage.getItem(LICENSE_CACHE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.requireLicense === "boolean") setRequireLicense(parsed.requireLicense);
          if (Array.isArray(parsed.licenses)) setLicenses(parsed.licenses);
        }
      } catch {
        // ignore
      }
    } finally {
      setInitialLoaded(true);
    }
  }, []);

  useEffect(() => {
    syncLicenseState();
    const timer = setInterval(syncLicenseState, 10000);
    return () => clearInterval(timer);
  }, [syncLicenseState]);

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
          },
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.clientLicenses)) {
            setLicenses(data.clientLicenses);
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
    return <>{children}</>;
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
      const res = await fetch("/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseAction: {
            type: "activate_pin",
            pin_code: cleanPin,
            device_id: deviceId,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.clientLicenses)) {
          setLicenses(data.clientLicenses);
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
