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

  beforeAll(() => {
    if (fs.existsSync(WORKSPACE_LICENSES_PATH)) {
      originalLicensesFileContent = fs.readFileSync(WORKSPACE_LICENSES_PATH, "utf-8");
    }
    if (fs.existsSync(WORKSPACE_ANIMAL_IMAGES_PATH)) {
      originalAnimalImagesFileContent = fs.readFileSync(WORKSPACE_ANIMAL_IMAGES_PATH, "utf-8");
    }
  });

  afterAll(async () => {
    if (originalLicensesFileContent !== null) {
      fs.writeFileSync(WORKSPACE_LICENSES_PATH, originalLicensesFileContent);
    }
    if (originalAnimalImagesFileContent !== null) {
      fs.writeFileSync(WORKSPACE_ANIMAL_IMAGES_PATH, originalAnimalImagesFileContent);
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
          SUPABASE_URL: "https://rls-test.supabase.co",
          SUPABASE_KEY: "anon-key-restricted",
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
          expect(putJson.cloudLicenseError).toMatch(/licenses/i);
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
});
