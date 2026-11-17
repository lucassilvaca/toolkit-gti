import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { BatteryInfo, SystemInfo } from "../../../shared/types/system";
import { errorText } from "../../../shared/utils/errorText";

// Re-export para compatibilidade com importadores existentes do tipo.
export type { BatteryInfo, SystemInfo } from "../../../shared/types/system";

interface DynamicInfo {
  cpuUsage: number;
  memoryUsage: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  processCount: number;
  battery: BatteryInfo;
  uptime: string;
}

interface StaticInfo {
  username: string;
  hostname: string;
  serialNumber: string;
  osVersion: string;
  osBuild: string;
  diskFree: string;
  diskHealth: string;
  diskUsedPercent: number;
  localIp: string;
  publicIp: string;
  isp: string;
  connectionType: string;
  macAddress: string;
  gateway: string;
  dnsServer: string;
  antivirusStatus: string;
  firewallStatus: string;
  bitlockerStatus: string;
  recentBsod: string;
  updateStatus: string;
  lastScan: string;
}

const defaultBatteryInfo: BatteryInfo = {
  hasBattery: false,
  percentage: 0,
  status: "",
  health: "",
  healthCategory: "unknown",
};

const defaultSystemInfo: SystemInfo = {
  username: "...",
  hostname: "...",
  serialNumber: "...",
  osVersion: "...",
  osBuild: "...",
  uptime: "...",
  cpuUsage: 0,
  memoryUsage: 0,
  memoryUsedGb: 0,
  memoryTotalGb: 0,
  processCount: 0,
  battery: defaultBatteryInfo,
  diskFree: "...",
  diskHealth: "...",
  diskUsedPercent: -1,
  localIp: "...",
  publicIp: "...",
  isp: "...",
  connectionType: "...",
  macAddress: "...",
  gateway: "...",
  dnsServer: "...",
  antivirusStatus: "...",
  firewallStatus: "...",
  bitlockerStatus: "...",
  recentBsod: "...",
  updateStatus: "...",
  lastScan: "...",
};

/** Campos dinâmicos copiados para o `SystemInfo` (um único lugar = nenhum esquecido). */
function pickDynamic(info: DynamicInfo): DynamicInfo {
  return {
    cpuUsage: info.cpuUsage,
    memoryUsage: info.memoryUsage,
    memoryUsedGb: info.memoryUsedGb,
    memoryTotalGb: info.memoryTotalGb,
    processCount: info.processCount,
    battery: info.battery,
    uptime: info.uptime,
  };
}

interface UseSystemInfoOptions {
  enabled?: boolean;
}

const STATIC_TTL_MS = 5 * 60 * 1000;
const DYNAMIC_TTL_MS = 15 * 1000;

let staticCache: StaticInfo | null = null;
let staticCacheAt = 0;
let staticInflight: Promise<StaticInfo> | null = null;

let dynamicCache: DynamicInfo | null = null;
let dynamicCacheAt = 0;
let dynamicInflight: Promise<DynamicInfo> | null = null;

let adminCache: boolean | null = null;
let adminInflight: Promise<boolean> | null = null;

export function useSystemInfo(options?: UseSystemInfoOptions) {
  const enabled = options?.enabled ?? true;
  const [systemInfo, setSystemInfo] = useState<SystemInfo>(defaultSystemInfo);
  const [loading, setLoading] = useState(true);
  const [refreshingHealth, setRefreshingHealth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (adminCache !== null) {
      setIsAdmin(adminCache);
      return;
    }

    if (!adminInflight) {
      adminInflight = invoke<boolean>("is_admin")
        .then((value) => {
          adminCache = value;
          return value;
        })
        .catch(() => {
          adminCache = false;
          return false;
        })
        .finally(() => {
          adminInflight = null;
        });
    }

    adminInflight.then(setIsAdmin).catch(() => setIsAdmin(false));
  }, []);

  const fetchStaticInfo = useCallback(async () => {
    const now = Date.now();
    if (staticCache && now - staticCacheAt < STATIC_TTL_MS) {
      setSystemInfo((prev) => ({ ...prev, ...staticCache! }));
      setError(null);
      setLoading(false);
      return staticCache;
    }

    try {
      if (!staticInflight) {
        staticInflight = invoke<StaticInfo>("get_static_info").finally(() => {
          staticInflight = null;
        });
      }
      const info = await staticInflight;
      staticCache = info;
      staticCacheAt = Date.now();
      setSystemInfo((prev) => ({
        ...prev,
        ...info,
      }));
      setError(null);
      return info;
    } catch (err) {
      setError(errorText(err));
      console.warn("Failed to fetch static info:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDynamicInfo = useCallback(async () => {
    const now = Date.now();
    if (dynamicCache && now - dynamicCacheAt < DYNAMIC_TTL_MS) {
      const info = dynamicCache;
      setSystemInfo((prev) => ({ ...prev, ...pickDynamic(info) }));
      return info;
    }

    try {
      if (!dynamicInflight) {
        dynamicInflight = invoke<DynamicInfo>("get_dynamic_info").finally(() => {
          dynamicInflight = null;
        });
      }
      const info = await dynamicInflight;
      dynamicCache = info;
      dynamicCacheAt = Date.now();
      setSystemInfo((prev) => ({ ...prev, ...pickDynamic(info) }));
      return info;
    } catch (err) {
      console.warn("Failed to fetch dynamic info:", err);
      return null;
    }
  }, []);

  const refreshHealth = useCallback(async () => {
    setRefreshingHealth(true);
    dynamicCacheAt = 0;
    await fetchDynamicInfo();
    setRefreshingHealth(false);
  }, [fetchDynamicInfo]);

  const refresh = useCallback(async () => {
    setLoading(true);
    staticCacheAt = 0;
    await fetchStaticInfo();
  }, [fetchStaticInfo]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    if (staticCache) {
      setSystemInfo((prev) => ({ ...prev, ...staticCache! }));
      setLoading(false);
    }

    if (dynamicCache) {
      const info = dynamicCache;
      setSystemInfo((prev) => ({ ...prev, ...pickDynamic(info) }));
    }

    fetchStaticInfo();
    fetchDynamicInfo();
  }, [enabled, fetchStaticInfo, fetchDynamicInfo]);

  return { systemInfo, loading, refreshingHealth, error, refresh, refreshHealth, isAdmin };
}
