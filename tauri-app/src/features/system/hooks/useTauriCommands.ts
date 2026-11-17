import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { errorText } from "../../../shared/utils/errorText";
import { listen } from "@tauri-apps/api/event";
import { useLogHistory } from "../../history/hooks/useLogHistory";

export type MaintenanceTask =
  | "clean_temp"
  | "restart_spooler"
  | "gpupdate"
  | "dism_health"
  | "sfc_scan"
  | "device_manager"
  | "battery_report"
  | "restart_services"
  | "repair_office"
  | "winsock_reset"
  | "restart_explorer"
  | "restore_point"
  | "open_eventvwr"
  | "open_services"
  | "open_msconfig"
  | "open_compmgmt"
  | "open_taskschd"
  | "open_lusrmgr"
  | "open_msra";

type StreamingTask = "dism_health" | "sfc_scan" | "gpupdate";

interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

interface PortCheckResult {
  host: string;
  port80: boolean;
  port443: boolean;
  message: string;
}

// Human-readable labels for every maintenance task
const TASK_LABELS: Record<MaintenanceTask, string> = {
  clean_temp:       "Limpeza de arquivos temporários",
  restart_spooler:  "Reinício do Spooler",
  gpupdate:         "GPUpdate",
  dism_health:      "Verificação DISM",
  sfc_scan:         "Verificação SFC",
  device_manager:   "Gerenciador de Dispositivos",
  battery_report:   "Relatório de Bateria",
  restart_services: "Reinício de Serviços",
  repair_office:    "Reparo do Office",
  winsock_reset:    "Reset Winsock",
  restart_explorer: "Reiniciar Explorer",
  restore_point:    "Ponto de Restauração",
  open_eventvwr:    "Visualizador de Eventos",
  open_services:    "Serviços",
  open_msconfig:    "MSConfig",
  open_compmgmt:    "Gerenciador do Computador",
  open_taskschd:    "Agendador de Tarefas",
  open_lusrmgr:     "Usuários Locais",
  open_msra:        "Assistência Remota",
};

