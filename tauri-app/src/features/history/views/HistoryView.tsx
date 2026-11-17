import { useState } from "react";
import { FileText, Upload, Download, FolderOpen, RefreshCw } from "lucide-react";
import { PageShell, StatusAlert } from "../../../shared/components";
import { useLogHistory } from "../hooks/useLogHistory";

export function HistoryView() {
  const { logs, exportLogs, clearLogs, logPath, loadLogFile, selectLogDirectory } = useLogHistory();
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; warn?: boolean; msg: string } | null>(null);

  const handleSelectFolder = async () => {
    await selectLogDirectory();
  };

  const handleExport = async () => {
    setExportMsg(null);
    const result = await exportLogs();
    if (result.status === "saved") {
      setExportMsg({ ok: true, msg: `Relatório salvo em: ${result.path}` });
    } else if (result.status === "empty") {
      setExportMsg({ ok: false, warn: true, msg: "Não há eventos para exportar." });
    } else if (result.status === "error") {
      setExportMsg({ ok: false, msg: `Erro ao exportar: ${result.message}` });
    }
    // "cancelled" → usuário fechou o diálogo; não mostra nada.
  };

  const btnGhost =
    "btn-ghost text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35";
  const btnAccent =
    "btn-accent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35";

  return (
    <PageShell variant="singleColumn" maxWidthClassName="w-full">
      <div className="flex h-full min-h-0 flex-col gap-4 pb-8">
        <section className="space-y-3 rounded-item border border-line bg-surface p-4">
          <div className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <FolderOpen size={14} className="shrink-0 text-accent-soft" />
            <span className="truncate font-mono">{logPath || "Carregando..."}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleSelectFolder} className={btnGhost}>
              <FolderOpen size={16} />
              Alterar Local
            </button>
            <button type="button" onClick={clearLogs} className={btnGhost}>
              <Upload size={16} />
              Limpar Log
            </button>
            <button type="button" onClick={handleExport} className={btnAccent}>
              <Download size={16} />
              Exportar Relatório
            </button>
            <button type="button" onClick={loadLogFile} className={btnGhost}>
              <RefreshCw size={16} />
              Recarregar
            </button>
          </div>

          <StatusAlert status={exportMsg} />
        </section>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-item border border-line bg-surface">
          <header className="flex items-center gap-2.5 border-b border-line px-5 py-4">
            <FileText size={16} className="shrink-0 text-accent-soft" aria-hidden />
            <h2 className="text-base font-semibold text-ink-strong">
              Log de Eventos do Sistema
            </h2>
          </header>
          <div className="scrollbar-thin h-96 overflow-y-auto p-4 font-mono text-sm">
            {logs.map((log, index) => (
              <div
                key={`${log.time}-${index}`}
                className="mb-2 flex gap-3 last:mb-0"
              >
                <span className="shrink-0 select-none text-ink-faint">{log.time}</span>
                <span className="select-none text-line">-</span>
                <span
                  className={
                    log.type === "success"
                      ? "text-success"
                      : log.type === "error"
                        ? "text-danger"
                        : "text-ink-strong"
                  }
                >
                  {log.action}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
