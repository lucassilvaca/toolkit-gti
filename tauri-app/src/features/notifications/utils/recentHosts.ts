/** Últimos hosts chamados — recall em 1 clique para o N1. */
const RECENTS_KEY = "gti.recentHosts";
const RECENTS_MAX = 5;

export function loadRecents(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((h) => typeof h === "string").slice(0, RECENTS_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(host: string): string[] {
  const cur = loadRecents().filter((h) => h.toLowerCase() !== host.toLowerCase());
  const next = [host, ...cur].slice(0, RECENTS_MAX);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage indisponível */
  }
  return next;
}

export function clearRecents(): void {
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch {
    /* noop */
  }
}
