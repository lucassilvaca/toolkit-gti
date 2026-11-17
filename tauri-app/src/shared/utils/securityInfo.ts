/**
 * Helpers de apresentação para os status de segurança do sistema.
 *
 * Os valores brutos vêm do backend Rust (`commands/public/system_info.rs`):
 *   - firewallStatus : "Ativo" | "Inativo" | "Desconhecido"
 *   - bitlockerStatus: "Ativo" | "Inativo" | "Desconhecido" | "Não Disponível"
 *   - updateStatus   : "Em dia" | "Reiniciar Pendente"
 *   - lastScan       : data no formato "dd/mm/aaaa"
 *
 * "tone" controla a cor do ícone de status na UI: "healthy" (verde) ou "warn".
 */

export type SecurityTone = "healthy" | "warn";

/** Normaliza para comparação resiliente a caixa/acentuação. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function isActive(status: string): boolean {
  return normalize(status) === "ativo";
}

// ---- Firewall ----------------------------------------------------------

export function getFirewallTone(status: string): SecurityTone {
  return isActive(status) ? "healthy" : "warn";
}

export function getFirewallSubtitle(status: string): string {
  return isActive(status)
    ? "Proteção de rede ativa"
    : "Firewall desativado ou indisponível";
}

// ---- BitLocker ---------------------------------------------------------

export function getBitlockerTone(status: string): SecurityTone {
  return isActive(status) ? "healthy" : "warn";
}

export function getBitlockerDisplay(status: string): string {
  const s = normalize(status);
  if (s === "ativo") return "Ativo";
  if (s === "inativo") return "Inativo";
  if (s === "nao disponivel") return "Não Disponível";
  return "Desconhecido";
}

export function getBitlockerSubtitle(status: string): string {
  return isActive(status)
    ? "Disco criptografado"
    : "Disco sem criptografia";
}

// ---- Windows Update ----------------------------------------------------

export function isUpdatesHealthy(status: string): boolean {
  return normalize(status) === "em dia";
}

export function formatUpdatesSubtitleWithDate(
  updateStatus: string,
  lastScan: string,
): string {
  const base = isUpdatesHealthy(updateStatus)
    ? "Sistema atualizado"
    : updateStatus || "Status desconhecido";
  return lastScan ? `${base} · verificado em ${lastScan}` : base;
}
