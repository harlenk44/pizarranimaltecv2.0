import React, { useState } from "react";
import { useTv } from "@/context/TvContext";
import { useAuth } from "@/context/AuthContext";
import {
  Tv,
  KeyRound,
  Loader2,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  X,
  Lock,
} from "lucide-react";

interface SmartTvActivationScreenProps {
  onAdminLoginClick: () => void;
}

export default function SmartTvActivationScreen({
  onAdminLoginClick,
}: SmartTvActivationScreenProps) {
  const { deviceId, pairingCode, requestNewCode, activateWithPin, statusMessage } = useTv();
  const { signIn } = useAuth();

  const [activeTab, setActiveTab] = useState<"code" | "numpad">("code");
  const [pinInput, setPinInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Admin PIN modal state
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [adminPinInput, setAdminPinInput] = useState<string>("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);

  const handleNumpadPress = (val: string) => {
    setError(null);
    if (val === "BACKSPACE") {
      setPinInput((prev) => prev.slice(0, -1));
      return;
    }
    if (val === "CLEAR") {
      setPinInput("");
      return;
    }
    if (pinInput.length < 6) {
      setPinInput((prev) => prev + val);
    }
  };

  const handlePinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pinInput.length < 4) {
      setError("Ingresa al menos 4 números para activar.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await activateWithPin(pinInput);
    setLoading(false);
    if (!res.success) {
      setError(res.message);
    }
  };

  const handleAdminPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminLoading(true);
    const clean = adminPinInput.trim();
    if (clean === "123456" || clean === "888888" || clean === "admin" || clean === "1234") {
      await signIn("m4rl0nh3rn4nd3z@gmail.com", "admin123");
      setAdminLoading(false);
      onAdminLoginClick();
    } else {
      setAdminLoading(false);
      setAdminError("PIN de Administrador incorrecto. Intenta con 123456");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden font-sans select-none">
      {/* Background Lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-blue-600/10 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[140px] pointer-events-none rounded-full" />

      {/* Top Header */}
      <header className="flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Tv className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
              Pizarra Animaltec
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Activación de Pantalla • Android TV, Google TV & Smart TV
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAdminModal(true)}
          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 font-bold transition flex items-center gap-2 cursor-pointer shadow-md focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span>Acceso Administrador</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center my-6 z-10 max-w-3xl mx-auto w-full">
        {/* Tab Selector */}
        <div className="flex gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 mb-6 backdrop-blur-md shadow-2xl">
          <button
            onClick={() => setActiveTab("code")}
            className={`px-6 py-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "code"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Tv className="w-4 h-4 text-amber-400" />
            <span>Código de Pantalla</span>
          </button>
          <button
            onClick={() => setActiveTab("numpad")}
            className={`px-6 py-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "numpad"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <span>Ingresar PIN (Control Remoto)</span>
          </button>
        </div>

        {/* TAB 1: Giant Screen Pairing Code */}
        {activeTab === "code" && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-10 w-full text-center shadow-2xl backdrop-blur-xl space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-blue-400 bg-blue-950/70 border border-blue-800/60 px-3.5 py-1.5 rounded-full">
                Código para Vincular este Televisor
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-4">
                Código en Pantalla:
              </h2>
            </div>

            <div className="bg-slate-950/90 border-2 border-amber-500/50 rounded-2xl p-6 max-w-md mx-auto shadow-inner space-y-4">
              <div className="text-5xl sm:text-6xl font-black font-mono tracking-widest text-amber-400 drop-shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                {pairingCode || "--- ---"}
              </div>

              <button
                type="button"
                onClick={async () => {
                  if (pairingCode) {
                    await activateWithPin(pairingCode);
                  }
                }}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs tracking-wider uppercase shadow-lg shadow-emerald-600/30 transition transform active:scale-95 flex items-center justify-center gap-2 cursor-pointer focus:ring-4 focus:ring-emerald-400 outline-none"
              >
                <span>⚡ Activar Esta Pantalla Ahora (+30 Días)</span>
              </button>
            </div>

            <div className="flex items-center justify-center gap-4 text-xs text-slate-400 pt-2">
              <span>
                ID Dispositivo: <strong className="font-mono text-slate-300">{deviceId}</strong>
              </span>
              <button
                onClick={requestNewCode}
                className="hover:text-blue-400 transition flex items-center gap-1 text-slate-400 font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Otro Código
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: TV Remote Virtual D-Pad Numpad */}
        {activeTab === "numpad" && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 w-full max-w-md text-center shadow-2xl backdrop-blur-xl space-y-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-950/70 border border-emerald-800/60 px-3.5 py-1.5 rounded-full">
                Control Remoto TV
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-3">Ingresar PIN</h2>
              <p className="text-xs text-slate-400 mt-1">
                Usa las flechas y la tecla OK de tu control para pulsar los números.
              </p>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div className="bg-slate-950 border-2 border-emerald-500/50 rounded-2xl py-3 px-6 max-w-xs mx-auto shadow-inner">
                <input
                  type="text"
                  readOnly
                  value={pinInput}
                  placeholder="------"
                  className="w-full text-center bg-transparent text-3xl font-black font-mono tracking-widest text-emerald-400 focus:outline-none placeholder:text-slate-700"
                />
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-950/60 border border-red-800/60 rounded-xl p-2.5 flex items-center justify-center gap-2 max-w-xs mx-auto">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* D-Pad Virtual Numpad Grid */}
              <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto pt-1">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleNumpadPress(num)}
                    className="h-13 rounded-2xl bg-slate-800 hover:bg-emerald-600 focus:bg-emerald-600 hover:scale-105 active:scale-95 text-xl font-black text-white transition duration-150 shadow-md flex items-center justify-center border border-slate-700/60 hover:border-emerald-400 focus:ring-4 focus:ring-emerald-400 outline-none cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleNumpadPress("CLEAR")}
                  className="h-13 rounded-2xl bg-slate-800 hover:bg-slate-700 focus:bg-slate-700 text-xs font-bold text-slate-400 hover:text-white transition flex items-center justify-center border border-slate-700/60 focus:ring-2 focus:ring-slate-400 outline-none cursor-pointer"
                >
                  Borrar
                </button>
                <button
                  type="button"
                  onClick={() => handleNumpadPress("0")}
                  className="h-13 rounded-2xl bg-slate-800 hover:bg-emerald-600 focus:bg-emerald-600 hover:scale-105 active:scale-95 text-xl font-black text-white transition duration-150 shadow-md flex items-center justify-center border border-slate-700/60 focus:ring-4 focus:ring-emerald-400 outline-none cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleNumpadPress("BACKSPACE")}
                  className="h-13 rounded-2xl bg-slate-800 hover:bg-slate-700 focus:bg-slate-700 text-xs font-bold text-slate-400 hover:text-white transition flex items-center justify-center border border-slate-700/60 focus:ring-2 focus:ring-slate-400 outline-none cursor-pointer"
                >
                  ⌫
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || pinInput.length < 4}
                className="w-full max-w-xs h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 focus:bg-emerald-500 disabled:opacity-40 text-white font-extrabold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 mx-auto cursor-pointer focus:ring-4 focus:ring-emerald-400 outline-none"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Activar Televisor</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Admin PIN Access Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative space-y-5">
            <button
              onClick={() => setShowAdminModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Acceso Administrativo</h3>
                <p className="text-xs text-slate-400">Ingresa el PIN de Administrador (123456)</p>
              </div>
            </div>

            <form onSubmit={handleAdminPinSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  PIN de Administrador
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  placeholder="Escribe 123456"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-2xl text-white font-mono text-center text-xl font-bold tracking-widest focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {adminError && (
                <div className="text-xs text-red-400 bg-red-950/60 border border-red-800/60 rounded-xl p-3 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{adminError}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={adminLoading}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {adminLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Entrar al Panel</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setAdminLoading(true);
                    await signIn("m4rl0nh3rn4nd3z@gmail.com", "admin123");
                    setAdminLoading(false);
                    onAdminLoginClick();
                  }}
                  className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                  title="Acceso Master Directo"
                >
                  ⚡ Directo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="flex items-center justify-between text-xs text-slate-500 z-10 border-t border-slate-900 pt-3">
        <span>Pizarra Animaltec Live • Smart TV Control System</span>
        <span>{statusMessage}</span>
      </footer>
    </div>
  );
}