export function useTauriCommands() {
  const [isLoading, setIsLoading]       = useState(false);
  const [lastResult, setLastResult]     = useState<CommandResult | null>(null);
  const [streamingLines, setStreamingLines] = useState<string[]>([]);
  const [isStreaming, setIsStreaming]   = useState(false);
  const { addLog } = useLogHistory();

  // "command-output" → history log (DISM / SFC / gpupdate)
  // "network-output" → terminal modal (ping -t / streaming tasks)
  // "network-done"   → signals end of any streaming command
  useEffect(() => {
    const unlistenCmd  = listen<string>("command-output", (e) => addLog(e.payload, "info"));
    const unlistenNet  = listen<string>("network-output", (e) =>
      setStreamingLines((prev) => [...prev, e.payload])
    );
    const unlistenDone = listen<boolean>("network-done", () => {
      setIsStreaming(false);
      setIsLoading(false);
    });
    return () => {
      unlistenCmd.then((f) => f());
      unlistenNet.then((f) => f());
      unlistenDone.then((f) => f());
    };
  }, [addLog]);

  // Corpo comum dos comandos que retornam CommandResult (não-streaming).
  const runCommand = useCallback(async (
    startLog: string,
    call: () => Promise<CommandResult>,
    resultLog: (result: CommandResult) => string,
    errorLog: (error: string) => string,
  ) => {
    setIsLoading(true);
    setStreamingLines([]);
    setLastResult(null);
    addLog(startLog, "info");
    try {
      const result = await call();
      setLastResult(result);
      addLog(resultLog(result), result.success ? "success" : "error");
    } catch (err) {
      const error = errorText(err);
      setLastResult({ success: false, output: "", error });
      addLog(errorLog(error), "error");
    } finally {
      setIsLoading(false);
    }
  }, [addLog]);

  // ── Ping (4 packets, blocking) ──────────────────────────────────────────────
  const runPing = useCallback(async (target: string, continuous = false) => {
    setIsLoading(true);
    setStreamingLines([]);
    setLastResult(null);

    if (continuous) {
      setIsStreaming(true);
      addLog(`Ping continuo para ${target}`, "info");
      try {
        await invoke("run_network_streaming", { command: "ping_continuous", target });
      } catch (err) {
        addLog(`Erro ao executar ping: ${errorText(err)}`, "error");
        setIsStreaming(false);
        setIsLoading(false);
      }
      return; // completion handled by "network-done"
    }

    return runCommand(
      `Ping para ${target}`,
      () => invoke<CommandResult>("run_ping", { target }),
      (result) => (result.success ? `Ping ${target} OK` : `Ping ${target} falhou`),
      (error) => `Erro ao executar ping: ${error}`,
    );
  }, [addLog, runCommand]);

  // ── Netstat ─────────────────────────────────────────────────────────────────
  const runNetstat = useCallback(() => runCommand(
    "Netstat -an",
    () => invoke<CommandResult>("run_netstat"),
    (result) => (result.success ? "Netstat concluido" : `Netstat falhou: ${result.error}`),
    (error) => `Erro Netstat: ${error}`,
  ), [runCommand]);

  // ── ipconfig (flushdns / ver config / renovar DHCP) ─────────────────────────
  const runIpconfig = useCallback(async (action: "flushdns" | "config" | "renew") => {
    const labels = {
      flushdns: "Limpar cache DNS",
      config: "Configuração de rede",
      renew: "Renovar IP (DHCP)",
    } as const;
    const label = labels[action];

    return runCommand(
      `${label}…`,
      () => invoke<CommandResult>("run_ipconfig", { action }),
      (result) => (result.success ? `${label} concluído` : `${label} falhou: ${result.error ?? ""}`),
      (error) => `Erro em ${label}: ${error}`,
    );
  }, [runCommand]);

  // ── Verificar portas HTTP/HTTPS ─────────────────────────────────────────────
  const checkWebPorts = useCallback(async (host: string) => {
    setIsLoading(true);
    setStreamingLines([]);
    setLastResult(null);
    addLog(`Verificando portas em ${host}`, "info");
    try {
      const result = await invoke<PortCheckResult>("check_web_ports", { host });
      setLastResult({ success: result.port80 || result.port443, output: result.message });
      addLog(`${host}: ${result.message}`, result.port80 || result.port443 ? "success" : "warning");
      return result;
    } catch (err) {
      const error = errorText(err);
      setLastResult({ success: false, output: "", error });
      addLog(`Erro ao verificar portas: ${error}`, "error");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [addLog]);

  // ── DNS Lookup (nslookup) ────────────────────────────────────────────────────
  const runToolWithTarget = useCallback((target: string) => runCommand(
    `DNS Lookup: ${target}`,
    () => invoke<CommandResult>("run_tool_with_target", { task: "nslookup", target }),
    (result) => (result.success ? result.output || "DNS Lookup concluido" : `Falha: ${result.error}`),
    (error) => `Erro DNS Lookup: ${error}`,
  ), [runCommand]);

  // ── Streaming tasks (DISM / SFC / gpupdate) ─────────────────────────────────
  const runStreamingTask = useCallback(async (task: StreamingTask) => {
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingLines([]);
    setLastResult(null);
    addLog(`Iniciando: ${TASK_LABELS[task]}`, "info");
    try {
      await invoke("run_command_streaming", { task });
      addLog(`${TASK_LABELS[task]} concluído`, "success");
    } catch (err) {
      addLog(`Erro em ${TASK_LABELS[task]}: ${errorText(err)}`, "error");
      setIsStreaming(false);
      setIsLoading(false);
    }
    // isStreaming + isLoading reset via "network-done" event
  }, [addLog]);

  // ── Maintenance tasks ────────────────────────────────────────────────────────
  const runMaintenance = useCallback(async (task: MaintenanceTask) => {
    if (task === "dism_health" || task === "sfc_scan" || task === "gpupdate") {
      return runStreamingTask(task);
    }

    const label = TASK_LABELS[task] ?? task;
    return runCommand(
      `Iniciando: ${label}`,
      () => invoke<CommandResult>("run_maintenance", { task }),
      (result) => (result.success ? `${label} concluido` : `${label} falhou: ${result.error}`),
      (error) => `Erro em ${label}: ${error}`,
    );
  }, [runCommand, runStreamingTask]);

  // ── Stop streaming ───────────────────────────────────────────────────────────
  const stopStreaming = useCallback(async () => {
    try { await invoke("stop_streaming_command"); } catch (err) { console.error("Failed to stop streaming:", err); }
    setIsStreaming(false);
    setIsLoading(false);
    addLog("Comando interrompido", "warning");
  }, [addLog]);

  return {
    runPing,
    runNetstat,
    runIpconfig,
    checkWebPorts,
    runToolWithTarget,
    runMaintenance,
    stopStreaming,
    isLoading,
    isStreaming,
    lastResult,
    streamingLines,
  };
}
