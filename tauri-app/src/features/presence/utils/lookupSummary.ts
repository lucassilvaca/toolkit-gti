import type { UserLookupResult } from "../types";
import { formatUptime, formatRelative } from "./format";

export type LookupTone = "online" | "offline" | "none";

export interface LookupSummary {
  tone: LookupTone;
  /** Frase principal, do jeito que o técnico precisa ler: está ou não online. */
  headline: string;
  /** Contexto abaixo da frase (faixa varrida, dica de próximo passo). */
  detail: string;
}

function machineLabel(hostname: string, ip: string): string {
  return hostname ? `${hostname} (${ip})` : ip;
}

/**
 * Traduz o resultado bruto da busca na resposta que o técnico quer:
 * "fulano está online em tal máquina" / "está offline, visto há X" /
 * "não encontrei ninguém com esse nome".
 */
export function summarizeLookup(result: UserLookupResult): LookupSummary {
  const nome = result.query;
  const online = result.matches.find((m) => m.online);

  if (online) {
    const uptime = formatUptime(online.uptime_secs);
    return {
      tone: "online",
      headline: `${nome} está ONLINE em ${machineLabel(online.hostname, online.ip)}.`,
      detail: online.has_toolkit
        ? `Ligado há ${uptime} · com o Toolkit aberto, pode ser chamado no chat.`
        : "Máquina ligada, mas sem o Toolkit aberto — só ping, acesso remoto ou cópia.",
    };
  }

  const ultimo = result.matches[0];
  if (ultimo) {
    return {
      tone: "offline",
      headline: `${nome} está OFFLINE.`,
      detail: `Visto ${formatRelative(ultimo.last_seen)} em ${machineLabel(ultimo.hostname, ultimo.ip)}.`,
    };
  }

  return {
    tone: "none",
    headline: `Ninguém com "${nome}" foi encontrado.`,
    detail: result.scanned
      ? `Faixas ${result.net} varridas · ${result.probed} hosts. A pessoa pode estar desligada, numa VLAN fora da lista ou com o Toolkit fechado.`
      : "Sem histórico desse usuário. Rode uma varredura, cadastre a VLAN dela em Configurações ou use “Conectar por IP ou host”.",
  };
}
