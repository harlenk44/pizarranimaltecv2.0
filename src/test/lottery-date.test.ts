import { describe, expect, it } from "vitest";
import { lotteryDate } from "@/lib/lottery-date";

describe("Venezuelan lottery date", () => {
  it("keeps October 26 results visible at 20:50 Caracas, even after UTC midnight", () => {
    expect(lotteryDate(new Date("2026-10-27T00:50:00Z"))).toBe("2026-10-26");
  });
  it("changes the draw date at midnight Caracas", () => {
    expect(lotteryDate(new Date("2026-10-27T03:59:59Z"))).toBe("2026-10-26");
    expect(lotteryDate(new Date("2026-10-27T04:00:00Z"))).toBe("2026-10-27");
  });
});
