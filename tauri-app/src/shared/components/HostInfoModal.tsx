import { X, Server, Monitor, Network, Shield } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { CopyableField } from "./CopyableField";
import type { SystemInfo } from "../types/system";
import {
  formatUpdatesSubtitleWithDate,
  getBitlockerDisplay,
  getBitlockerSubtitle,
  getFirewallSubtitle,
} from "../utils/securityInfo";

interface Props {
  info: SystemInfo;
  onClose: () => void;
}

export function HostInfoModal({ info, onClose }: Props) {
  const antivirusValue =
    info.antivirusStatus && info.antivirusStatus !== "..." ? info.antivirusStatus : "—";

  const securityRows: { label: string; value: string; mono: boolean }[] = [
    {
      label: "Firewall",
      value: `${getFirewallSubtitle(info.firewallStatus)} (${info.firewallStatus})`,
      mono: false,
    },
    { label: "Antivírus", value: antivirusValue, mono: false },
    {
      label: "Updates",
      value: formatUpdatesSubtitleWithDate(info.updateStatus, info.lastScan),
      mono: false,
    },
    {
      label: "BitLocker",
      value: `${getBitlockerSubtitle(info.bitlockerStatus)} (${getBitlockerDisplay(info.bitlockerStatus)})`,
      mono: false,
    },
  ];

  const systemRows = [
    { label: "Hostname", value: info.hostname, mono: true },
    { label: "Sistema", value: info.osVersion, mono: false },
    { label: "Build", value: info.osBuild, mono: false },
    { label: "Colaborador", value: info.username, mono: false },
    { label: "Nº Serie", value: info.serialNumber, mono: true },
  ];

  const networkRows = [
    { label: "IP Interno", value: info.localIp, mono: true },
    { label: "IP Externo", value: info.publicIp || "—", mono: true },
    { label: "Gateway", value: info.gateway, mono: true },
    { label: "DNS Server", value: info.dnsServer, mono: true },
    { label: "MAC Address", value: info.macAddress, mono: true },
  ];

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-hidden rounded-card bg-surface shadow-lift">

        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-item bg-accent-tint text-accent-strong">
              <Server className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-[1.5rem] font-semibold leading-none tracking-[-0.03em] text-ink-strong">
                Detalhes do Sistema
              </h3>
              <p className="mt-1 font-mono text-xs text-ink-muted">
                {info.hostname}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar (Esc)"
            className="focus-ring rounded-xl p-2 text-ink-muted transition-colors hover:bg-accent-tint hover:text-accent-strong"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 grid-cols-2 gap-4 overflow-y-auto p-6">
          <section className="rounded-xl border border-line bg-surface-raised px-4 pb-1 pt-3.5 col-span-2">
            <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              <Shield className="h-3.5 w-3.5 text-accent-soft" aria-hidden />
              Segurança
            </h4>
            <div className="space-y-0.5">
              {securityRows.map((row, index) => (
                <CopyableField
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  isMono={row.mono}
                  isLast={index === securityRows.length - 1}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface-raised px-4 pb-1 pt-3.5">
            <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              <Monitor className="h-3.5 w-3.5 text-accent-soft" aria-hidden />
              Hardware e sistema
            </h4>
            <div className="space-y-0.5">
              {systemRows.map((row, index) => (
                <CopyableField
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  isMono={row.mono}
                  isLast={index === systemRows.length - 1}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-line bg-surface-raised px-4 pb-1 pt-3.5">
            <h4 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              <Network className="h-3.5 w-3.5 text-accent-soft" aria-hidden />
              Rede
            </h4>
            <div className="space-y-0.5">
              {networkRows.map((row, index) => (
                <CopyableField
                  key={row.label}
                  label={row.label}
                  value={row.value}
                  isMono={row.mono}
                  isLast={index === networkRows.length - 1}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="flex shrink-0 justify-end border-t border-line px-6 py-3.5">
          <button type="button" onClick={onClose} className="btn-ghost rounded-item px-5 py-2.5 text-sm font-medium">
            Fechar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
