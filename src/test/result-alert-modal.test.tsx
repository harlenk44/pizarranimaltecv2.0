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
});
