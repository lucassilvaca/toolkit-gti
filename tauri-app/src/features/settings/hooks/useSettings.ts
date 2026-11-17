import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  pingTarget: string;
  portTarget: string;
  pingInfinite: boolean;
}

const defaults: AppSettings = {
  pingTarget: "8.8.8.8",
  portTarget: "google.com",
  pingInfinite: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaults);
  // Espelho síncrono do estado: permite calcular o próximo valor e salvar uma
  // única vez fora do updater (que o React pode reexecutar).
  const settingsRef = useRef<AppSettings>(defaults);

  useEffect(() => {
    invoke<AppSettings>("get_settings")
      .then((loaded) => {
        settingsRef.current = loaded;
        setSettings(loaded);
      })
      .catch(() => {});
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    const next = { ...settingsRef.current, ...partial };
    settingsRef.current = next;
    setSettings(next);
    invoke("save_settings", { settings: next }).catch(() => {});
  }, []);

  return { settings, updateSettings };
}
