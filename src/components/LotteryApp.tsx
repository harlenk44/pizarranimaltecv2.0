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
        <div className="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-5">
          <Lock className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Suscripción inactiva</h1>
        <p className="text-slate-400 max-w-md mb-1">
          Tu suscripción no está activa o ha expirado. Contacta al administrador para reactivar tu
          acceso.
        </p>
        {profile.subscription_expires_at && (
          <p className="text-xs text-slate-500 mb-6">
            Vencimiento:{" "}
            {new Date(profile.subscription_expires_at).toLocaleDateString("es-VE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
        <button
          onClick={signOut}
          className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium flex items-center gap-2 transition"
        >
          <LogOut className="w-4 h-4" /> Salir
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
