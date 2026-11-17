import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Clock3, Cpu, HardDrive, ListTodo, MemoryStick, RefreshCw, Server, UserRound } from "lucide-react";
import { HostInfoModal } from "../../../shared/components";
import { useTaskManager } from "../../../shared/hooks/useTaskManager";
import { DashboardMetric } from "../components/DashboardPrimitives";
import { DiskInfoModal, ProcessorInfoModal } from "../components/DashboardModals";
import { SecurityStatusPanel } from "../components/SecurityStatusPanel";
import { useAntivirusInfo } from "../hooks/useAntivirusInfo";
import { useProcessorInfo } from "../hooks/useProcessorInfo";
import { useSharedSystemInfo } from "../hooks/SystemInfoContext";
import { diskFreeValue, displayValue, formatGb, formatIpAssignment, getMetricTone, readPercent } from "../utils/dashboardMetrics";
import { errorText } from "../../../shared/utils/errorText";
import "./dashboard.css";

const usageLabels = { neutral: "Sem leitura", healthy: "Normal", warning: "Elevado", critical: "Crítico" } as const;

export function DashboardView() {
  const { systemInfo: info, loading, error, refreshingHealth, refreshHealth, refresh } = useSharedSystemInfo();
  const [showHostInfo, setShowHostInfo] = useState(false);
  const [showProcessorInfo, setShowProcessorInfo] = useState(false);
  const [showDisks, setShowDisks] = useState(false);
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { processors, loading: loadingProcessor } = useProcessorInfo({ enabled: showProcessorInfo });
  const { antivirus, loading: loadingAntivirus, error: antivirusError } = useAntivirusInfo();
  const { openTaskManager } = useTaskManager();
  const busy = refreshingHealth || refreshingDashboard;

  const handleRefresh = useCallback(async () => {
    setRefreshingDashboard(true);
    setRefreshError(null);
    try {
      await refresh();
      await refreshHealth();
    } catch (cause) {
      setRefreshError(errorText(cause));
    } finally {
      setRefreshingDashboard(false);
    }
  }, [refresh, refreshHealth]);

  const antivirusList = useMemo(() => {
    if (loadingAntivirus || antivirusError || antivirus === "...") return [];
    return [...new Set(antivirus.split(",").map((item) => item.trim()).filter((item) => item && !/^(nenhum|n[aã]o|desconhecido|indispon[ií]vel)/i.test(item)))];
  }, [antivirus, loadingAntivirus, antivirusError]);

  const cpu = loading ? null : readPercent(info.cpuUsage);
  const ram = info.memoryTotalGb > 0 ? readPercent(info.memoryUsage) : null;
  const disk = readPercent(info.diskUsedPercent);
  const cpuTone = getMetricTone(cpu);
  const ramTone = getMetricTone(ram);
  const diskTone = getMetricTone(disk, 85);
  const diskFree = diskFreeValue(info.diskFree);
  const ramRemaining = Math.max(0, info.memoryTotalGb - info.memoryUsedGb);
  const alerts = [
    cpuTone === "critical" ? `CPU em ${Math.round(cpu ?? 0)}%` : cpuTone === "warning" ? "Uso de CPU elevado" : null,
    ramTone === "critical" || ramTone === "warning" ? `RAM: ${formatGb(ramRemaining)} GB livres` : null,
    diskTone === "critical" || diskTone === "warning" ? `Disco C: ${Math.round(disk ?? 0)}% ocupado` : null,
    info.diskHealth === "Crítico" || info.diskHealth === "Atenção" ? `Saúde do disco: ${info.diskHealth}` : null,
    info.firewallStatus.toLowerCase() === "inativo" ? "Firewall inativo" : null,
  ].filter((message): message is string => message !== null);
  const critical = cpuTone === "critical" || ramTone === "critical" || diskTone === "critical" || info.diskHealth === "Crítico";
  const network = [
    ["IP local", displayValue(info.localIp)],
    ["Gateway", displayValue(info.gateway)],
    ["IP público", displayValue(info.publicIp)],
    ["Atribuição", formatIpAssignment(info.connectionType)],
    ["Operadora", displayValue(info.isp)],
  ];

  return (
    <div className="dashboard-layout mx-auto w-full min-w-0 max-w-7xl pb-20 text-ink-strong md:pb-10">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent-soft">Estação de trabalho</p>
          <h1 className="text-3xl font-semibold tracking-tight">Resumo do sistema</h1>
          <p className="mt-1 text-sm text-ink-muted">Desempenho, proteção e conexão em um só lugar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void handleRefresh()} disabled={busy} aria-busy={busy} className="btn-ghost focus-ring gap-2 text-sm disabled:cursor-wait disabled:opacity-50">
            <RefreshCw className="h-4 w-4" aria-hidden />{busy ? "Atualizando…" : "Atualizar"}
          </button>
          <button type="button" onClick={openTaskManager} className="btn-accent focus-ring gap-2 text-sm"><ListTodo className="h-4 w-4" aria-hidden />Tarefas</button>
        </div>
      </header>

      {error || refreshError ? (
        <div role="alert" className="mb-4 rounded-xl border border-danger/30 bg-surface p-4 text-sm text-danger">
          <p className="font-semibold">Não foi possível atualizar todos os dados.</p>
          <p className="mt-1 break-words">{error || refreshError}</p>
          <p className="mt-1">As últimas informações disponíveis foram mantidas. Tente atualizar novamente.</p>
        </div>
      ) : null}
      {alerts.length > 0 ? (
        <section aria-label="Pontos de atenção" className={`mb-4 flex items-start gap-3 rounded-xl border p-4 ${critical ? "border-danger/25 bg-danger/5" : "border-warning/25 bg-warning/5"}`}>
          <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${critical ? "text-danger" : "text-warning"}`} aria-hidden />
          <div className="min-w-0">
            <h2 className={`text-sm font-semibold ${critical ? "text-danger" : "text-warning"}`}>Esta estação precisa de atenção</h2>
            <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">{alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul>
          </div>
        </section>
      ) : null}

      <section aria-label="Identificação da estação" className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface px-5 py-4">
        <div className="dashboard-identity flex min-w-0 flex-1 items-start gap-3">
          <Server className="mt-1 h-5 w-5 shrink-0 text-accent-soft" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">Computador</p>
            <h2 className="mt-0.5 text-lg font-semibold [overflow-wrap:anywhere]">{displayValue(info.hostname)}</h2>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
              <span className="flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere]"><UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />Sessão: {displayValue(info.username)}</span>
              <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />Ligado há {displayValue(info.uptime)}</span>
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setShowHostInfo(true)} className="btn-ghost focus-ring text-sm">Detalhes do host</button>
      </section>

      <section aria-labelledby="performance-heading" className="mb-4 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
          <h2 id="performance-heading" className="text-base font-semibold text-ink-strong">Desempenho</h2>
          <p className="text-xs text-ink-muted">{loading ? "Carregando leituras…" : "Utilização atual dos recursos"}</p>
        </div>
        <div className="dashboard-metrics">
          <DashboardMetric label="CPU" icon={Cpu} value={cpu === null ? "—" : String(Math.round(cpu))}
            unit={cpu === null ? undefined : "% em uso"} percent={cpu} tone={cpuTone} status={usageLabels[cpuTone]}
            detail={cpu === null ? "Aguardando leitura do processador" : `${info.processCount} processos em execução`}
            onDetails={() => setShowProcessorInfo(true)} />
          <DashboardMetric label="Memória RAM" icon={MemoryStick} value={ram === null ? "—" : formatGb(info.memoryUsedGb)}
            unit={ram === null ? undefined : "GB em uso"} percent={ram} tone={ramTone} status={usageLabels[ramTone]}
            detail={ram === null ? "Capacidade de memória não informada" : `${formatGb(ramRemaining)} GB livres de ${formatGb(info.memoryTotalGb)} GB`} />
          <DashboardMetric label="Disco (C:)" icon={HardDrive} value={diskFree.value}
            unit={diskFree.unit ? `${diskFree.unit} livres` : undefined} percent={disk} tone={diskTone}
            status={disk === null ? "Sem leitura" : diskTone === "healthy" ? "Espaço disponível" : diskTone === "critical" ? "Quase cheio" : "Pouco espaço"}
            detail={`${disk === null ? "Uso não informado" : `${Math.round(disk)}% ocupado`} · Saúde: ${displayValue(info.diskHealth)}`}
            onDetails={() => setShowDisks(true)} />
        </div>
      </section>
      <div className="dashboard-details gap-4">
        <section aria-labelledby="security-heading" className="min-w-0 rounded-xl border border-line bg-surface px-5">
          <div className="border-b border-line py-4">
            <h2 id="security-heading" className="text-base font-semibold text-ink-strong">Segurança</h2>
            <p className="mt-1 text-xs text-ink-muted">Proteções e atualizações do Windows</p>
          </div>
          <SecurityStatusPanel systemInfo={info} antivirusDetails={antivirusList.join(", ") || "Nenhum produto identificado"}
            antivirusHealthy={antivirusList.length > 0} antivirusLoading={loadingAntivirus || Boolean(antivirusError) || antivirus === "..."} />
        </section>
        <section aria-labelledby="network-heading" className="min-w-0 rounded-xl border border-line bg-surface px-5">
          <div className="border-b border-line py-4">
            <h2 id="network-heading" className="text-base font-semibold text-ink-strong">Rede e conexão</h2>
            <p className="mt-1 text-xs text-ink-muted">Endereços e configuração de acesso</p>
          </div>
          <dl>{network.map(([label, value]) => (
            <div key={label} className="dashboard-network-row text-sm">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="min-w-0 select-text font-medium [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}</dl>
        </section>
      </div>
      {showHostInfo ? <HostInfoModal info={info} onClose={() => setShowHostInfo(false)} /> : null}
      {showProcessorInfo ? <ProcessorInfoModal processors={processors} loading={loadingProcessor} onClose={() => setShowProcessorInfo(false)} /> : null}
      {showDisks ? <DiskInfoModal onClose={() => setShowDisks(false)} /> : null}
    </div>
  );
}
