/** Formatação de tempo compartilhada pela tabela de presença e pela busca por usuário. */

/** Uptime em texto curto: `3d 4h`, `4h 12m`, `12m`. */
export function formatUptime(secs?: number | null): string {
  if (secs == null || secs <= 0) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Distância até agora em texto curto: `agora`, `há 8 min`, `há 3 h`, `há 2 d`. */
export function formatRelative(epochSecs?: number | null): string {
  if (epochSecs == null) return "—";
  const diff = Math.floor(Date.now() / 1000) - epochSecs;
  if (diff < 45) return "agora";
  if (diff < 3600) return `há ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.round(diff / 3600)} h`;
  return `há ${Math.round(diff / 86400)} d`;
}
