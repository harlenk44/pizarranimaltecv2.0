import { describe, it, expect } from "vitest";
import {
  parseClientLicenseName,
  formatClientLicenseName,
  isLotteryPermitted,
  getResponsiveBoardGridStyle,
  ALL_AVAILABLE_LOTTERIES,
  saveLocalLicenseOverride,
  reconcileClientLicensesWithLocal,
  isValidUuid,
  generateLicenseUuid,
  toSupabaseLicenseUuid,
  MASTER_LICENSE_UUID,
} from "@/lib/license-lotteries";

describe("license-lotteries utilities", () => {
  it("preserves backward compatibility when no delimiter || exists", () => {
    const existingNames = ["Mariana", "EXITO CARUPANO", "José barreto", "Administrador Maestro"];

    for (const name of existingNames) {
      const parsed = parseClientLicenseName(name);
      expect(parsed.cleanName).toBe(name);
      expect(parsed.allowedLotteries).toBeNull();
      expect(parsed.cardsPerScreen).toBe(8);
      // All lotteries should be permitted
      expect(isLotteryPermitted("lotto-activo", parsed.allowedLotteries)).toBe(true);
      expect(isLotteryPermitted("triple-ricachona", parsed.allowedLotteries)).toBe(true);
      expect(isLotteryPermitted("guacharo", parsed.allowedLotteries)).toBe(true);
      expect(
        isLotteryPermitted("ca8a0400-0000-4000-8000-000000000006", parsed.allowedLotteries),
      ).toBe(true);
    }
  });

  it("extracts cleanName and allowedLotteries when packed with || JSON", () => {
    const raw = 'Agencia Mariana||["lotto-activo","granjita","triple-ricachona"]';
    const parsed = parseClientLicenseName(raw);

    expect(parsed.cleanName).toBe("Agencia Mariana");
    expect(parsed.allowedLotteries).toEqual(["lotto-activo", "granjita", "triple-ricachona"]);
    expect(parsed.cardsPerScreen).toBe(8);

    // Permitted lotteries
    expect(isLotteryPermitted("lotto-activo", parsed.allowedLotteries)).toBe(true);
    expect(isLotteryPermitted("granjita", parsed.allowedLotteries)).toBe(true);
    expect(isLotteryPermitted("la-granjita", parsed.allowedLotteries)).toBe(true);
    expect(isLotteryPermitted("triple-ricachona", parsed.allowedLotteries)).toBe(true);

    // Disallowed lotteries
    expect(isLotteryPermitted("guacharo", parsed.allowedLotteries)).toBe(false);
    expect(isLotteryPermitted("triple-zulia", parsed.allowedLotteries)).toBe(false);
    expect(isLotteryPermitted("selva-plus", parsed.allowedLotteries)).toBe(false);
  });

  it("handles UUID matching for animalito games", () => {
    const raw = 'Agencia Centro||["granjita","guacharo"]';
    const parsed = parseClientLicenseName(raw);

    // ca8a0400-0000-4000-8000-000000000006 is granjita
    expect(
      isLotteryPermitted("ca8a0400-0000-4000-8000-000000000006", parsed.allowedLotteries),
    ).toBe(true);
    // 01da9c54-392a-45e3-ab66-9a08befe7694 is guacharo
    expect(
      isLotteryPermitted("01da9c54-392a-45e3-ab66-9a08befe7694", parsed.allowedLotteries),
    ).toBe(true);
    // 7d21a00b-0dfa-4bdc-9edf-8115802df1d6 is lotto-activo (not included)
    expect(
      isLotteryPermitted("7d21a00b-0dfa-4bdc-9edf-8115802df1d6", parsed.allowedLotteries),
    ).toBe(false);
  });

  it("formats client name cleanly when all lotteries are selected and default 8 cards per screen", () => {
    const formatted = formatClientLicenseName(
      "Agencia Bolívar",
      ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
      ALL_AVAILABLE_LOTTERIES.length,
    );
    expect(formatted).toBe("Agencia Bolívar");
  });

  it("formats client name with packed JSON when subset is selected", () => {
    const formatted = formatClientLicenseName(
      "Agencia Bolívar",
      ["lotto-activo", "triple-ricachona"],
      ALL_AVAILABLE_LOTTERIES.length,
    );
    expect(formatted).toBe('Agencia Bolívar||["lotto-activo","triple-ricachona"]');
  });

  it("packs and parses custom cardsPerScreen (e.g. 2 products per screen or TODAS)", () => {
    const packed2 = formatClientLicenseName(
      "Agencia Dos",
      ["lotto-activo", "granjita"],
      ALL_AVAILABLE_LOTTERIES.length,
      2,
    );
    const parsed2 = parseClientLicenseName(packed2);
    expect(parsed2.cleanName).toBe("Agencia Dos");
    expect(parsed2.allowedLotteries).toEqual(["lotto-activo", "granjita"]);
    expect(parsed2.cardsPerScreen).toBe(2);

    const packedAll = formatClientLicenseName(
      "Agencia Todas",
      ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
      ALL_AVAILABLE_LOTTERIES.length,
      "TODAS",
    );
    const parsedAll = parseClientLicenseName(packedAll);
    expect(parsedAll.cleanName).toBe("Agencia Todas");
    expect(parsedAll.allowedLotteries).toBeNull();
    expect(parsedAll.cardsPerScreen).toBe("TODAS");
  });

  it("packs and parses custom transitionSeconds (e.g. 15s, 30s, or defaulting to 25s)", () => {
    // Default transition is 25s when unspecified
    const parsedDefault = parseClientLicenseName("Agencia Regular");
    expect(parsedDefault.transitionSeconds).toBe(25);

    // Legacy JSON array format retains default 25s
    const parsedLegacy = parseClientLicenseName('Agencia Vieja||["lotto-activo"]');
    expect(parsedLegacy.transitionSeconds).toBe(25);

    // Custom transition packed cleanly
    const packedCustom = formatClientLicenseName(
      "Agencia Rápida",
      ["lotto-activo"],
      ALL_AVAILABLE_LOTTERIES.length,
      8,
      15,
    );
    const parsedCustom = parseClientLicenseName(packedCustom);
    expect(parsedCustom.cleanName).toBe("Agencia Rápida");
    expect(parsedCustom.cardsPerScreen).toBe(8);
    expect(parsedCustom.transitionSeconds).toBe(15);

    // Custom cards and transition together
    const packedBoth = formatClientLicenseName(
      "Agencia Completa",
      ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
      ALL_AVAILABLE_LOTTERIES.length,
      4,
      30,
    );
    const parsedBoth = parseClientLicenseName(packedBoth);
    expect(parsedBoth.cleanName).toBe("Agencia Completa");
    expect(parsedBoth.cardsPerScreen).toBe(4);
    expect(parsedBoth.transitionSeconds).toBe(30);
  });

  it("computes responsive grid columns/rows and proportional scaling for 2 vs 8 cards", () => {
    const grid2 = getResponsiveBoardGridStyle(2) as Record<string, unknown>;
    expect(grid2.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(grid2.gridTemplateRows).toBe("repeat(1, minmax(0, 1fr))");
    expect(Number(grid2["--card-density-scale"])).toBeGreaterThan(1.5);
    expect(Number(grid2["--card-avatar-scale"])).toBeGreaterThan(1.8);

    const grid8 = getResponsiveBoardGridStyle(8) as Record<string, unknown>;
    expect(grid8.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
    expect(grid8.gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))");
    expect(grid8["--card-density-scale"]).toBe(1);
  });

  it("packs and parses per-user fullscreenAuto without breaking defaults", () => {
    const defaultParsed = parseClientLicenseName("Agencia Normal");
    expect(defaultParsed.fullscreenAuto).toBe(false);

    const packedDefault = formatClientLicenseName(
      "Agencia Normal",
      ALL_AVAILABLE_LOTTERIES.map((l) => l.id),
      ALL_AVAILABLE_LOTTERIES.length,
      8,
      25,
      null,
      null,
      false,
    );
    expect(packedDefault).toBe("Agencia Normal");

    const packedFullscreen = formatClientLicenseName(
      "Agencia APK",
      ["lotto-activo", "granjita"],
      ALL_AVAILABLE_LOTTERIES.length,
      4,
      20,
      null,
      null,
      true,
    );
    const parsedFullscreen = parseClientLicenseName(packedFullscreen);
    expect(parsedFullscreen.cleanName).toBe("Agencia APK");
    expect(parsedFullscreen.fullscreenAuto).toBe(true);
    expect(parsedFullscreen.cardsPerScreen).toBe(4);
    expect(parsedFullscreen.transitionSeconds).toBe(20);
  });
});

describe("license-lotteries regression guards", () => {
  it("prevents substring slug collisions between lotto-activo and lotto-activo-internacional", () => {
    // Only lotto-activo allowed: lotto-activo-internacional MUST NOT match
    expect(isLotteryPermitted("lotto-activo", ["lotto-activo"])).toBe(true);
    expect(isLotteryPermitted("7d21a00b-0dfa-4bdc-9edf-8115802df1d6", ["lotto-activo"])).toBe(true);
    expect(isLotteryPermitted("lotto-activo-internacional", ["lotto-activo"])).toBe(false);
    expect(isLotteryPermitted("a8f5e0c2-7b4d-4d62-9c31-1f8e7d6c5b4a", ["lotto-activo"])).toBe(
      false,
    );

    // Only lotto-activo-internacional allowed: lotto-activo MUST NOT match
    expect(isLotteryPermitted("lotto-activo-internacional", ["lotto-activo-internacional"])).toBe(
      true,
    );
    expect(isLotteryPermitted("lotto-activo", ["lotto-activo-internacional"])).toBe(false);
    expect(
      isLotteryPermitted("7d21a00b-0dfa-4bdc-9edf-8115802df1d6", ["lotto-activo-internacional"]),
    ).toBe(false);
  });

  it("treats explicit empty lotteries [] as no lotteries allowed instead of falling back to all", () => {
    const formattedEmpty = formatClientLicenseName(
      "Agencia Cero",
      [],
      ALL_AVAILABLE_LOTTERIES.length,
      4,
      20,
    );
    const parsedEmpty = parseClientLicenseName(formattedEmpty);
    expect(parsedEmpty.cleanName).toBe("Agencia Cero");
    expect(parsedEmpty.cardsPerScreen).toBe(4);
    expect(parsedEmpty.transitionSeconds).toBe(20);
    expect(parsedEmpty.allowedLotteries).toEqual([]);
    expect(isLotteryPermitted("lotto-activo", parsedEmpty.allowedLotteries)).toBe(false);
    expect(isLotteryPermitted("triple-ricachona", parsedEmpty.allowedLotteries)).toBe(false);

    const parsedLegacyEmpty = parseClientLicenseName("Agencia Legacy||[]");
    expect(parsedLegacyEmpty.allowedLotteries).toEqual([]);
    expect(isLotteryPermitted("lotto-activo", parsedLegacyEmpty.allowedLotteries)).toBe(false);
  });

  it("lets authoritative server updates prevail on TV clients and does not revert cardsPerScreen", () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    const origWindow = globalThis.window;
    const origStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: fakeStorage, configurable: true });

    try {
      const staleLocalLicense = {
        id: "lic-test-1",
        client_name: formatClientLicenseName("Agencia Uno", ["lotto-activo"], 20, 8, 25),
        pin_code: "654321",
        status: "active" as const,
        max_devices: 2,
        bound_device_ids: [],
        expires_at: "2027-01-01T00:00:00.000Z",
        notes: "",
        created_at: "2026-01-01T00:00:00.000Z",
      };
      saveLocalLicenseOverride(staleLocalLicense);

      const serverUpdatedLicense = {
        ...staleLocalLicense,
        client_name: formatClientLicenseName("Agencia Uno", ["granjita"], 20, 2, 15),
      };

      // TV client (allowOverrideServer: false) must accept server update cleanly
      const tvReconciled = reconcileClientLicensesWithLocal([serverUpdatedLicense], [], [], {
        allowOverrideServer: false,
      });
      expect(tvReconciled.needsServerSync).toHaveLength(0);
      expect(tvReconciled.licenses).toHaveLength(1);
      const parsedTv = parseClientLicenseName(tvReconciled.licenses[0]!.client_name);
      expect(parsedTv.cardsPerScreen).toBe(2);
      expect(parsedTv.allowedLotteries).toEqual(["granjita"]);
    } finally {
      Object.defineProperty(globalThis, "window", { value: origWindow, configurable: true });
      Object.defineProperty(globalThis, "localStorage", { value: origStorage, configurable: true });
    }
  });

  it("normalizes legacy IDs to valid UUIDs for Supabase and deduplicates by pin_code", () => {
    expect(isValidUuid("lic-master-admin")).toBe(false);
    expect(isValidUuid("lic-1763550000-abcd")).toBe(false);
    expect(toSupabaseLicenseUuid("lic-master-admin", "291007")).toBe(MASTER_LICENSE_UUID);
    expect(isValidUuid(toSupabaseLicenseUuid("lic-master-admin", "291007"))).toBe(true);
    expect(isValidUuid(toSupabaseLicenseUuid("lic-custom-123", "819776"))).toBe(true);
    expect(isValidUuid(generateLicenseUuid())).toBe(true);

    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    const origWindow = globalThis.window;
    const origStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: fakeStorage, configurable: true });

    try {
      const legacyMaster = {
        id: "lic-master-admin",
        client_name: "Administrador Maestro",
        pin_code: "291007",
        status: "active" as const,
        max_devices: 999,
        bound_device_ids: [],
        expires_at: null,
        notes: "",
        created_at: "2026-01-01T00:00:00.000Z",
      };
      const uuidMaster = {
        ...legacyMaster,
        id: MASTER_LICENSE_UUID,
        client_name: formatClientLicenseName(
          "Administrador Maestro",
          null,
          20,
          8,
          25,
          null,
          null,
          true,
        ),
      };

      const reconciled = reconcileClientLicensesWithLocal([legacyMaster, uuidMaster], [], [], {
        allowOverrideServer: false,
      });
      expect(reconciled.licenses).toHaveLength(1);
      expect(reconciled.licenses[0]!.id).toBe(MASTER_LICENSE_UUID);
      expect(parseClientLicenseName(reconciled.licenses[0]!.client_name).fullscreenAuto).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "window", { value: origWindow, configurable: true });
      Object.defineProperty(globalThis, "localStorage", { value: origStorage, configurable: true });
    }
  });
});
