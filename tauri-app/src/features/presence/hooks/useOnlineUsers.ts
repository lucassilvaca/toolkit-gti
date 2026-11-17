import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSharedSystemInfo } from "../../system/hooks/SystemInfoContext";
import { useStatus } from "../../system/hooks/useStatus";
import { NetworkConfigService } from "../../settings/services/NetworkConfig";
import { partitionUsers } from "../utils/partitionUsers";
import type { OnlineUser, ScanResult, ScanProgress, SortKey, SortDir } from "../types";
import { errorText } from "../../../shared/utils/errorText";
import { isUsableLocalIp } from "../../../shared/utils/localIp";

const AUTO_REFRESH_MS = 15_000;

export function useOnlineUsers() {
  const { systemInfo } = useSharedSystemInfo();
  const localIp = systemInfo.localIp;

  const [chatPort, setChatPort] = useState<number>(NetworkConfigService.getDefaultPort());
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [manualUsers, setManualUsers] = useState<OnlineUser[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [net, setNet] = useState("");
  const [probed, setProbed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "hostname", dir: "asc" });
  const { status, setOk, setErr, setWarn, clear } = useStatus();
  const didInitialScan = useRef(false);

  useEffect(() => {
    NetworkConfigService.getChatPort()
      .then(setChatPort)
      .catch(() => setChatPort(NetworkConfigService.getDefaultPort()));
  }, []);

  useEffect(() => {
    const un = listen<ScanProgress>("presence-scan-progress", (e) => setProgress(e.payload));
    return () => { void un.then((f) => f()); };
  }, []);

  const ipReady = isUsableLocalIp(localIp);

  const scan = useCallback(async () => {
    if (!ipReady) { setErr("IP local ainda não disponível. Aguarde a coleta de rede."); return; }
    setLoading(true);
    setProgress(null);
    clear();
    try {
      const result = await invoke<ScanResult>("scan_online_users", { baseIp: localIp, wsPort: chatPort });
      setUsers(result.users);
      setNet(result.net);
      setProbed(result.probed);
      setScannedAt(new Date().toLocaleTimeString("pt-BR"));
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setLoading(false);
      setProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipReady, localIp, chatPort]);

  useEffect(() => {
    if (didInitialScan.current || !ipReady) return;
    didInitialScan.current = true;
    void scan();
  }, [ipReady, scan]);

  useEffect(() => {
    if (!autoRefresh || !ipReady) return;
    const id = setInterval(() => { if (!loading) void scan(); }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, ipReady, loading, scan]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }, []);

  // Sonda um IP específico (informado pelo técnico), inclusive de outra VLAN se
  // o roteamento alcançar. Se ligado, fixa a máquina na lista para agir sobre ela.
  const connectByIp = useCallback(
    async (raw: string) => {
      const ip = raw.trim();
      if (!ip) return;
      setConnecting(true);
      clear();
      try {
        const user = await invoke<OnlineUser | null>("probe_host_by_ip", { ip, wsPort: chatPort });
        if (!user) {
          setWarn(`${ip} não respondeu — desligado, bloqueado ou fora de alcance.`);
          return;
        }
        setManualUsers((prev) => [{ ...user, manual: true }, ...prev.filter((u) => u.ip !== user.ip)]);
        const who = user.username ? ` · ${user.username}` : "";
        setOk(`${user.hostname || user.ip} está ligado${who}${user.has_toolkit ? "" : " (sem Toolkit: chat indisponível)"}.`);
      } catch (e) {
        setErr(errorText(e));
      } finally {
        setConnecting(false);
      }
    },
    [chatPort, clear, setOk, setWarn, setErr],
  );

  const clearManual = useCallback(() => setManualUsers([]), []);

  // Máquinas manuais que a varredura já achou saem (o dado do scan é mais fresco).
  const allUsers = useMemo(() => {
    const scannedIps = new Set(users.map((u) => u.ip));
    const manualFresh = manualUsers.filter((m) => !scannedIps.has(m.ip));
    return [...users, ...manualFresh];
  }, [users, manualUsers]);

  const { manual, online, recent } = useMemo(
    () => partitionUsers(allUsers, query, sort.key, sort.dir),
    [allUsers, query, sort],
  );

  return {
    localIp, chatPort, ipReady, loading, progress, net, probed, scannedAt,
    autoRefresh, setAutoRefresh, query, setQuery, sort, toggleSort,
    connectByIp, connecting, clearManual, manualCount: manualUsers.length,
    manual, online, recent, onlineCount: online.length, recentCount: recent.length,
    scan, status, setOk, setErr, setWarn, clear,
  };
}
