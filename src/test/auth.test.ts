import { describe, expect, it } from "vitest";
import { createMockSupabaseClient, mockStore } from "@/lib/mock-db";

describe("Authentication flow with mock Supabase client", () => {
  const supabase = createMockSupabaseClient();

  it("successfully signs in with m4rl0nh3rn4nd3z@gmail.com and generates active profile", async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: "m4rl0nh3rn4nd3z@gmail.com",
      password: "anypassword123",
    });

    expect(error).toBeNull();
    expect(data.session).toBeDefined();
    expect(data.user?.email).toBe("m4rl0nh3rn4nd3z@gmail.com");

    // Profile check
    const profile = mockStore.profiles.find((p) => p.email === "m4rl0nh3rn4nd3z@gmail.com");
    expect(profile).toBeDefined();
    expect(profile?.role).toBe("admin");
    expect(profile?.subscription_status).toBe("active");
  });

  it("notifies auth state change subscribers on signIn and signOut", async () => {
    let capturedSession: unknown = undefined;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      capturedSession = session;
    });

    await supabase.auth.signInWithPassword({
      email: "test-user@loteria.com",
      password: "password123",
    });

    expect(capturedSession).toBeDefined();
    expect((capturedSession as { user: { email: string } }).user.email).toBe(
      "test-user@loteria.com",
    );

    await supabase.auth.signOut();
    expect(capturedSession).toBeNull();

    sub.subscription.unsubscribe();
  });
});
