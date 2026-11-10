import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ResultAlertModal, { type ResultAlertItem } from "@/components/ResultAlertModal";

describe("ResultAlertModal component", () => {
  beforeEach(() => {
    // Mock window.speechSynthesis if absent
    if (typeof window !== "undefined" && !("speechSynthesis" in window)) {
      (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
        speak: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn(() => []),
      };
    }
  });

  const sampleAlert: ResultAlertItem = {
    id: "alert-1",
    gameId: "game-1",
    gameName: "Lotto Activo",
    gameColor: "#1a56db",
    gameLogoUrl: null,
    drawDate: "2026-10-28",
    drawTime: "10:00:00",
    animalNumber: 4,
    animalName: "Alacrán",
    animalLabel: "04",
    animalImageUrl: null,
    animalEmoji: "🦂",
  };

  it("renders game name, draw time, animal number, and animal name", () => {
    render(<ResultAlertModal alerts={[sampleAlert]} onClose={vi.fn()} />);

    expect(screen.getByText("Lotto Activo")).toBeInTheDocument();
    expect(screen.getByText("Alacrán")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();
    expect(screen.getByText("10:00 AM")).toBeInTheDocument();
  });

  it("calls onClose when 'Volver a la pizarra' button is clicked", () => {
    const handleClose = vi.fn();
    render(<ResultAlertModal alerts={[sampleAlert]} onClose={handleClose} />);

    const closeBtns = screen.getAllByRole("button", { name: /volver a la pizarra/i });
    act(() => {
      closeBtns[0]?.click();
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("supports advancing through a queue of multiple alerts", () => {
    const secondAlert: ResultAlertItem = {
      id: "alert-2",
      gameId: "game-2",
      gameName: "La Granjita",
      gameColor: "#10b981",
      gameLogoUrl: null,
      drawDate: "2026-10-28",
      drawTime: "11:00:00",
      animalNumber: 0,
      animalName: "Delfín",
      animalLabel: "00",
      animalImageUrl: null,
      animalEmoji: "🐬",
    };

    render(<ResultAlertModal alerts={[sampleAlert, secondAlert]} onClose={vi.fn()} />);

    expect(screen.getByText("Lotto Activo")).toBeInTheDocument();
    expect(screen.getByText(/1 de 2/)).toBeInTheDocument();

    const nextBtn = screen.getByRole("button", { name: /siguiente/i });
    act(() => {
      nextBtn.click();
    });

    expect(screen.getByText("La Granjita")).toBeInTheDocument();
    expect(screen.getByText("Delfín")).toBeInTheDocument();
    expect(screen.getByText("00")).toBeInTheDocument();
  });

  it("displays Pelícano emoji 🦤 for animal 51 and falls back gracefully on image error", () => {
    const pelicanoAlert: ResultAlertItem = {
      id: "alert-51",
      gameId: "game-guacharo",
      gameName: "Guácharo Activo",
      gameColor: "#059669",
      gameLogoUrl: null,
      drawDate: "2026-10-28",
      drawTime: "12:00:00",
      animalNumber: 51,
      animalName: "Pelícano",
      animalLabel: "51",
      animalImageUrl: null,
    };

    render(<ResultAlertModal alerts={[pelicanoAlert]} onClose={vi.fn()} />);

    expect(screen.getByText("Guácharo Activo")).toBeInTheDocument();
    expect(screen.getByText("Pelícano")).toBeInTheDocument();
    expect(screen.getByText("51")).toBeInTheDocument();
    // Must display pelican emoji and never monkey
    expect(screen.getByText("🦤")).toBeInTheDocument();
    expect(screen.queryByText("🐵")).not.toBeInTheDocument();
  });

  it("calls onClose when user clicks the backdrop or presses Escape", () => {
    const handleClose = vi.fn();
    const { container } = render(<ResultAlertModal alerts={[sampleAlert]} onClose={handleClose} />);

    // Clicking outer backdrop calls onClose
    const backdrop = container.firstChild as HTMLElement;
    act(() => {
      backdrop.click();
    });
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Pressing Escape key triggers handleClose
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("deduplicates identical draw alerts in queue so a sorteo is only shown once", () => {
    // 3 alerts for the exact same sorteo (Selva Plus 11:15 AM)
    const alert1: ResultAlertItem = {
      id: "alert-selva-1",
      gameId: "selva-plus",
      gameName: "Selva Plus",
      gameColor: "#22c55e",
      drawDate: "2026-10-31",
      drawTime: "11:15:00",
      animalNumber: 31,
      animalName: "Lapa",
      animalLabel: "31",
    };
    const alert2: ResultAlertItem = {
      ...alert1,
      id: "alert-selva-2-duplicate",
    };
    const alert3: ResultAlertItem = {
      ...alert1,
      id: "alert-selva-3-duplicate",
    };

    render(<ResultAlertModal alerts={[alert1, alert2, alert3]} onClose={vi.fn()} />);

    expect(screen.getByText("Selva Plus")).toBeInTheDocument();
    expect(screen.getByText("Lapa")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    // Must NOT display "1 de 3" because duplicates were eliminated
    expect(screen.queryByText(/1 de 3/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /siguiente/i })).not.toBeInTheDocument();
  });

  it("respects the configured autoCloseSeconds timer duration before closing", () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();

    render(
      <ResultAlertModal
        alerts={[sampleAlert]}
        autoCloseSeconds={4}
        voiceEnabled={false}
        onClose={handleClose}
      />,
    );

    // After 2 seconds, modal must still be open
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(handleClose).not.toHaveBeenCalled();

    // After remaining 2 seconds (total 4000ms), modal closes
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(handleClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("does not close while voice speech is still actively speaking even if countdown reaches 0", async () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();
    const audioModule = await import("@/lib/lottery-audio");

    let speechEndCallback: (() => void) | undefined;
    vi.spyOn(audioModule, "speakLotteryResult").mockImplementation(
      (options: { onStart?: () => void; onEnd?: () => void }) => {
        options.onStart?.();
        speechEndCallback = options.onEnd;
        return Promise.resolve();
      },
    );

    render(
      <ResultAlertModal
        alerts={[sampleAlert]}
        autoCloseSeconds={3}
        voiceEnabled={true}
        onClose={handleClose}
      />,
    );

    // Advance by 3 seconds so countdown expires
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Since voice is still speaking, handleClose must NOT have been called
    expect(handleClose).not.toHaveBeenCalled();

    // Now simulate voice speech finishing
    act(() => {
      speechEndCallback?.();
    });

    // Advance by the 1.5s post-speech buffer
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    // Now it closes cleanly
    expect(handleClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("defaults to 20 seconds duration and does not reset or cancel during 5s parent polling re-renders", () => {
    vi.useFakeTimers();
    const handleClose = vi.fn();

    const { rerender } = render(
      <ResultAlertModal alerts={[{ ...sampleAlert }]} voiceEnabled={false} onClose={handleClose} />,
    );

    // Simulate 5s polling re-renders with fresh array/object references at 5s, 10s, and 15s
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    rerender(
      <ResultAlertModal alerts={[{ ...sampleAlert }]} voiceEnabled={false} onClose={handleClose} />,
    );
    expect(handleClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    rerender(
      <ResultAlertModal alerts={[{ ...sampleAlert }]} voiceEnabled={false} onClose={handleClose} />,
    );
    // At 15s total elapsed, modal must still be open
    expect(handleClose).not.toHaveBeenCalled();

    // Advance remaining 5s (total 20,000ms) -> modal closes right on schedule
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(handleClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("normalizes uppercase text, hyphens, slashes, numbers, and 00 phonetically for speech synthesis", async () => {
    const { normalizeTextForSpeech } = await import("@/lib/lottery-audio");

    expect(normalizeTextForSpeech("05-LEON")).toBe("número 05, León");
    expect(normalizeTextForSpeech("00-BALLENA")).toBe("número cero cero, Ballena");
    expect(normalizeTextForSpeech("LOTTO ACTIVO")).toBe("Lotto Activo");
    expect(normalizeTextForSpeech("LA_GRANJITA/GUACHARO")).toBe("La, Granjita, Guácharo");
    expect(
      normalizeTextForSpeech(
        "Atención en la agencia. Nuevo resultado de LOTTO ACTIVO. Ha salido el 00-BALLENA.",
      ),
    ).toBe(
      "Atención en la agencia. Nuevo resultado de Lotto Activo. Ha salido el número cero cero, Ballena.",
    );
  });
});
