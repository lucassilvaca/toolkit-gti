import type { SystemInfo } from "../../shared/types/system";

export const dashboardInfo: SystemInfo = {
  username: "Tecnico", hostname: "ESTACAO-SUPORTE-01", serialNumber: "SERIAL-QA",
  osVersion: "Windows 11 Pro", osBuild: "26100", uptime: "2h 7m", cpuUsage: 99,
  memoryUsage: 94, memoryUsedGb: 15, memoryTotalGb: 15.9, processCount: 243,
  battery: { hasBattery: false, percentage: 0, status: "", health: "", healthCategory: "unknown" },
  diskFree: "25 GB", diskHealth: "Saudável", diskUsedPercent: 89,
  localIp: "192.0.2.10", publicIp: "198.51.100.20", isp: "Operadora de teste", connectionType: "Dinamico (DHCP)",
  macAddress: "00:00:00:00:00:00", gateway: "192.0.2.1", dnsServer: "192.0.2.1",
  antivirusStatus: "Ativo", firewallStatus: "Inativo", bitlockerStatus: "Ativo",
  recentBsod: "Nenhum", updateStatus: "Em dia", lastScan: "18/10/2026",
};
