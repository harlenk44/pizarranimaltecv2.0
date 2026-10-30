import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { DisplayProvider, useDisplay } from "@/context/DisplayContext";
import { DISPLAY_STORAGE_KEY, parseDisplayPreferences } from "@/lib/display-preferences";

function Probe() {
  const { preferences, update } = useDisplay();
  return (
    <>
      <output data-testid="sizes">
        {preferences.resultScale},{preferences.logoSize}
      </output>
      <button onClick={() => update({ resultScale: 200, logoSize: 180 })}>Change</button>
    </>
  );
}
describe("Device-local board sizes", () => {
  beforeEach(() => localStorage.clear());
  it("automatically saves size changes and restores them after remount", async () => {
    const first = render(
      <DisplayProvider>
        <Probe />
      </DisplayProvider>,
    );
    act(() => screen.getByText("Change").click());
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(DISPLAY_STORAGE_KEY) ?? "{}")).toEqual({
        resultScale: 200,
        logoSize: 180,
        fontSizeScale: 100,
        heroCardScale: 100,
        animalScale: 100,
      }),
    );
    first.unmount();
    render(
      <DisplayProvider>
        <Probe />
      </DisplayProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("sizes").textContent).toBe("200,180"));
  });
  it("recovers defaults from damaged stored preferences", () => {
    expect(parseDisplayPreferences("{broken")).toEqual({
      resultScale: 125,
      logoSize: 72,
      fontSizeScale: 100,
      heroCardScale: 100,
      animalScale: 100,
    });
  });
});
