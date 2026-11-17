import { Lock, RefreshCw, Shield, ShieldCheck, type LucideIcon } from "lucide-react";
import type { SystemInfo } from "../../../shared/types/system";
import { DashboardStatusBadge } from "./DashboardPrimitives";
import { displayValue, type MetricTone } from "../utils/dashboardMetrics";
import { formatUpdatesSubtitleWithDate, getBitlockerDisplay, getBitlockerSubtitle, getFirewallSubtitle, isUpdatesHealthy } from "../../../shared/utils/securityInfo";

export interface SecurityStatusPanelProps {
  readonly systemInfo: SystemInfo;
  readonly antivirusDetails: string;
  readonly antivirusHealthy: boolean;
  readonly antivirusLoading?: boolean;
}

function SecurityRow({ icon: Icon, title, detail, tone, status }: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly detail: string;
  readonly tone: MetricTone;
  readonly status: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-line py-4 last:border-0">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <div className="min-w-0"><h3 className="text-sm font-medium">{title}</h3><p className="mt-1 text-xs leading-5 text-ink-muted [overflow-wrap:anywhere]">{detail}</p></div>
      </div>
      <DashboardStatusBadge tone={tone}>{status}</DashboardStatusBadge>
    </div>
  );
}

function protectionTone(value: string): MetricTone {
  if (/^ativo$/i.test(value)) return "healthy";
  if (/^inativo$/i.test(value)) return "warning";
  return "neutral";
}

export function SecurityStatusPanel({ systemInfo: info, antivirusDetails, antivirusHealthy, antivirusLoading = false }: SecurityStatusPanelProps) {
  const firewallTone = protectionTone(info.firewallStatus);
  const bitlockerTone = protectionTone(info.bitlockerStatus);
  const updateKnown = isUpdatesHealthy(info.updateStatus) || info.updateStatus === "Reiniciar Pendente";
  return (
    <div>
      <SecurityRow icon={ShieldCheck} title="Firewall" tone={firewallTone}
        status={firewallTone === "neutral" ? "Sem leitura" : displayValue(info.firewallStatus)}
        detail={firewallTone === "neutral" ? "Proteção de rede não confirmada" : getFirewallSubtitle(info.firewallStatus)} />
      <SecurityRow icon={Shield} title="Antivírus" tone={antivirusLoading ? "neutral" : antivirusHealthy ? "healthy" : "warning"}
        status={antivirusLoading ? "Sem leitura" : antivirusHealthy ? "Detectado" : "Verificar"}
        detail={antivirusLoading ? "Aguardando identificação do antivírus" : antivirusDetails} />
      <SecurityRow icon={RefreshCw} title="Windows Update" tone={!updateKnown ? "neutral" : isUpdatesHealthy(info.updateStatus) ? "healthy" : "warning"}
        status={!updateKnown ? "Sem leitura" : isUpdatesHealthy(info.updateStatus) ? "Em dia" : "Reiniciar"}
        detail={updateKnown ? formatUpdatesSubtitleWithDate(info.updateStatus, info.lastScan === "..." ? "" : info.lastScan) : "Atualizações não verificadas"} />
      <SecurityRow icon={Lock} title="BitLocker" tone={bitlockerTone}
        status={bitlockerTone === "neutral" ? getBitlockerDisplay(info.bitlockerStatus) : displayValue(info.bitlockerStatus)}
        detail={bitlockerTone === "neutral" ? "Criptografia não confirmada" : getBitlockerSubtitle(info.bitlockerStatus)} />
    </div>
  );
}
