import { createContext, useContext } from "react";
import type { ClientLicense } from "@/lib/types";
import {
  DEFAULT_CARDS_PER_SCREEN,
  DEFAULT_TRANSITION_SECONDS,
  type CardsPerScreenOption,
  type ClientVoiceConfig,
  type ClientDesignConfig,
} from "@/lib/license-lotteries";

export interface LicenseContextValue {
  matchedLicense?: ClientLicense;
  isAuthorized: boolean;
  allowedLotteries: string[] | null;
  cardsPerScreen: CardsPerScreenOption;
  transitionSeconds: number;
  voiceConfig: ClientVoiceConfig | null;
  designConfig: ClientDesignConfig | null;
  fullscreenAuto: boolean;
  isGameAllowed: (gameIdOrSlug?: string | null, fallbackName?: string | null) => boolean;
}

export const LicenseContext = createContext<LicenseContextValue>({
  matchedLicense: undefined,
  isAuthorized: false,
  allowedLotteries: null,
  cardsPerScreen: DEFAULT_CARDS_PER_SCREEN,
  transitionSeconds: DEFAULT_TRANSITION_SECONDS,
  voiceConfig: null,
  designConfig: null,
  fullscreenAuto: false,
  isGameAllowed: () => true,
});

export function useLicenseContext() {
  return useContext(LicenseContext);
}

export const DEVICE_ID_STORAGE_KEY = "pizarra_tv_device_id";
export const ACTIVATED_PIN_STORAGE_KEY = "pizarra_activated_pin";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "TV-SERVER";
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const num = Math.floor(1000 + Math.random() * 9000);
    const id = `TV-${rand}-${num}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return "TV-LOCAL";
  }
}
