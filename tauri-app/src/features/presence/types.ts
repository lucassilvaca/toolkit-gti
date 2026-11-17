export interface OnlineUser {
  ip: string;
  hostname: string;
  username: string;
  online: boolean;
  /** `true` = roda o Toolkit (responde /whoami) → pode ser Chamada para o chat.
   *  `false` = máquina ligada, mas sem o Toolkit → só ping/acesso remoto/copiar. */
  has_toolkit?: boolean;
  /** Segundos desde o boot (só quando online). */
  uptime_secs?: number | null;
  /** Epoch (segundos) da última vez que respondeu. */
  last_seen?: number | null;
  /** Adicionada manualmente via "Conectar por IP" (não veio da varredura). */
  manual?: boolean;
}

export interface ScanResult {
  net: string;
  probed: number;
  users: OnlineUser[];
}

export interface UserLookupResult {
  /** Nome buscado, como o técnico digitou. */
  query: string;
  /** Faixas varridas em CIDR (ex.: "10.20.30.128/25 + 10.20.31.0/24"). */
  net: string;
  /** Quantidade de hosts sondados na varredura. */
  probed: number;
  /** `true` quando a busca precisou varrer a rede (não respondeu só pelo cache). */
  scanned: boolean;
  /** Máquinas que casaram com o nome, mais relevantes primeiro. */
  matches: OnlineUser[];
}

export interface ScanProgress {
  done: number;
  total: number;
}

export type SortKey = "hostname" | "username" | "ip" | "uptime" | "lastSeen";
export type SortDir = "asc" | "desc";
