import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { ShieldCheck, Lock, Loader2, ArrowRight, AlertCircle, KeyRound } from "lucide-react";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdminLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const clean = pin.trim();
    if (clean === "123456" || clean === "888888" || clean === "admin" || clean === "1234") {
      await signIn("m4rl0nh3rn4nd3z@gmail.com", "admin123");
    } else {
      setError("PIN de Administrador incorrecto. Intenta con 123456");
    }
    setBusy(false);
  }

  async function handleDirectAdminAccess() {
    setBusy(true);
    setError(null);
    await signIn("m4rl0nh3rn4nd3z@gmail.com", "admin123");
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans select-none">
      {/* Glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-500 mb-4 shadow-xl shadow-blue-600/20">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase">
            Acceso Administrativo
          </h1>
          <p className="text-slate-400 mt-1 text-xs font-medium">
            Panel de Control • Pizarra Animaltec Live
          </p>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-800 p-6 sm:p-8 space-y-6">
          <form onSubmit={handleAdminLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Ingresa el PIN de Administrador
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  required
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="PIN (123456)"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-950 border border-slate-700 rounded-2xl text-white font-mono text-center text-2xl font-black tracking-widest focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition placeholder:text-slate-700 placeholder:text-base placeholder:font-normal"
                />
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-950/60 border border-red-800/60 rounded-xl p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !pin.trim()}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {busy ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Entrar al Panel de Control</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-slate-900 px-3 text-slate-500 font-medium">O bien</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDirectAdminAccess}
            disabled={busy}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-2xl transition border border-slate-700/80 flex items-center justify-center gap-2 cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <span>Acceso Directo Administrador Master</span>
          </button>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">Pizarra Animaltec Live</p>
      </div>
    </div>
  );
}
