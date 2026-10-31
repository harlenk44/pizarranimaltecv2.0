import { useState } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BoardSettingsProvider, useBoardSettings } from "@/context/BoardSettingsContext";
import LoginPage from "@/views/LoginPage";
import BoardPage from "@/views/BoardPage";
import AdminPage from "@/views/AdminPage";
import { Loader2 } from "lucide-react";
import BoardDisplay from "@/components/BoardDisplay";

function AppContent() {
  const { profile, loading: authLoading } = useAuth();
  const [view, setView] = useState<"board" | "admin">("board");
  const isAdmin = profile?.role === "admin";

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // 1. Admin Panel View Requested
  if (view === "admin") {
    if (isAdmin) {
      return <AdminPage onBack={() => setView("board")} />;
    }
    return (
      <div className="relative">
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={() => setView("board")}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs text-slate-300 font-semibold transition flex items-center gap-1.5 shadow-lg cursor-pointer"
          >
            ← Volver a la Pizarra
          </button>
        </div>
        <LoginPage />
      </div>
    );
  }

  // 2. Direct Live Board Display (Direct access to lottery board)
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
