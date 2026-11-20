import { describe, it, expect, afterAll, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  runWithCloudflareEnv,
  getRuntimeEnvVar,
  getBoundCloudflareKv,
} from "@/lib/cloudflare-env.server";
import {
  getSupabaseCloudDiagnostics,
  createRealSupabaseAdminClient,
} from "@/integrations/supabase/client.server";
import { Route as SyncRoute } from "@/routes/api/public/results/sync";
import { generateLicenseUuid } from "@/lib/license-lotteries";

const WORKSPACE_LICENSES_PATH = path.join(process.cwd(), "client_licenses.persisted.json");

function createMemoryKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

describe("Cloud license persistence & Cloudflare runtime env", () => {
  let originalLicensesFileContent: string | null = null;

  beforeAll(() => {
    if (fs.existsSync(WORKSPACE_LICENSES_PATH)) {
      originalLicensesFileContent = fs.readFileSync(WORKSPACE_LICENSES_PATH, "utf-8");
    }
  });

  afterAll(async () => {
    if (originalLicensesFileContent !== null) {
      fs.writeFileSync(WORKSPACE_LICENSES_PATH, originalLicensesFileContent);
    }
    // Clear latestRuntimeEnv binding so subsequent tests aren't affected
    await runWithCloudflareEnv({}, async () => {});
  });

  it("reads Cloudflare Worker runtime env secrets and KV binding inside request context", async () => {
    const kv = createMemoryKv();
    await runWithCloudflareEnv(
      {
        SUPABASE_URL: "https://example-project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-xyz",
        PIZARRA_KV: kv,
      },
      async () => {
        expect(getRuntimeEnvVar("SUPABASE_URL")).toBe("https://example-project.supabase.co");
        expect(getRuntimeEnvVar("SUPABASE_SERVICE_ROLE_KEY")).toBe("service-role-secret-xyz");
        expect(getBoundCloudflareKv()).toBe(kv);

        const diag = getSupabaseCloudDiagnostics();
        expect(diag.configured).toBe(true);
        expect(diag.hasServiceRoleKey).toBe(true);
        expect(diag.hasKvBinding).toBe(true);
        expect(createRealSupabaseAdminClient()).not.toBeNull();
      },
    );
  });

  it("reports missing cloud storage explicitly and never returns a real client when unconfigured", async () => {
    await runWithCloudflareEnv({}, async () => {
      const diag = getSupabaseCloudDiagnostics();
      expect(diag.configured).toBe(false);
      expect(diag.reason).toMatch(/SUPABASE_URL/i);
      expect(createRealSupabaseAdminClient()).toBeNull();
    });
  });

  it("persists licenses via safe local/memory fallback without error when external cloud storage is absent", async () => {
    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
              PUT: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    await runWithCloudflareEnv({}, async () => {
      const testId = generateLicenseUuid();
      const putReq = new Request("http://localhost/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseAction: {
            type: "create",
            id: testId,
            client_name: 'prueba fallback local||{"tarjetasPorPantalla":4}',
            pin_code: "654321",
            days: 30,
            max_devices: 1,
          },
        }),
      });
      const putRes = await serverHandlers.PUT({ request: putReq });
      const putJson = await putRes.json();

      expect(putJson.cloudLicenseSyncOk).toBe(true);
      expect(putJson.cloudLicenseError).toBeNull();
      expect(
        (putJson.clientLicenses as Array<{ pin_code: string }>).some(
          (l) => l.pin_code === "654321",
        ),
      ).toBe(true);

      const getRes = await serverHandlers.GET({
        request: new Request("http://localhost/api/public/results/sync"),
      });
      const getJson = await getRes.json();
      expect(getJson.cloudLicenseError).toBeNull();
      expect(getJson.cloudLicenseStorageMode).toBe("local-memory");

      // Clean up test license
      await serverHandlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "delete",
              id: testId,
            },
          }),
        }),
      });
    });
  });

  it("blocks local-only mutation and rolls back when a bound KV store fails to write", async () => {
    const failingKv = {
      async get() {
        return null;
      },
      async put() {
        throw new Error("KV write quota exceeded");
      },
    };
    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
              PUT: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    await runWithCloudflareEnv({ PIZARRA_KV: failingKv }, async () => {
      const testId = generateLicenseUuid();
      const putReq = new Request("http://localhost/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseAction: {
            type: "create",
            id: testId,
            client_name: "prueba kv falla",
            pin_code: "654329",
            days: 30,
            max_devices: 1,
          },
        }),
      });
      const putRes = await serverHandlers.PUT({ request: putReq });
      const putJson = await putRes.json();

      expect(putJson.cloudLicenseSyncOk).toBe(false);
      expect(putJson.cloudLicenseError).toContain("KV write quota exceeded");
      expect(
        (putJson.clientLicenses as Array<{ pin_code: string }>).some(
          (l) => l.pin_code === "654329",
        ),
      ).toBe(false);
    });
  });

  it("persists create, edit || config, toggle_status, activate_pin with device_id, and delete via Cloudflare KV cloud store", async () => {
    const kv = createMemoryKv();
    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
              PUT: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    await runWithCloudflareEnv({ PIZARRA_KV: kv }, async () => {
      const testId = generateLicenseUuid();
      const packedName =
        'prueba taller||{"loterias":["lotto-activo","granjita"],"tarjetasPorPantalla":4,"tiempoTransicion":15,"pantallaCompleta":true}';

      // 1. First GET with empty KV (even if inactive SUPABASE_URL env var is still set) seeds KV cleanly with no error
      await runWithCloudflareEnv(
        { PIZARRA_KV: kv, SUPABASE_URL: "https://ebpunrzbagmcdtammjqn.supabase.co" },
        async () => {
          const initGet = await serverHandlers.GET({
            request: new Request("http://localhost/api/public/results/sync"),
          });
          const initJson = await initGet.json();
          expect(initJson.cloudLicenseConfigured).toBe(true);
          expect(initJson.cloudLicenseError).toBeNull();
          expect(kv.store.size).toBe(1);
        },
      );

      // 2. Create license
      const createRes = await serverHandlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "create",
              id: testId,
              client_name: packedName,
              pin_code: "918273",
              days: 30,
              max_devices: 2,
            },
          }),
        }),
      });
      const createJson = await createRes.json();
      expect(createJson.cloudLicenseSyncOk).toBe(true);
      expect(createJson.cloudLicenseError).toBeNull();
      expect(kv.store.size).toBe(1);

      // 3. Incognito GET returns newly created license immediately
      const getRes = await serverHandlers.GET({
        request: new Request("http://localhost/api/public/results/sync"),
      });
      const getJson = await getRes.json();
      expect(getJson.cloudLicenseConfigured).toBe(true);
      const found = (
        getJson.clientLicenses as Array<{ id: string; pin_code: string; client_name: string }>
      ).find((l) => l.pin_code === "918273");
      expect(found).toBeDefined();
      expect(found?.client_name).toBe(packedName);

      // 4. Activate PIN with device_id
      const actRes = await serverHandlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "activate_pin",
              pin_code: "918273",
              device_id: "TV-TALLER-01",
            },
          }),
        }),
      });
      const actJson = await actRes.json();
      expect(actJson.licenseActivation?.valid).toBe(true);
      expect(actJson.cloudLicenseSyncOk).toBe(true);
      expect(actJson.licenseActivation?.license?.bound_device_ids).toContain("TV-TALLER-01");

      // 5. Pause status
      const pauseRes = await serverHandlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "toggle_status",
              id: found!.id,
            },
          }),
        }),
      });
      const pauseJson = await pauseRes.json();
      expect(pauseJson.cloudLicenseSyncOk).toBe(true);
      const pausedRow = (
        pauseJson.clientLicenses as Array<{ pin_code: string; status: string }>
      ).find((l) => l.pin_code === "918273");
      expect(pausedRow?.status).toBe("paused");

      // 6. Delete license
      const delRes = await serverHandlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "delete",
              id: found!.id,
            },
          }),
        }),
      });
      const delJson = await delRes.json();
      expect(delJson.cloudLicenseSyncOk).toBe(true);
      expect(
        (delJson.clientLicenses as Array<{ pin_code: string }>).some(
          (l) => l.pin_code === "918273",
        ),
      ).toBe(false);
    });
  });

  it("resolves PIZARRA_KV from Nitro request.runtime.cloudflare.env and globalThis.__env__ when env param is omitted", async () => {
    const kv = createMemoryKv();
    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
              PUT: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    // Reset latestRuntimeEnv first
    await runWithCloudflareEnv({}, async () => {});

    // Simulate Nitro attaching runtime.cloudflare.env onto Request (without AsyncLocalStorage env arg)
    const getReq = new Request("http://localhost/api/public/results/sync");
    (
      getReq as unknown as {
        runtime: { cloudflare: { env: Record<string, unknown> } };
      }
    ).runtime = {
      cloudflare: {
        env: {
          PIZARRA_KV: kv,
          SUPABASE_URL: "https://ebpunrzbagmcdtammjqn.supabase.co",
        },
      },
    };

    const getRes = await serverHandlers.GET({ request: getReq });
    const getJson = await getRes.json();
    expect(getJson.cloudLicenseConfigured).toBe(true);
    expect(getJson.cloudLicenseError).toBeNull();

    // Simulate Nitro globalThis.__env__ on PUT without runtime on request
    const prevGlobalEnv = (globalThis as { __env__?: unknown }).__env__;
    try {
      (globalThis as { __env__?: unknown }).__env__ = {
        PIZARRA_KV: kv,
        SUPABASE_URL: "https://ebpunrzbagmcdtammjqn.supabase.co",
      };
      const putReq = new Request("http://localhost/api/public/results/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licenseAction: {
            type: "create",
            id: generateLicenseUuid(),
            client_name: "prueba nitro kv",
            pin_code: "303495",
            days: 30,
            max_devices: 1,
          },
        }),
      });
      const putRes = await serverHandlers.PUT({ request: putReq });
      const putJson = await putRes.json();
      expect(putJson.cloudLicenseSyncOk).toBe(true);
      expect(putJson.cloudLicenseError).toBeNull();
      expect(
        (putJson.clientLicenses as Array<{ pin_code: string }>).some(
          (l) => l.pin_code === "303495",
        ),
      ).toBe(true);
    } finally {
      (globalThis as { __env__?: unknown }).__env__ = prevGlobalEnv;
      await runWithCloudflareEnv({}, async () => {});
    }
  });

  it("ignores Cloudflare Pages ASSETS Fetcher RPC proxies and uses safe fallback without RPC put errors", async () => {
    const assetsRpcProxy = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "fetch") {
            return async () => new Response("ok");
          }
          return async () => {
            throw new Error(`The RPC receiver does not implement the method "${String(prop)}".`);
          };
        },
      },
    );

    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
              PUT: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    await runWithCloudflareEnv(
      {
        ASSETS: assetsRpcProxy,
        SUPABASE_URL: "https://ebpunrzbagmcdtammjqn.supabase.co",
      },
      async () => {
        expect(getBoundCloudflareKv()).toBeNull();

        const getRes = await serverHandlers.GET({
          request: new Request("http://localhost/api/public/results/sync"),
        });
        const getJson = await getRes.json();
        expect(getJson.cloudLicenseError).toBeNull();
        expect(getJson.cloudLicenseStorageMode).toBe("local-memory");

        const testId = generateLicenseUuid();
        const putRes = await serverHandlers.PUT({
          request: new Request("http://localhost/api/public/results/sync", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              licenseAction: {
                type: "create",
                id: testId,
                client_name: "prueba sin rpc error",
                pin_code: "445566",
                days: 30,
                max_devices: 1,
              },
            }),
          }),
        });
        const putJson = await putRes.json();
        expect(putJson.cloudLicenseSyncOk).toBe(true);
        expect(putJson.cloudLicenseError).toBeNull();

        await serverHandlers.PUT({
          request: new Request("http://localhost/api/public/results/sync", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              licenseAction: {
                type: "delete",
                id: testId,
              },
            }),
          }),
        });
      },
    );
  });

  it("persists licenses via Cloudflare KV REST API when CF_ACCOUNT_ID, CF_API_TOKEN, and CF_KV_NAMESPACE_ID are configured", async () => {
    const restStore = new Map<string, string>();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (
        url.startsWith(
          "https://api.cloudflare.com/client/v4/accounts/acc-123/storage/kv/namespaces/ns-456/values/",
        )
      ) {
        const key = decodeURIComponent(url.split("/values/")[1] || "");
        const method = (init?.method || "GET").toUpperCase();
        if (method === "GET") {
          const val = restStore.get(key);
          if (val === undefined) return new Response("Not found", { status: 404 });
          return new Response(val, { status: 200 });
        }
        if (method === "PUT") {
          restStore.set(key, String(init?.body || ""));
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
              PUT: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    try {
      await runWithCloudflareEnv(
        {
          CF_ACCOUNT_ID: "acc-123",
          CF_API_TOKEN: "tok-secret",
          CF_KV_NAMESPACE_ID: "ns-456",
        },
        async () => {
          const testId = generateLicenseUuid();
          const createRes = await serverHandlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseAction: {
                  type: "create",
                  id: testId,
                  client_name: "cliente kv rest",
                  pin_code: "778899",
                  days: 30,
                  max_devices: 1,
                },
              }),
            }),
          });
          const createJson = await createRes.json();
          expect(createJson.cloudLicenseSyncOk).toBe(true);
          expect(createJson.cloudLicenseConfigured).toBe(true);
          expect(createJson.cloudLicenseStorageMode).toBe("cloudflare-kv");
          expect(restStore.size).toBe(1);

          const getRes = await serverHandlers.GET({
            request: new Request("http://localhost/api/public/results/sync"),
          });
          const getJson = await getRes.json();
          expect(getJson.cloudLicenseStorageMode).toBe("cloudflare-kv");
          expect(
            (getJson.clientLicenses as Array<{ pin_code: string }>).some(
              (l) => l.pin_code === "778899",
            ),
          ).toBe(true);

          await serverHandlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseAction: { type: "delete", id: testId },
              }),
            }),
          });
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not overwrite KV with defaults when KV read fails", async () => {
    let putCalled = false;
    const readErrorKv = {
      async get() {
        throw new Error("KV read timeout");
      },
      async put() {
        putCalled = true;
      },
    };
    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    await runWithCloudflareEnv({ PIZARRA_KV: readErrorKv }, async () => {
      const getRes = await serverHandlers.GET({
        request: new Request("http://localhost/api/public/results/sync"),
      });
      const getJson = await getRes.json();
      expect(putCalled).toBe(false);
      expect(getJson.cloudLicenseError).toContain("KV read timeout");
    });
  });

  it("writes licenses directly to client_licenses.persisted.json and reports workspaceLicenseFileActive for GitHub push workflow", async () => {
    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
              PUT: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    await runWithCloudflareEnv({}, async () => {
      const testId = generateLicenseUuid();
      const putRes = await serverHandlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "create",
              id: testId,
              client_name: "agencia repo github",
              pin_code: "112233",
              days: 30,
              max_devices: 1,
            },
          }),
        }),
      });
      const putJson = await putRes.json();
      expect(putJson.workspaceLicenseFileActive).toBe(true);
      expect(putJson.cloudLicenseSyncOk).toBe(true);

      const diskRaw = fs.readFileSync(WORKSPACE_LICENSES_PATH, "utf-8");
      const diskParsed = JSON.parse(diskRaw) as {
        licenses: Array<{ pin_code: string; client_name: string }>;
      };
      expect(
        diskParsed.licenses.some(
          (l) => l.pin_code === "112233" && l.client_name === "agencia repo github",
        ),
      ).toBe(true);

      const getRes = await serverHandlers.GET({
        request: new Request("http://localhost/api/public/results/sync"),
      });
      const getJson = await getRes.json();
      expect(getJson.workspaceLicenseFileActive).toBe(true);

      await serverHandlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: { type: "delete", id: testId },
          }),
        }),
      });
    });
  });

  it("ignores dead .lovable.cloud SUPABASE_URL in Preview without Cloudflare error 1016", async () => {
    const serverHandlers = (
      SyncRoute as unknown as {
        options: {
          server: {
            handlers: {
              GET: (ctx: { request: Request }) => Promise<Response>;
              PUT: (ctx: { request: Request }) => Promise<Response>;
            };
          };
        };
      }
    ).options.server.handlers;

    await runWithCloudflareEnv(
      {
        SUPABASE_URL: "https://c--3a6ab190-4f7e-4548-9e20-102bf4b52d68-prod.lovable.cloud",
        SUPABASE_SERVICE_ROLE_KEY: "dummy-key",
      },
      async () => {
        expect(createRealSupabaseAdminClient()).toBeNull();
        const getRes = await serverHandlers.GET({
          request: new Request("http://localhost/api/public/results/sync"),
        });
        const getJson = await getRes.json();
        expect(getJson.cloudLicenseError).toBeNull();
        expect(getJson.workspaceLicenseFileActive).toBe(true);
      },
    );
  });

  it("authenticates Cloudflare KV REST GET, PUT, and DELETE via Global API Key (X-Auth-Key + X-Auth-Email)", async () => {
    const restStore = new Map<string, string>();
    const observedHeaders: Array<{ method: string; headers: Record<string, string> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (
        url.startsWith(
          "https://api.cloudflare.com/client/v4/accounts/acc-global/storage/kv/namespaces/ns-global/values/",
        )
      ) {
        const key = decodeURIComponent(url.split("/values/")[1] || "");
        const method = (init?.method || "GET").toUpperCase();
        const hdrs = (init?.headers || {}) as Record<string, string>;
        observedHeaders.push({ method, headers: { ...hdrs } });
        if (
          hdrs["X-Auth-Key"] !== "global-key-123" ||
          hdrs["X-Auth-Email"] !== "admin@example.com"
        ) {
          return new Response(JSON.stringify({ success: false, errors: [{ code: 10000 }] }), {
            status: 401,
          });
        }
        if (method === "GET") {
          const val = restStore.get(key);
          if (val === undefined) return new Response("Not found", { status: 404 });
          return new Response(val, { status: 200 });
        }
        if (method === "PUT") {
          restStore.set(key, String(init?.body || ""));
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (method === "DELETE") {
          restStore.delete(key);
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      await runWithCloudflareEnv(
        {
          CF_ACCOUNT_ID: "acc-global",
          CF_KV_NAMESPACE_ID: "ns-global",
          CF_API_KEY: "  global-key-123 ",
          CF_EMAIL: " admin@example.com  ",
        },
        async () => {
          const kv = getBoundCloudflareKv();
          expect(kv).not.toBeNull();
          await kv!.put("k1", "val1");
          expect(await kv!.get("k1", "text")).toBe("val1");
          await kv!.delete!("k1");
          expect(await kv!.get("k1", "text")).toBeNull();

          expect(observedHeaders.map((o) => o.method)).toEqual(["PUT", "GET", "DELETE", "GET"]);
          for (const entry of observedHeaders) {
            expect(entry.headers["Content-Type"]).toBe("text/plain");
            expect(entry.headers["X-Auth-Key"]).toBe("global-key-123");
            expect(entry.headers["X-Auth-Email"]).toBe("admin@example.com");
            expect(entry.headers["Authorization"]).toBeUndefined();
          }
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
