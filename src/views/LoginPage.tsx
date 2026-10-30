import { useState, useEffect, useRef, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Ticket,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  Tv,
  RefreshCw,
  Smartphone,
  UserCheck,
} from "lucide-react";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"tv" | "signin">("tv");

  // Email form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // TV Pairing State
  const [tvCode, setTvCode] = useState<string | null>(null);
  const [tvFormatted, setTvFormatted] = useState<string | null>(null);
  const [tvGenerating, setTvGenerating] = useState(false);
  const [tvWaiting, setTvWaiting] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  async function generateTvCode() {
    setTvGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/tv/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const data = await res.json();
      if (data?.code) {
        setTvCode(data.code);
        setTvFormatted(data.formatted || data.code);
        setTvWaiting(true);
      }
    } catch {
      setError("No se pudo generar el código. Usa el ingreso con correo y clave.");
    } finally {
      setTvGenerating(false);
    }
  }

  useEffect(() => {
    if (mode === "tv" && !tvCode && !tvGenerating) {
      generateTvCode();
    }
  }, [mode, tvCode, tvGenerating]);

  // Polling for TV code authorization
  useEffect(() => {
    if (mode !== "tv" || !tvCode || !tvWaiting) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tv/pair?code=${tvCode}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "authorized" && data.email) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setTvWaiting(false);
          setBusy(true);
          // Sign in as the assigned client user
          await signIn(data.email, data.password || "admin123");
          setBusy(false);
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [mode, tvCode, tvWaiting, signIn]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);

    const targetEmail = email.trim().toLowerCase();

    const { error: signErr } = await signIn(targetEmail, password);
    if (signErr) {
      // If user profile doesn't exist yet, create client account
      const { error: upErr } = await signUp(targetEmail, password);
      if (upErr) {
        setError(upErr);
      } else {
        await signIn(targetEmail, password);
      }
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-3 shadow-lg shadow-blue-600/30">
            <Ticket className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">pizarraianimaltec</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Resultados de Lotería y Animalitos en Tiempo Real
          </p>
        </div>

        <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl shadow-2xl border border-slate-800 p-6 sm:p-8">
          {/* Navigation Tabs */}
          <div className="flex gap-2 mb-6 p-1 bg-slate-950/80 rounded-2xl border border-slate-800/80">
            <button
              onClick={() => {
                setMode("tv");
                setError(null);
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                mode === "tv"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>Código de Pantalla TV</span>
            </button>
            <button
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                mode === "signin"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Ingreso con Correo</span>
            </button>
          </div>

          {/* Mode 1: 6-Digit TV Pairing Screen */}
          {mode === "tv" && (
            <div className="space-y-6 text-center">
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6">
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-2">
                  Código de activación para esta pantalla
                </p>

                {tvGenerating ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-blue-400">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span>Generando código...</span>
                  </div>
                ) : (
                  <div className="my-2">
                    <div className="text-4xl sm:text-5xl font-mono font-extrabold tracking-widest text-blue-400 bg-blue-950/40 border border-blue-800/60 rounded-2xl py-4 px-6 inline-block shadow-inner">
                      {tvFormatted || tvCode || "------"}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 mt-4 text-xs text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Esperando activación desde el Panel de Administración...</span>
                </div>
              </div>

              {/* Instructions */}
              <div className="text-left bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-2.5">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-blue-400" />
                  ¿Cómo activar este Smart TV para tu cliente?
                </div>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>
                    Abre <span className="font-mono text-white">pizarraianimaltec</span> en tu
                    teléfono o laptop con tu cuenta de Administrador.
                  </li>
                  <li>
                    Ve a la pestaña <strong className="text-white">Suscripciones</strong> y haz clic
                    en <strong className="text-blue-400">"Vincular TV con Código"</strong>.
                  </li>
                  <li>
                    Selecciona la cuenta del <strong className="text-emerald-400">Cliente</strong>,
                    escribe el código <strong className="text-white">{tvFormatted || "..."}</strong>{" "}
                    y presiona Vincular.
                  </li>
                  <li>
                    ¡Este televisor iniciará automáticamente con la suscripción de ese cliente!
                  </li>
                </ol>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={generateTvCode}
                  disabled={tvGenerating}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${tvGenerating ? "animate-spin" : ""}`} />
                  Generar nuevo código
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer flex items-center gap-1"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Ingreso directo con correo →
                </button>
              </div>
            </div>
          )}

          {/* Mode 2: Traditional Email / Password Form */}
          {mode === "signin" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-xl p-3 leading-relaxed">
                <strong>Ingreso de Cliente / Administrador:</strong> Coloca el correo y clave
                asignados para esta pantalla.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                    placeholder="ej: cliente-agencia@gmail.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={4}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-xl p-3">
                  {error}
                </div>
              )}
              {success && (
                <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-3">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Entrar a la Pizarra
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          pizarraianimaltec · Sistema de Pizarras Digitales para Loterías
        </p>
      </div>
    </div>
  );
}
