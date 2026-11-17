/** IP local já coletado e utilizável como base IPv4 (não placeholder, não IPv6). */
export function isUsableLocalIp(ip: string | null | undefined): boolean {
  return !!ip && ip !== "..." && ip !== "N/A" && !ip.includes(":");
}
