import { invoke } from "@tauri-apps/api/core";

/**
 * Faixas extras para a varredura de usuários online (multi-VLAN), em CIDR
 * (ex.: "10.20.31.0/24"). Persistidas no backend em
 * `~/.toolkit_gti/presence_networks.json`. A VLAN do próprio técnico é sempre
 * varrida e não precisa estar na lista.
 *
 * A validação (formato, prefixo /20–/30, limite de hosts) é do backend:
 * `setNetworks` rejeita com a lista do que está inválido.
 */
export const PresenceConfig = {
  async getNetworks(): Promise<string[]> {
    return await invoke<string[]>("get_scan_networks");
  },

  /** Salva e retorna a lista efetivamente persistida (normalizada/deduplicada). */
  async setNetworks(networks: string[]): Promise<string[]> {
    return await invoke<string[]>("set_scan_networks", { networks });
  },
};
