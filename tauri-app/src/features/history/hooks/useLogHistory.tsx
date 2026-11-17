import {
  useState,
  useCallback,
  useContext,
  createContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { errorText } from "../../../shared/utils/errorText";

type LogType = "info" | "success" | "error" | "warning";

/** Resultado da exportação de log, para a UI dar retorno ao usuário. */
export type ExportResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" }
  | { status: "empty" }
  | { status: "error"; message: string };

interface LogEntry {
  time: string;
  action: string;
  type: LogType;
}

interface LogContextValue {
  logs: LogEntry[];
  addLog: (action: string, type?: LogType) => void;
  clearLogs: () => void;
  exportLogs: () => Promise<ExportResult>;
  logPath: string;
  setLogPath: (path: string) => Promise<void>;
  loadLogFile: () => Promise<void>;
  selectLogDirectory: () => Promise<string | null>;
}

const LogContext = createContext<LogContextValue | null>(null);

const MAX_LOG_ENTRIES = 100;

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logPath, setLogPathState] = useState<string>("");

  const addLog = useCallback((action: string, type: LogType = "info") => {
    const now = new Date();
    const time = now.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const entry: LogEntry = { time, action, type };

    setLogs((prev) => {
      const updated = [...prev, entry];
      // Keep only last 100 entries
      if (updated.length > MAX_LOG_ENTRIES) {
        return updated.slice(-MAX_LOG_ENTRIES);
      }
      return updated;
    });

    // Persist to file asynchronously (fire-and-forget)
    const fileEntry = `${time} - [${type.toUpperCase()}] ${action}`;
    invoke("append_log_entry", { entry: fileEntry }).catch(() => {});
  }, []);

  // Carrega o caminho atual do log
  useEffect(() => {
    invoke<string>("get_log_path_cmd")
      .then((path) => setLogPathState(path))
      .catch(() => {});
  }, []);

  // Carrega o conteúdo do arquivo de log
  const loadLogFile = useCallback(async () => {
    try {
      const content = await invoke<string>("read_log_file");
      if (content) {
        // Parseia o formato estruturado do log
        const entries: LogEntry[] = [];
        const blocks = content.split("═══════════════════════════════════════════════════");
        
        for (const block of blocks) {
          if (!block.trim()) continue;
          
          const lines = block.split("\n");
          let time = "";
          let tipo: LogType = "info";
          let acao = "";
          
          for (const line of lines) {
            if (line.startsWith(" Data:")) {
              time = line.replace(" Data:", "").trim();
            } else if (line.startsWith(" Tipo:")) {
              const tipoStr = line.replace(" Tipo:", "").trim().toLowerCase();
              if (["info", "success", "error", "warning"].includes(tipoStr)) {
                tipo = tipoStr as LogType;
              }
            } else if (line.startsWith(" Acao:")) {
              acao = line.replace(" Acao:", "").trim();
            }
          }
          
          if (time && acao) {
            entries.push({ time, action: acao, type: tipo });
          }
        }
        
        setLogs(entries);
      }
    } catch {
      // Ignora erros
    }
  }, []);

  // Carrega o arquivo na inicialização
  useEffect(() => {
    loadLogFile();
  }, [loadLogFile]);

  // Define novo caminho para o log
  const setLogPath = useCallback(async (path: string) => {
    try {
      await invoke("set_log_path", { path });
      setLogPathState(path);
      // Recarrega logs do novo local
      await loadLogFile();
    } catch (e) {
      console.error("Erro ao definir caminho do log:", e);
    }
  }, [loadLogFile]);

  // Abre diálogo para selecionar pasta
  const selectLogDirectory = useCallback(async (): Promise<string | null> => {
    try {
      const selectedPath = await invoke<string | null>("select_log_directory");
      if (selectedPath) {
        setLogPathState(selectedPath);
        // Recarrega logs do novo local
        await loadLogFile();
        return selectedPath;
      }
      return null;
    } catch (e) {
      console.error("Erro ao selecionar pasta:", e);
      return null;
    }
  }, [loadLogFile]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const exportLogs = useCallback(async (): Promise<ExportResult> => {
    if (logs.length === 0) return { status: "empty" };
    const content = logs
      .map((log) => `${log.time} - [${log.type.toUpperCase()}] ${log.action}`)
      .join("\n");
    const defaultName = `toolkit_logs_${new Date().toISOString().split("T")[0]}.txt`;
    try {
      // Grava via backend: o "Salvar como" nativo + escrita em disco só funcionam
      // pelo Rust dentro do WebView2 (download do navegador é ignorado no Tauri).
      const path = await invoke<string | null>("export_logs", { content, defaultName });
      return path ? { status: "saved", path } : { status: "cancelled" };
    } catch (e) {
      return { status: "error", message: errorText(e) };
    }
  }, [logs]);

  const value = useMemo<LogContextValue>(
    () => ({
      logs,
      addLog,
      clearLogs,
      exportLogs,
      logPath,
      setLogPath,
      loadLogFile,
      selectLogDirectory,
    }),
    [logs, addLog, clearLogs, exportLogs, logPath, setLogPath, loadLogFile, selectLogDirectory],
  );

  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLogHistory(): LogContextValue {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error("useLogHistory must be used within a LogProvider");
  }
  return context;
}
