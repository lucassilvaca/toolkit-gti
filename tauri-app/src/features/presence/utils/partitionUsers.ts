import type { OnlineUser, SortKey, SortDir } from "../types";

export function filterUsers(users: OnlineUser[], query: string): OnlineUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u) =>
      u.hostname.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.ip.includes(q),
  );
}

export function sortUsers(users: OnlineUser[], key: SortKey, dir: SortDir): OnlineUser[] {
  const d = dir === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    switch (key) {
      case "hostname": return a.hostname.localeCompare(b.hostname) * d;
      case "username": return a.username.localeCompare(b.username) * d;
      case "ip": return a.ip.localeCompare(b.ip, undefined, { numeric: true }) * d;
      case "uptime": return ((a.uptime_secs ?? -1) - (b.uptime_secs ?? -1)) * d;
      case "lastSeen": return ((a.last_seen ?? 0) - (b.last_seen ?? 0)) * d;
      default: return 0;
    }
  });
}

export interface PartitionedUsers {
  /** Conectadas por IP (outras VLANs): seção própria no topo da lista. */
  manual: OnlineUser[];
  online: OnlineUser[];
  recent: OnlineUser[];
}

/** Filtra por busca, ordena e separa em conectadas por IP / online / vistos recentemente. */
export function partitionUsers(
  users: OnlineUser[],
  query: string,
  key: SortKey,
  dir: SortDir,
): PartitionedUsers {
  const sorted = sortUsers(filterUsers(users, query), key, dir);
  return {
    manual: sorted.filter((u) => u.manual),
    online: sorted.filter((u) => u.online && !u.manual),
    recent: sorted.filter((u) => !u.online && !u.manual),
  };
}
