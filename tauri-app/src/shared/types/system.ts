/**
 * Tipos de informação do sistema, compartilhados entre features e componentes
 * shared (Sidebar, HostInfoModal). Mora em `shared/` para que a camada base
 * não dependa de `features/` (inversão de dependência).
 */

export interface BatteryInfo {
  hasBattery: boolean;
  percentage: number;
  status: string;
  health: string;
  healthCategory: "good" | "medium" | "poor" | "unknown";
}

export interface SystemInfo {
  username: string;
  hostname: string;
  serialNumber: string;
  osVersion: string;
  osBuild: string;
  uptime: string;
  cpuUsage: number;
  memoryUsage: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  processCount: number;
  battery: BatteryInfo;
  diskFree: string;
  diskHealth: string;
  /** % usado do disco do sistema; -1 quando indisponível. */
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
