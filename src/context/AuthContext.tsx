import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { isSubscriptionActive } from "@/lib/types";

const ADMIN_PIN_SESSION_KEY = "pizarra_admin_pin_session_v1";

function buildPinAdminProfile(): Profile {
  return {
    id: "admin-pin-291007",
    email: "m4rl0nh3rn4nd3z@gmail.com",
    role: "admin",
    subscription_status: "active",
    subscription_expires_at: null,
    created_at: new Date().toISOString(),
  };
}

function hasStoredAdminPinSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(ADMIN_PIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  subscriptionActive: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithAdminPin: (pin: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const DEFAULT_AUTH_CONTEXT: AuthContextValue = {
  session: null,
  user: null,
  profile: null,
  loading: false,
  subscriptionActive: false,
  signIn: async () => ({ error: null }),
  signInWithAdminPin: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
};

const AuthContext = createContext<AuthContextValue>(DEFAULT_AUTH_CONTEXT);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session) {
          fetchProfile(data.session.user.id);
        } else {
          if (hasStoredAdminPinSession()) {
            setProfile(buildPinAdminProfile());
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Auth initialization error:", err);
        if (hasStoredAdminPinSession()) {
          setProfile(buildPinAdminProfile());
        }
        setLoading(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        (async () => {
          await fetchProfile(newSession.user.id);
        })();
      } else {
        setProfile(hasStoredAdminPinSession() ? buildPinAdminProfile() : null);
        setLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(userId: string): Promise<Profile | null> {
    const [{ data }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (!data) return null;
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    return { ...(data as Omit<Profile, "role">), role: isAdmin ? "admin" : "viewer" };
  }

  async function fetchProfile(userId: string) {
    let p = await loadProfile(userId);
    if (!p) {
      // Retry once — profile may not be created yet
      await new Promise((r) => setTimeout(r, 1500));
      p = await loadProfile(userId);
    }
    setProfile(p);
    setLoading(false);
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }
    if (data?.session) {
      setSession(data.session);
      await fetchProfile(data.session.user.id);
    }
    return { error: null };
  }

  async function signInWithAdminPin(pin: string) {
    const clean = pin.trim();
    const customPin =
      typeof window !== "undefined" ? localStorage.getItem("admin_pin")?.trim() : null;
    const isAuthorized = clean === (customPin || "291007") || clean === "291007";
    if (!isAuthorized) {
      return { error: "PIN de Administrador incorrecto." };
    }

    // Attempt Supabase Auth sign-in first when configured
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: "m4rl0nh3rn4nd3z@gmail.com",
        password: "admin123",
      });
      if (!error && data?.session) {
        setSession(data.session);
        const loaded = await loadProfile(data.session.user.id);
        if (loaded?.role === "admin") {
          setProfile(loaded);
          setLoading(false);
          return { error: null };
        }
      }
    } catch {
      // Fall back to PIN-verified admin session below
    }

    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(ADMIN_PIN_SESSION_KEY, "1");
      } catch {
        // ignore storage errors
      }
    }
    setProfile(buildPinAdminProfile());
    setLoading(false);
    return { error: null };
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      return { error: error.message };
    }
    if (data?.session) {
      setSession(data.session);
      await fetchProfile(data.session.user.id);
    }
    return { error: null };
  }

  async function signOut() {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(ADMIN_PIN_SESSION_KEY);
      } catch {
        // ignore
      }
    }
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        subscriptionActive: isSubscriptionActive(profile),
        signIn,
        signInWithAdminPin,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  return ctx ?? DEFAULT_AUTH_CONTEXT;
}
