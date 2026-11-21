import { describe, it, expect, afterAll, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { runWithCloudflareEnv, getRuntimeEnvVar } from "@/lib/cloudflare-env.server";
import {
  getSupabaseCloudDiagnostics,
  createRealSupabaseAdminClient,
} from "@/integrations/supabase/client.server";
import { Route as SyncRoute } from "@/routes/api/public/results/sync";
import { generateLicenseUuid } from "@/lib/license-lotteries";

const WORKSPACE_LICENSES_PATH = path.join(process.cwd(), "client_licenses.persisted.json");
const WORKSPACE_ANIMAL_IMAGES_PATH = path.join(process.cwd(), "animal_images.persisted.json");
const WORKSPACE_APP_SETTINGS_PATH = path.join(process.cwd(), "app_settings.persisted.json");

type SyncHandlers = {
  GET: (ctx: { request: Request }) => Promise<Response>;
  PUT: (ctx: { request: Request }) => Promise<Response>;
};

function getSyncHandlers(): SyncHandlers {
  return (
    SyncRoute as unknown as {
      options: {
        server: {
          handlers: SyncHandlers;
        };
      };
    }
  ).options.server.handlers;
}

describe("Supabase licenses table & animal-images Storage bucket integration", () => {
  let originalLicensesFileContent: string | null = null;
  let originalAnimalImagesFileContent: string | null = null;
  let originalAppSettingsFileContent: string | null = null;

  beforeAll(() => {
    if (fs.existsSync(WORKSPACE_LICENSES_PATH)) {
      originalLicensesFileContent = fs.readFileSync(WORKSPACE_LICENSES_PATH, "utf-8");
    }
    if (fs.existsSync(WORKSPACE_ANIMAL_IMAGES_PATH)) {
      originalAnimalImagesFileContent = fs.readFileSync(WORKSPACE_ANIMAL_IMAGES_PATH, "utf-8");
    }
    if (fs.existsSync(WORKSPACE_APP_SETTINGS_PATH)) {
      originalAppSettingsFileContent = fs.readFileSync(WORKSPACE_APP_SETTINGS_PATH, "utf-8");
    }
  });

  afterAll(async () => {
    if (originalLicensesFileContent !== null) {
      fs.writeFileSync(WORKSPACE_LICENSES_PATH, originalLicensesFileContent);
    }
    if (originalAnimalImagesFileContent !== null) {
      fs.writeFileSync(WORKSPACE_ANIMAL_IMAGES_PATH, originalAnimalImagesFileContent);
    }
    if (originalAppSettingsFileContent !== null) {
      fs.writeFileSync(WORKSPACE_APP_SETTINGS_PATH, originalAppSettingsFileContent);
    }
    await runWithCloudflareEnv({}, async () => {});
  });

  it("reads SUPABASE_URL and SUPABASE_KEY from Cloudflare Worker runtime env", async () => {
    await runWithCloudflareEnv(
      {
        SUPABASE_URL: "https://example-project.supabase.co",
        SUPABASE_KEY: "sb_secret_test_key_123",
      },
      async () => {
        expect(getRuntimeEnvVar("SUPABASE_URL")).toBe("https://example-project.supabase.co");
        expect(getRuntimeEnvVar("SUPABASE_KEY")).toBe("sb_secret_test_key_123");

        const diag = getSupabaseCloudDiagnostics();
        expect(diag.configured).toBe(true);
        expect(diag.hasServiceRoleKey).toBe(true);
        expect(diag.url).toBe("https://example-project.supabase.co");
        expect(createRealSupabaseAdminClient()).not.toBeNull();
      },
    );
  });

  it("reports missing Supabase config explicitly and uses safe local fallback when unconfigured", async () => {
    const handlers = getSyncHandlers();
    await runWithCloudflareEnv({}, async () => {
      const diag = getSupabaseCloudDiagnostics();
      expect(diag.configured).toBe(false);
      expect(diag.reason).toMatch(/SUPABASE_URL/i);
      expect(createRealSupabaseAdminClient()).toBeNull();

      const testId = generateLicenseUuid();
      const putRes = await handlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
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
        }),
      });
      const putJson = await putRes.json();
      expect(putJson.cloudLicenseSyncOk).toBe(true);
      expect(putJson.cloudLicenseError).toBeNull();
      expect(putJson.cloudLicenseStorageMode).toBe("local-memory");

      await handlers.PUT({
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
    const handlers = getSyncHandlers();
    await runWithCloudflareEnv(
      {
        SUPABASE_URL: "https://c--3a6ab190-4f7e-4548-9e20-102bf4b52d68-prod.lovable.cloud",
        SUPABASE_KEY: "dummy-key",
      },
      async () => {
        expect(createRealSupabaseAdminClient()).toBeNull();
        const getRes = await handlers.GET({
          request: new Request("http://localhost/api/public/results/sync"),
        });
        const getJson = await getRes.json();
        expect(getJson.cloudLicenseError).toBeNull();
        expect(getJson.cloudLicenseStorageMode).toBe("local-memory");
      },
    );
  });

  it("persists licenses CRUD via @supabase/supabase-js against the 'licenses' table using SUPABASE_URL and SUPABASE_KEY", async () => {
    const sbRows = new Map<string, Record<string, unknown>>();
    const observedTablePaths: string[] = [];
    const observedApiKeys: string[] = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://live-pizarra.supabase.co/rest/v1/")) {
        const parsed = new URL(url);
        const table = parsed.pathname.replace("/rest/v1/", "");
        observedTablePaths.push(table);
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        if (init?.headers) {
          new Headers(init.headers).forEach((v, k) => headers.set(k, v));
        }
        const apikey = headers.get("apikey");
        if (apikey) observedApiKeys.push(apikey);

        const method = (
          init?.method || (input instanceof Request ? input.method : "GET")
        ).toUpperCase();

        if (table !== "licenses") {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        const pinFilter = parsed.searchParams.get("pin_code");
        const idFilter = parsed.searchParams.get("id");
        const acceptHeader = headers.get("accept") || "";
        const wantsObject = acceptHeader.includes("application/vnd.pgrst.object+json");

        if (method === "GET") {
          let rows = Array.from(sbRows.values());
          if (pinFilter?.startsWith("eq.")) {
            const targetPin = pinFilter.slice(3);
            rows = rows.filter((r) => r["pin_code"] === targetPin);
          }
          if (idFilter?.startsWith("eq.")) {
            const targetId = idFilter.slice(3);
            rows = rows.filter((r) => r["id"] === targetId);
          }
          if (wantsObject) {
            if (rows.length === 0) {
              return new Response(JSON.stringify({ code: "PGRST116", message: "0 rows" }), {
                status: 406,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response(JSON.stringify(rows[0]), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method === "POST") {
          const rawBody =
            typeof init?.body === "string"
              ? init.body
              : input instanceof Request
                ? await input.clone().text()
                : "";
          const bodyData = JSON.parse(rawBody);
          const list = Array.isArray(bodyData) ? bodyData : [bodyData];
          for (const row of list) {
            sbRows.set(String(row.id), { ...row });
          }
          return new Response(JSON.stringify(list), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (method === "DELETE") {
          if (idFilter?.startsWith("eq.")) {
            sbRows.delete(idFilter.slice(3));
          }
          if (pinFilter?.startsWith("eq.")) {
            const targetPin = pinFilter.slice(3);
            for (const [k, v] of Array.from(sbRows.entries())) {
              if (v["pin_code"] === targetPin) sbRows.delete(k);
            }
          }
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const handlers = getSyncHandlers();

    try {
      await runWithCloudflareEnv(
        {
          SUPABASE_URL: "https://live-pizarra.supabase.co",
          SUPABASE_KEY: "eyJtest.supabase.service.key",
        },
        async () => {
          const testId = generateLicenseUuid();
          const packedName =
            'agencia supabase||{"loterias":["lotto-activo","granjita"],"tarjetasPorPantalla":4}';

          // 1. Create license -> writes to /rest/v1/licenses
          const createRes = await handlers.PUT({
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
          expect(createJson.cloudLicenseConfigured).toBe(true);
          expect(createJson.cloudLicenseStorageMode).toBe("supabase");
          expect(sbRows.has(testId)).toBe(true);

          // 2. Verify all license table calls hit 'licenses', never 'client_licenses'
          expect(observedTablePaths).toContain("licenses");
          expect(observedTablePaths).not.toContain("client_licenses");
          expect(observedApiKeys.every((k) => k === "eyJtest.supabase.service.key")).toBe(true);

          // 3. GET returns license from 'licenses' table
          const getRes = await handlers.GET({
            request: new Request("http://localhost/api/public/results/sync"),
          });
          const getJson = await getRes.json();
          expect(getJson.cloudLicenseStorageMode).toBe("supabase");
          const found = (
            getJson.clientLicenses as Array<{ id: string; pin_code: string; client_name: string }>
          ).find((l) => l.pin_code === "918273");
          expect(found?.client_name).toBe(packedName);

          // 4. Activate PIN with device_id
          const actRes = await handlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseAction: {
                  type: "activate_pin",
                  pin_code: "918273",
                  device_id: "TV-SB-01",
                },
              }),
            }),
          });
          const actJson = await actRes.json();
          expect(actJson.licenseActivation?.valid).toBe(true);
          expect(actJson.licenseActivation?.license?.bound_device_ids).toContain("TV-SB-01");

          // 5. Pause status
          const pauseRes = await handlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseAction: {
                  type: "toggle_status",
                  id: testId,
                },
              }),
            }),
          });
          const pauseJson = await pauseRes.json();
          expect(pauseJson.cloudLicenseSyncOk).toBe(true);
          expect(sbRows.get(testId)?.["status"]).toBe("paused");

          // 6. Delete license
          const delRes = await handlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseAction: { type: "delete", id: testId },
              }),
            }),
          });
          const delJson = await delRes.json();
          expect(delJson.cloudLicenseSyncOk).toBe(true);
          expect(sbRows.has(testId)).toBe(false);
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rolls back local state and reports exact error when Supabase 'licenses' write fails (RLS 42501)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://rls-test.supabase.co/rest/v1/licenses")) {
        const method = (
          init?.method || (input instanceof Request ? input.method : "GET")
        ).toUpperCase();
        if (method === "GET") {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            code: "42501",
            message: 'new row violates row-level security policy for table "licenses"',
            details: "Failing row contains (...)",
            hint: "Create an RLS policy or use service_role key",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("https://rls-test.supabase.co/rest/v1/")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const handlers = getSyncHandlers();
    try {
      await runWithCloudflareEnv(
        {
          SUPABASE_URL: '"rls-test.supabase.co"',
          SUPABASE_KEY: '"anon-key-restricted"',
        },
        async () => {
          const testId = generateLicenseUuid();
          const putRes = await handlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                licenseAction: {
                  type: "create",
                  id: testId,
                  client_name: "fallo rls",
                  pin_code: "665544",
                  days: 30,
                  max_devices: 1,
                },
              }),
            }),
          });
          const putJson = await putRes.json();
          expect(putJson.cloudLicenseSyncOk).toBe(false);
          expect(putJson.cloudLicenseError).toMatch(/42501/);
          expect(putJson.cloudLicenseError).toMatch(/Failing row contains/);
          expect(putJson.cloudLicenseError).toMatch(/Create an RLS policy/);
          expect(putJson.cloudLicenseError).not.toMatch(/Error updating result/i);
          expect(putJson.supabaseError).toMatchObject({
            code: "42501",
            message: 'new row violates row-level security policy for table "licenses"',
            details: "Failing row contains (...)",
            hint: "Create an RLS policy or use service_role key",
            table: "licenses",
          });
          expect(
            (putJson.clientLicenses as Array<{ pin_code: string }>).some(
              (l) => l.pin_code === "665544",
            ),
          ).toBe(false);
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("resolves SUPABASE_URL and SUPABASE_KEY from Nitro request.runtime.cloudflare.env and globalThis.__env__", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://nitro-sb.supabase.co/rest/v1/")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const handlers = getSyncHandlers();
    const prevGlobalEnv = (globalThis as { __env__?: unknown }).__env__;

    try {
      await runWithCloudflareEnv({}, async () => {});
      const getReq = new Request("http://localhost/api/public/results/sync");
      (
        getReq as unknown as {
          runtime: { cloudflare: { env: Record<string, unknown> } };
        }
      ).runtime = {
        cloudflare: {
          env: {
            SUPABASE_URL: "https://nitro-sb.supabase.co",
            SUPABASE_KEY: "sb_secret_nitro_key",
          },
        },
      };

      const getRes = await handlers.GET({ request: getReq });
      const getJson = await getRes.json();
      expect(getJson.cloudLicenseConfigured).toBe(true);
      expect(getJson.cloudLicenseStorageMode).toBe("supabase");

      // Also test globalThis.__env__ fallback
      await runWithCloudflareEnv({}, async () => {});
      (globalThis as { __env__?: unknown }).__env__ = {
        SUPABASE_URL: "https://nitro-sb.supabase.co",
        SUPABASE_KEY: "sb_secret_global_key",
      };
      expect(getRuntimeEnvVar("SUPABASE_KEY")).toBe("sb_secret_global_key");
      expect(getSupabaseCloudDiagnostics().configured).toBe(true);
    } finally {
      (globalThis as { __env__?: unknown }).__env__ = prevGlobalEnv;
      globalThis.fetch = originalFetch;
      await runWithCloudflareEnv({}, async () => {});
    }
  });

  it("uploads DataURL animal images to Supabase Storage bucket 'animal-images' and removes them on delete", async () => {
    const uploadedStoragePaths: string[] = [];
    const deletedStoragePaths: string[] = [];
    const savedAnimalImageRows: Array<Record<string, unknown>> = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (
        init?.method || (input instanceof Request ? input.method : "GET")
      ).toUpperCase();

      // Supabase Storage upload to bucket 'animal-images'
      if (
        url.startsWith("https://storage-sb.supabase.co/storage/v1/object/animal-images/") &&
        (method === "POST" || method === "PUT")
      ) {
        const objectPath = url.split("/storage/v1/object/animal-images/")[1] || "";
        uploadedStoragePaths.push(objectPath);
        return new Response(JSON.stringify({ Key: `animal-images/${objectPath}` }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Supabase Storage remove from bucket 'animal-images'
      if (
        url.startsWith("https://storage-sb.supabase.co/storage/v1/object/animal-images") &&
        method === "DELETE"
      ) {
        const rawBody =
          typeof init?.body === "string"
            ? init.body
            : input instanceof Request
              ? await input.clone().text()
              : "{}";
        const parsed = JSON.parse(rawBody) as { prefixes?: string[] };
        if (Array.isArray(parsed.prefixes)) {
          deletedStoragePaths.push(...parsed.prefixes);
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.startsWith("https://storage-sb.supabase.co/rest/v1/animal_images")) {
        if (method === "POST") {
          const rawBody =
            typeof init?.body === "string"
              ? init.body
              : input instanceof Request
                ? await input.clone().text()
                : "{}";
          savedAnimalImageRows.push(JSON.parse(rawBody));
          return new Response(rawBody, {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.startsWith("https://storage-sb.supabase.co/rest/v1/")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return originalFetch(input, init);
    }) as typeof fetch;

    const handlers = getSyncHandlers();
    const tinyPngDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    try {
      await runWithCloudflareEnv(
        {
          SUPABASE_URL: "https://storage-sb.supabase.co",
          SUPABASE_KEY: "sb_secret_storage_key",
        },
        async () => {
          const putRes = await handlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                animalImage: {
                  game_id: "lotto-activo",
                  animal_number: 7,
                  image_url: tinyPngDataUrl,
                },
              }),
            }),
          });
          const putJson = await putRes.json();

          expect(putJson.animalImageStorageError).toBeNull();
          expect(uploadedStoragePaths.length).toBe(1);
          expect(uploadedStoragePaths[0]).toMatch(/^animals\/lotto-activo\/animal-7-\d+\.png$/);
          expect(putJson.uploadedAnimalImageUrl).toBe(
            `https://storage-sb.supabase.co/storage/v1/object/public/animal-images/${uploadedStoragePaths[0]}`,
          );
          expect(savedAnimalImageRows.length).toBe(1);
          expect(savedAnimalImageRows[0]?.["image_url"]).toBe(putJson.uploadedAnimalImageUrl);

          // Delete should remove the uploaded path from 'animal-images' bucket
          await handlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                deleteAnimalImage: {
                  game_id: "lotto-activo",
                  animal_number: 7,
                },
              }),
            }),
          });
          expect(deletedStoragePaths).toContain(uploadedStoragePaths[0]);
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects creating a new license with a duplicate PIN instead of overwriting an existing client", async () => {
    const handlers = getSyncHandlers();
    await runWithCloudflareEnv({}, async () => {
      const idA = generateLicenseUuid();
      const idB = generateLicenseUuid();

      // Create Client A with PIN 778899
      const createA = await handlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "create",
              id: idA,
              client_name: 'Cliente Original||{"loterias":["granjita"],"tarjetasPorPantalla":4}',
              pin_code: "778899",
              days: 30,
              max_devices: 1,
            },
          }),
        }),
      });
      const jsonA = await createA.json();
      expect(jsonA.cloudLicenseSyncOk).toBe(true);

      // Attempt to create Client B with the SAME PIN 778899
      const createB = await handlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: {
              type: "create",
              id: idB,
              client_name: "Cliente Duplicado",
              pin_code: "778899",
              days: 30,
              max_devices: 1,
            },
          }),
        }),
      });
      const jsonB = await createB.json();
      expect(jsonB.cloudLicenseSyncOk).toBe(false);
      expect(jsonB.cloudLicenseError).toMatch(/778899/);

      // Original Client A must remain untouched
      const originalStillIntact = (
        jsonB.clientLicenses as Array<{ id: string; client_name: string; pin_code: string }>
      ).find((l) => l.pin_code === "778899");
      expect(originalStillIntact?.id).toBe(idA);
      expect(originalStillIntact?.client_name).toContain("Cliente Original");

      // Clean up
      await handlers.PUT({
        request: new Request("http://localhost/api/public/results/sync", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            licenseAction: { type: "delete", id: idA },
          }),
        }),
      });
    });
  });

  it("persists global appSettings (colors, font_family, card_style, game_colors, scales) to Supabase app_settings and returns them cleanly on fresh GET (Incognito)", async () => {
    let storedAppSettingsRow: Record<string, unknown> | null = null;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://global-design.supabase.co/rest/v1/")) {
        const parsed = new URL(url);
        const table = parsed.pathname.replace("/rest/v1/", "");
        const method = (
          init?.method || (input instanceof Request ? input.method : "GET")
        ).toUpperCase();
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        if (init?.headers) {
          new Headers(init.headers).forEach((v, k) => headers.set(k, v));
        }
        const wantsObject = (headers.get("accept") || "").includes(
          "application/vnd.pgrst.object+json",
        );

        if (table === "app_settings") {
          if (method === "GET") {
            if (wantsObject) {
              if (!storedAppSettingsRow) {
                return new Response(JSON.stringify({ code: "PGRST116", message: "0 rows" }), {
                  status: 406,
                  headers: { "Content-Type": "application/json" },
                });
              }
              return new Response(JSON.stringify(storedAppSettingsRow), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response(
              JSON.stringify(storedAppSettingsRow ? [storedAppSettingsRow] : []),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            );
          }
          if (method === "POST") {
            const rawBody =
              typeof init?.body === "string"
                ? init.body
                : input instanceof Request
                  ? await input.clone().text()
                  : "{}";
            const parsedBody = JSON.parse(rawBody);
            const row = Array.isArray(parsedBody) ? parsedBody[0] : parsedBody;
            storedAppSettingsRow = { ...row };
            return new Response(JSON.stringify([storedAppSettingsRow]), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const handlers = getSyncHandlers();
    try {
      await runWithCloudflareEnv(
        {
          SUPABASE_URL: "https://global-design.supabase.co",
          SUPABASE_KEY: "eyJtest.global.design.key",
        },
        async () => {
          const putRes = await handlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                appSettings: {
                  id: "global",
                  background_color: "#000000",
                  surface_color: "#111111",
                  primary_color: "#10b981",
                  text_color: "#ffffff",
                  card_color: "#0a0a0a",
                  result_row_color: "#141414",
                  font_family: "Georgia",
                  base_font_size: 18,
                  card_style: "solid",
                  logo_size: 84,
                  font_size_scale: 112,
                  hero_card_scale: 105,
                  animal_scale: 110,
                  game_colors: { "la-granjita": "#facc15" },
                  updated_at: "2026-11-20T22:15:00.000Z",
                },
              }),
            }),
          });
          const putJson = await putRes.json();
          expect(putJson.cloudSettingsSyncOk).toBe(true);
          expect(putJson.cloudSettingsError).toBeNull();
          expect(storedAppSettingsRow).not.toBeNull();
          expect(storedAppSettingsRow?.["surface_color"]).toBe("#111111");
          expect(storedAppSettingsRow?.["card_color"]).toBe("#0a0a0a");

          // Fresh Incognito GET (even with stale poll/settingsVersion query) always receives decoded global design
          const getRes = await handlers.GET({
            request: new Request(
              "http://localhost/api/public/results/sync?poll=1&settingsVersion=1",
            ),
          });
          const getJson = await getRes.json();
          expect(getJson.appSettings?.background_color).toBe("#000000");
          expect(getJson.appSettings?.surface_color).toBe("#111111");
          expect(getJson.appSettings?.card_color).toBe("#0a0a0a");
          expect(getJson.appSettings?.result_row_color).toBe("#141414");
          expect(getJson.appSettings?.font_family).toBe("Georgia");
          expect(getJson.appSettings?.card_style).toBe("solid");
          expect(getJson.appSettings?.logo_size).toBe(84);
          expect(getJson.appSettings?.font_size_scale).toBe(112);
          expect(getJson.appSettings?.game_colors).toEqual({ "la-granjita": "#facc15" });
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("persists global appSettings via Master License (291007) in 'licenses' table when 'app_settings' table fails with RLS/error and resets client license design overrides", async () => {
    const originalFetch = globalThis.fetch;
    const storedLicenses = new Map<string, Record<string, unknown>>();
    storedLicenses.set("11111111-1111-4111-8111-111111111111", {
      id: "11111111-1111-4111-8111-111111111111",
      client_name:
        'taller||{"tarjetasPorPantalla":8,"tiempoTransicion":25,"diseno":{"card_color":"#0f172a","surface_color":"#0f172a","background_color":"#020617","useCustomDesign":true}}',
      pin_code: "554433",
      status: "active",
      expires_at: null,
      max_devices: 2,
      bound_device_ids: [],
      notes: "",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (urlStr.startsWith("https://fallback-design.supabase.co/rest/v1/")) {
        const parsedUrl = new URL(urlStr);
        const table = parsedUrl.pathname.replace("/rest/v1/", "");
        const method = (
          init?.method ||
          (input instanceof Request ? input.method : "GET") ||
          "GET"
        ).toUpperCase();

        // Simulate app_settings table failing with RLS error 42501
        if (table === "app_settings") {
          return new Response(
            JSON.stringify({
              code: "42501",
              message: 'new row violates row-level security policy for table "app_settings"',
              details: null,
              hint: null,
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (table === "licenses") {
          if (method === "GET") {
            const pinEq = parsedUrl.searchParams.get("pin_code");
            let rows = Array.from(storedLicenses.values());
            if (pinEq?.startsWith("eq.")) {
              const targetPin = pinEq.slice(3);
              rows = rows.filter((r) => r["pin_code"] === targetPin);
            }
            const headers = new Headers(input instanceof Request ? input.headers : undefined);
            if (init?.headers) {
              new Headers(init.headers).forEach((v, k) => headers.set(k, v));
            }
            const wantsObject = (headers.get("accept") || "").includes(
              "application/vnd.pgrst.object+json",
            );
            if (wantsObject) {
              return new Response(JSON.stringify(rows[0] ?? null), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response(JSON.stringify(rows), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (method === "POST" || method === "PATCH") {
            const rawBody =
              typeof init?.body === "string"
                ? init.body
                : input instanceof Request
                  ? await input.clone().text()
                  : "{}";
            const parsedBody = JSON.parse(rawBody);
            const incomingRows = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
            const savedRows: Record<string, unknown>[] = [];
            for (const row of incomingRows) {
              const id =
                (row["id"] as string) ||
                parsedUrl.searchParams.get("id")?.replace(/^eq\./, "") ||
                "00000000-0000-4000-8000-000000291007";
              const existing = storedLicenses.get(id) || {};
              const merged = { ...existing, ...row, id };
              storedLicenses.set(id, merged);
              savedRows.push(merged);
            }
            return new Response(JSON.stringify(savedRows), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const handlers = getSyncHandlers();
    try {
      await runWithCloudflareEnv(
        {
          SUPABASE_URL: "https://fallback-design.supabase.co",
          SUPABASE_KEY: "eyJtest.fallback.design.key",
        },
        async () => {
          const putRes = await handlers.PUT({
            request: new Request("http://localhost/api/public/results/sync", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                applyToAllLicenses: true,
                appSettings: {
                  id: "global",
                  background_color: "#000000",
                  surface_color: "#000000",
                  primary_color: "#2563eb",
                  text_color: "#ffffff",
                  card_color: "#000000",
                  result_row_color: "#0a0a0a",
                  font_family: "Inter",
                  card_style: "neon",
                  updated_at: "2026-11-20T23:00:00.000Z",
                },
              }),
            }),
          });
          const putJson = await putRes.json();
          expect(putJson.cloudSettingsSyncOk).toBe(true);
          expect(putJson.cloudSettingsError).toBeNull();

          // Master license row in Supabase 'licenses' table now holds ||GLOBAL_DESIGN:
          const masterRow = storedLicenses.get("00000000-0000-4000-8000-000000291007");
          expect(masterRow).toBeDefined();
          expect(String(masterRow?.["notes"])).toContain("||GLOBAL_DESIGN:");

          // Client license "taller" had its old navy-blue diseno override stripped so it uses Global Design
          const tallerRow = storedLicenses.get("11111111-1111-4111-8111-111111111111");
          expect(String(tallerRow?.["client_name"])).not.toContain('"diseno"');
          expect(String(tallerRow?.["client_name"])).not.toContain("#0f172a");
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
