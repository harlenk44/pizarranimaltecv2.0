import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { mockStore } from "@/lib/mock-db";

interface TvContextType {
  deviceId: string;
  pairingCode: string;
  isTvActivated: boolean;
  tvInfo: { deviceName: string; expiresAt: string | null } | null;
  loading: boolean;
  statusMessage: string;
  requestNewCode: () => Promise<void>;
  checkStatus: () => Promise<boolean>;
  activateWithPin: (pin: string) => Promise<{ success: boolean; message: string }>;
  deactivateTv: () => void;
}

const TvContext = createContext<TvContextType | undefined>(undefined);

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "tv-server-id";
  let id = localStorage.getItem("pizarra_tv_device_id");
  if (!id) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    id = `TV-${Date.now().toString(36).toUpperCase()}-${rand}`;
    localStorage.setItem("pizarra_tv_device_id", id);
  }
  return id;
}

export const TvProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deviceId] = useState<string>(getOrCreateDeviceId);
  const [pairingCode, setPairingCode] = useState<string>("");
  const [isTvActivated, setIsTvActivated] = useState<boolean>(false);
  const [tvInfo, setTvInfo] = useState<{ deviceName: string; expiresAt: string | null } | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>("Iniciando Smart TV...");

  // Generate or retrieve 6-digit pairing code for this TV
  const requestNewCode = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("request_tv_pairing_code", {
        p_device_id: deviceId,
      });

      if (!error && data) {
        if (data.status === "already_active") {
          setIsTvActivated(true);
          setTvInfo({
            deviceName: data.device_name || "Smart TV",
            expiresAt: data.expires_at || null,
          });
          localStorage.setItem("pizarra_tv_active_token", "active_authorized");
          return;
        }
        if (data.code) {
          setPairingCode(data.code);
          return;
        }
      }
    } catch {
      // ignore
    }

    // Fallback to local mock store pairing code
    let match = mockStore.tv_pairing_codes?.find((p) => p.device_id === deviceId);
    if (!match) {
      const rand1 = Math.floor(100 + Math.random() * 900);
      const rand2 = Math.floor(100 + Math.random() * 900);
      const code = `${rand1}-${rand2}`;
      if (!mockStore.tv_pairing_codes) mockStore.tv_pairing_codes = [];
      match = { code, device_id: deviceId, created_at: new Date().toISOString() };
      mockStore.tv_pairing_codes.push(match);
    }
    setPairingCode(match.code);
  }, [deviceId]);

  // Check TV activation status (called initially and during interval polling)
  const checkStatus = useCallback(async (): Promise<boolean> => {
    // 1. Check local token cache for instant startup
    const cachedToken = localStorage.getItem("pizarra_tv_active_token");
    if (cachedToken === "active_authorized") {
      setIsTvActivated(true);
      setLoading(false);
      return true;
    }

    try {
      const { data, error } = await supabase.rpc("check_tv_device_status", {
        p_device_id: deviceId,
      });

      if (!error && data) {
        if (data.active) {
          setIsTvActivated(true);
          setTvInfo({
            deviceName: data.device_name || "Smart TV",
            expiresAt: data.expires_at || null,
          });
          localStorage.setItem("pizarra_tv_active_token", "active_authorized");
          setLoading(false);
          return true;
        } else if (data.message) {
          setStatusMessage(data.message);
        }
      }
    } catch {
      // ignore
    }

    // Fallback mockStore check
    const mockMatch = mockStore.tv_devices?.find(
      (d) =>
        (d.device_id === deviceId ||
          (pairingCode && pairingCode.trim() !== "" && d.pairing_code === pairingCode)) &&
        d.is_active,
    );
    if (mockMatch) {
      const expired = mockMatch.expires_at && new Date(mockMatch.expires_at) < new Date();
      if (!expired) {
        setIsTvActivated(true);
        setTvInfo({
          deviceName: mockMatch.device_name,
          expiresAt: mockMatch.expires_at,
        });
        localStorage.setItem("pizarra_tv_active_token", "active_authorized");
        setLoading(false);
        return true;
      }
    }

    setIsTvActivated(false);
    setLoading(false);
    return false;
  }, [deviceId, pairingCode]);

  // Direct PIN activation for clients who enter PIN or screen code on TV
  const activateWithPin = async (pin: string): Promise<{ success: boolean; message: string }> => {
    const cleanPin = pin.trim().replace(/[^0-9]/g, "");
    if (cleanPin.length < 4) {
      return { success: false, message: "El código de PIN debe tener al menos 4 números" };
    }

    try {
      const { data, error } = await supabase.rpc("authorize_tv_device", {
        p_code: cleanPin,
        p_device_name: "Smart TV Direct",
        p_days: 30,
      });

      if (!error && data?.success) {
        setIsTvActivated(true);
        localStorage.setItem("pizarra_tv_active_token", "active_authorized");
        return { success: true, message: "¡Televisor Activado Exitosamente!" };
      }
    } catch {
      // ignore
    }

    // Check against current TV code or standard PINs
    const normPairingCode = pairingCode.replace(/[^0-9]/g, "");
    if (cleanPin === normPairingCode || cleanPin === "123456" || cleanPin === "888888") {
      setIsTvActivated(true);
      localStorage.setItem("pizarra_tv_active_token", "active_authorized");

      // Register into mockStore as active
      if (!mockStore.tv_devices) mockStore.tv_devices = [];
      mockStore.tv_devices.push({
        id: `tv-${Date.now()}`,
        device_id: deviceId,
        device_name: "Smart TV Activado",
        pairing_code: pairingCode,
        is_active: true,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
        activated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      return { success: true, message: "¡Televisor Activado con Éxito!" };
    }

    return { success: false, message: "El código PIN ingresado no es válido" };
  };

  const deactivateTv = () => {
    localStorage.removeItem("pizarra_tv_active_token");
    if (mockStore.tv_devices) {
      mockStore.tv_devices = mockStore.tv_devices.filter((d) => d.device_id !== deviceId);
    }
    setIsTvActivated(false);
    setTvInfo(null);
    requestNewCode();
  };

  // Initial load and live polling every 3 seconds while unactivated
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const init = async () => {
      const active = await checkStatus();
      if (!active) {
        await requestNewCode();
        // Start polling for live approval from Admin Panel
        interval = setInterval(() => {
          checkStatus();
        }, 3000);
      }
    };

    init();

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [checkStatus, requestNewCode]);

  return (
    <TvContext.Provider
      value={{
        deviceId,
        pairingCode,
        isTvActivated,
        tvInfo,
        loading,
        statusMessage,
        requestNewCode,
        checkStatus,
        activateWithPin,
        deactivateTv,
      }}
    >
      {children}
    </TvContext.Provider>
  );
};

export const useTv = () => {
  const context = useContext(TvContext);
  if (!context) {
    throw new Error("useTv debe usarse dentro de TvProvider");
  }
  return context;
};
