import { Cpu, HardDrive, X } from "lucide-react";
import { ModalShell } from "../../../shared/components";
import { useDiskList, type DiskInfo } from "../hooks/useDiskList";
import type { ProcessorInfo } from "../hooks/useProcessorInfo";

export function DiskInfoModal({ onClose }: { onClose: () => void }) {
  const { disks, loading } = useDiskList();

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-2xl">
      <div className="premium-panel relative overflow-hidden rounded-[28px]">
        <div className="flex items-center justify-between border-b border-line/15 px-5 py-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-line/20 bg-surface-overlay text-accent-soft">
              <HardDrive className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h3 className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.03em] text-ink-strong">
                Discos
              </h3>
              <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-ink-faint">
                Volumes montados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-overlay/60 hover:text-ink-strong"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {loading ? (
            <div className="premium-card rounded-[24px] px-4 py-8 text-center text-sm text-ink">
              Carregando discos...
            </div>
          ) : disks.length === 0 ? (
            <div className="premium-card rounded-[24px] px-4 py-8 text-center text-sm text-ink">
              Nenhum volume detectado.
            </div>
          ) : (
            <div className="space-y-3">
              {disks.map((disk, index) => (
                <DiskRow key={`${disk.mountPoint}-${index}`} disk={disk} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function DiskRow({ disk }: { disk: DiskInfo }) {
  const hasUsage = typeof disk.usedPercent === "number" && disk.usedPercent >= 0;
  const usedPct = hasUsage ? Math.min(100, Math.max(0, Math.round(disk.usedPercent))) : 0;
  const almostFull = usedPct >= 90;

  return (
    <section className="premium-card rounded-[24px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] font-semibold text-ink-strong">
              {disk.mountPoint}
            </span>
            {disk.isRemovable ? (
              <span className="rounded-full border border-line/25 bg-surface-overlay/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                Removível
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-muted" title={disk.name || disk.fileSystem}>
            {disk.name?.trim() || "Volume"} · {disk.fileSystem || "—"}
          </p>
        </div>
        <span
          className={`shrink-0 text-sm font-semibold ${
            almostFull ? "text-warning" : "text-accent-soft"
          }`}
        >
          {hasUsage ? `${usedPct}% em uso` : "—"}
        </span>
      </div>

      <div className="mt-3 h-2.5 w-full rounded-full bg-surface-overlay">
        <div
          className={`h-2.5 rounded-full ${
            almostFull
              ? "bg-gradient-to-r from-warning to-warning"
              : "bg-gradient-to-r from-accent to-accent-soft"
          }`}
          style={{ width: `${hasUsage ? Math.max(2, usedPct) : 0}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between text-xs font-medium text-ink">
        <span>Livre: {disk.freeLabel}</span>
        <span>Total: {disk.totalLabel}</span>
      </div>
    </section>
  );
}

interface ProcessorInfoModalProps {
  processors: ProcessorInfo[];
  loading: boolean;
  onClose: () => void;
}

export function ProcessorInfoModal({
  processors,
  loading,
  onClose,
}: ProcessorInfoModalProps) {
  return (
    <ModalShell onClose={onClose} maxWidth="max-w-2xl">
      <div className="premium-panel relative overflow-hidden rounded-[28px]">
        <div className="flex items-center justify-between border-b border-line/15 px-5 py-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-line/20 bg-surface-overlay text-accent-soft">
              <Cpu className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h3 className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.03em] text-ink-strong">
                Processador
              </h3>
              <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-ink-faint">
                Detalhes da CPU
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-overlay/60 hover:text-ink-strong"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="premium-card rounded-[24px] px-4 py-8 text-center text-sm text-ink">
              Carregando informações do processador...
            </div>
          ) : (
            <div className="space-y-3">
              {processors.map((processor, index) => (
                <section
                  key={`${processor.name}-${index}`}
                  className="premium-card rounded-[24px] p-5"
                >
                  <div className="max-w-full text-[15px] font-semibold leading-7 text-ink-strong [overflow-wrap:anywhere]">
                    {processor.name}
                  </div>
                  <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
                    <ProcessorDatum label="Cores" value={String(processor.cores)} />
                    <ProcessorDatum label="Threads" value={String(processor.threads)} />
                    <ProcessorDatum label="Velocidade" value={processor.speed} />
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function ProcessorDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-ink-strong">{value}</div>
    </div>
  );
}
