import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { Ticket, Lock, Mail, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);

    if (mode === "signin") {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      const { error } = await signUp(email, password);
      if (error) {
        setError(error);
      } else {
        setSuccess("Cuenta creada. Ahora puedes iniciar sesión.");
        setMode("signin");
      }
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-600/30">
            <Ticket className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">pizarraianimaltec</h1>
          <p className="text-slate-400 mt-2">Resultados de Lotería en Tiempo Real</p>
        </div>

        <div className="bg-slate-800/80 backdrop-blur rounded-2xl shadow-2xl border border-slate-700 p-8">
          <div className="flex gap-2 mb-6 p-1 bg-slate-900/60 rounded-xl">
            <button
              onClick={() => {
                setMode("signin");
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === "signin"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => {
                setMode("signup");
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === "signup"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Correo Electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  placeholder="tu@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3">
                {error}
              </div>
            )}
            {success && (
              <div className="text-sm text-green-400 bg-green-950/40 border border-green-800/50 rounded-lg px-4 py-3">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {busy && <Loader2 className="w-5 h-5 animate-spin" />}
              {mode === "signin" ? "Entrar a la Pizarra" : "Crear Cuenta"}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          pizarraianimaltec · Acceso restringido para pantallas y clientes autorizados
        </p>
      </div>
    </div>
  );
}
