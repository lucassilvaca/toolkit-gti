import { AlertTriangle, CheckCircle2, CircleHelp, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { MetricTone } from "../utils/dashboardMetrics";

const statusStyles = {
  neutral: "bg-surface-raised text-ink-muted",
  healthy: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  critical: "bg-danger/10 text-danger",
} as const;

const barStyles = {
  neutral: "bg-line",
  healthy: "bg-success",
  warning: "bg-warning",
  critical: "bg-danger",
} as const;

export function DashboardStatusBadge({ tone, children }: {
  readonly tone: MetricTone;
  readonly children: ReactNode;
}) {
  const Icon = tone === "healthy" ? CheckCircle2 : tone === "neutral" ? CircleHelp : AlertTriangle;
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${statusStyles[tone]}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

export function DashboardMetric({ label, value, unit, percent, tone, status, detail, icon: Icon, onDetails }: {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly percent: number | null;
  readonly tone: MetricTone;
  readonly status: string;
  readonly detail: string;
  readonly icon: LucideIcon;
  readonly onDetails?: () => void;
}) {
  return (
    <section className="dashboard-metric min-w-0 p-5" aria-label={label}>
      <div className="dashboard-metric-header mb-3 flex flex-wrap items-center justify-between gap-2">
        {onDetails ? (
          <button type="button" onClick={onDetails} className="focus-ring -ml-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-raised hover:text-accent-strong">
            <Icon className="h-4 w-4" aria-hidden />{label}<ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : (
          <h3 className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink"><Icon className="h-4 w-4" aria-hidden />{label}</h3>
        )}
        <DashboardStatusBadge tone={tone}>{status}</DashboardStatusBadge>
      </div>
      <p className="flex flex-wrap items-baseline gap-2 tabular-nums">
        <span className="break-words text-4xl font-semibold tracking-tight text-ink-strong">{value}</span>
        {unit ? <span className="text-sm text-ink-muted">{unit}</span> : null}
      </p>
      <div role="progressbar" aria-label={`${label}: utilização`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? "Leitura indisponível" : `${Math.round(percent)}% em uso`} className="mb-3 mt-4 h-1.5 overflow-hidden rounded-full bg-surface-overlay">
        <div className={`h-full rounded-full ${barStyles[tone]}`} style={{ width: `${percent ?? 0}%` }} />
      </div>
      <p className="text-xs leading-5 text-ink-muted">{detail}</p>
    </section>
  );
}
