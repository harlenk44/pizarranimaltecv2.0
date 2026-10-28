import { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BoardSettingsProvider, useBoardSettings } from "@/context/BoardSettingsContext";
import LoginPage from "@/views/LoginPage";
import BoardPage from "@/views/BoardPage";
import AdminPage from "@/views/AdminPage";
import { Loader2, Lock, LogOut } from "lucide-react";
import BoardDisplay from "@/components/BoardDisplay";

function AppContent() {
  const { session, profile, loading, subscriptionActive, signOut } = useAuth();
  const { settings } = useBoardSettings();
  const [view, setView] = useState<"board" | "admin">("board");

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!session || !profile) {
    return <LoginPage />;
  }

  if (!subscriptionActive) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-5 border border-amber-500/30">
          <Lock className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Servicio de Pizarra no Activo</h1>
        <p className="text-slate-400 max-w-md mb-2">
          El acceso a la pizarra en esta pantalla requiere una suscripción de alquiler activa.
        </p>
        <p className="text-xs text-slate-500 mb-1">
          Cuenta: <span className="font-mono text-slate-300">{profile.email}</span>
        </p>
        {profile.subscription_expires_at ? (
          <p className="text-xs text-red-400 mb-6">
            El servicio venció el:{" "}
            {new Date(profile.subscription_expires_at).toLocaleDateString("es-VE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        ) : (
          <p className="text-xs text-amber-400/90 mb-6">
            Contacta a tu proveedor del servicio para activar esta pantalla.
          </p>
        )}
        <button
          onClick={signOut}
          className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium flex items-center gap-2 transition"
        >
          <LogOut className="w-4 h-4" /> Cambiar de Cuenta / Salir
        </button>
      </div>
    );
  }

  if (view === "admin" && profile.role === "admin") {
    return <AdminPage onBack={() => setView("board")} />;
  }

  return (
    <BoardDisplay>
      <BoardPage onAdminClick={() => setView("admin")} />
    </BoardDisplay>
  );
}

function ThemedShell() {
  const { settings } = useBoardSettings();
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: settings.background_color,
        color: settings.text_color,
        fontFamily: settings.font_family,
        fontSize: `${settings.base_font_size}px`,
      }}
    >
      <AppContent />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BoardSettingsProvider>
        <ThemedShell />
      </BoardSettingsProvider>
    </AuthProvider>
  );
}
