import {
  Globe, Wrench, Settings, Activity, Terminal, RefreshCw, Trash2, Zap,
  Command, LayoutGrid, Battery, Monitor, RotateCcw, Save,
  CalendarClock, Users, Cpu, Sliders, Search, BriefcaseBusiness,
} from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { motion } from "motion/react";
import { Input, PageShell, Switch, TerminalModal, ToolButton } from "../../../shared/components";
import { useSettings } from "../../settings/hooks/useSettings";
import type { MaintenanceTask } from "../hooks/useTauriCommands";
import { useTauriCommands } from "../hooks/useTauriCommands";

// ── WinToolBtn (grade 3-col, estilo ícone) ────────────────────────────────────
function WinToolBtn({
  label, icon, delay = 0, disabled, onClick,
}: {
  label: string; icon: ComponentType<{ className?: string }>; delay?: number; disabled: boolean; onClick: () => void;
}) {
  const Icon = icon;
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 24 }}
      whileHover={disabled ? {} : { scale: 1.05 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className="btn-ghost group flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface-raised px-2 py-3 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-5 w-5 text-accent-soft transition-colors group-hover:text-ink-strong" />
      <span className="whitespace-pre-line text-[11px] font-medium leading-snug text-ink-strong transition-colors group-hover:text-ink-strong">{label}</span>
    </motion.button>
  );
}

// ── ToolsView ─────────────────────────────────────────────────────────────────
export function ToolsView() {
  const { settings, updateSettings } = useSettings();
  const {
    runPing, runNetstat, runIpconfig, checkWebPorts, runMaintenance, runToolWithTarget,
    stopStreaming, isLoading, isStreaming, lastResult, streamingLines,
  } = useTauriCommands();

  const [dnsTarget, setDnsTarget] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");

  const modalLines: string[] = isStreaming || streamingLines.length > 0
    ? streamingLines
    : lastResult?.output
      ? lastResult.output.split("\n").filter((l) => l.trim() !== "")
      : [];

  const openModal = (label: string) => { setModalTitle(label); setModalOpen(true); };
  const sectionClass =
    "rounded-xl border border-line bg-surface p-4 sm:p-5";

  const winTools: { label: string; icon: ComponentType<{ className?: string }>; task: MaintenanceTask }[] = [
    { label: "Visualizador\nEventos", icon: Activity,     task: "open_eventvwr" },
    { label: "Serviços",              icon: Sliders,       task: "open_services" },
    { label: "MSConfig",              icon: Cpu,           task: "open_msconfig" },
    { label: "Ger.\nComputador",      icon: LayoutGrid,    task: "open_compmgmt" },
    { label: "Agendador\nTarefas",    icon: CalendarClock, task: "open_taskschd" },
    { label: "Usuários\nLocais",      icon: Users,         task: "open_lusrmgr"  },
  ];

  const maintenanceTools: { label: string; icon: ComponentType<{ className?: string }>; task: MaintenanceTask; modal?: string; variant?: "default" | "highlight" }[] = [
    { label: "Reiniciar SHIFT",      icon: RefreshCw,  task: "restart_services", modal: "Reiniciar SHIFT", variant: "highlight" },
    { label: "Limpeza de Cache",     icon: Trash2,     task: "clean_temp",       modal: "Limpeza de Cache" },
    { label: "Reiniciar Spooler",    icon: Zap,        task: "restart_spooler",  modal: "Reiniciar Spooler" },
    { label: "Forçar GPUpdate",      icon: Command,    task: "gpupdate",         modal: "Forçar GPUpdate" },
    { label: "Reset Winsock",        icon: RotateCcw,  task: "winsock_reset",    modal: "Reset Winsock" },
    { label: "Reiniciar Explorer",   icon: Monitor,    task: "restart_explorer", modal: "Reiniciar Explorer" },
    { label: "Ponto de Restauração", icon: Save,       task: "restore_point",    modal: "Ponto de Restauração" },
  ];

  const adminTools: { label: string; icon: ComponentType<{ className?: string }>; task: MaintenanceTask; modal?: string }[] = [
    { label: "Verificação DISM",  icon: Activity,   task: "dism_health",    modal: "Verificação DISM" },
    { label: "Verificar SFC",     icon: Wrench,     task: "sfc_scan",       modal: "Verificação SFC" },
    { label: "Ger. Dispositivos", icon: LayoutGrid, task: "device_manager" },
    { label: "Relatório Bateria", icon: Battery,    task: "battery_report" },
    { label: "Reparar Office",    icon: BriefcaseBusiness, task: "repair_office"  },
  ];

  return (
    <>
      <TerminalModal
        open={modalOpen}
        title={modalTitle}
        lines={modalLines}
        isStreaming={isStreaming}
        isRunning={isLoading}
        error={lastResult && !lastResult.success ? lastResult.error || "O comando terminou com falha." : null}
        onClose={() => setModalOpen(false)}
        onStop={stopStreaming}
      />

      <PageShell
        variant="singleColumn"
        maxWidthClassName="w-full"
      >
        {/* pb-8: folga no fim do scroll. O wrapper externo (motion.div flex-1
            min-h-0) trava a altura na viewport e o conteúdo transborda, então a
            margem inferior precisa vir daqui, do conteúdo que de fato rola. */}
        <div className="space-y-4 pb-8 text-ink-strong">

        {/* ── Linha 1: Diagnóstico + Manutenção ──────────────────────────────── */}
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
          {/* Diagnóstico de Rede */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, type: "spring", stiffness: 300, damping: 24 }} className="flex min-w-0 flex-col space-y-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-strong">
              <Globe className="h-4 w-4 text-accent-soft" /> Diagnóstico de Rede
            </h2>
            <div className={`${sectionClass} flex flex-1 flex-col space-y-3`}>

              {/* Ping */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-muted">Teste de Latência</label>
                <div className="flex gap-2">
                  <Input value={settings.pingTarget} onChange={(e) => updateSettings({ pingTarget: e.target.value })} placeholder="IP ou hostname" />
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={() => { openModal(`Ping — ${settings.pingTarget}${settings.pingInfinite ? " (-t)" : ""}`); runPing(settings.pingTarget, settings.pingInfinite); }}
                    disabled={isLoading}
                    className="btn-accent shrink-0 text-sm disabled:opacity-40"
                  >Ping</motion.button>
                </div>
                <Switch checked={settings.pingInfinite} onChange={(pingInfinite) => updateSettings({ pingInfinite })}>
                  Modo Contínuo (-t)
                </Switch>
              </div>

              <div className="border-t border-line" />

              {/* Portas */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-muted">Portas HTTP / HTTPS</label>
                <div className="flex gap-2">
                  <Input value={settings.portTarget} onChange={(e) => updateSettings({ portTarget: e.target.value })} placeholder="hostname ou IP" />
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={() => { openModal(`Portas — ${settings.portTarget}`); checkWebPorts(settings.portTarget); }}
                    disabled={isLoading}
                    className="btn-accent shrink-0 text-sm disabled:opacity-40"
                  >Verificar</motion.button>
                </div>
              </div>

              <div className="border-t border-line" />

              {/* DNS */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-muted">DNS Lookup</label>
                <div className="flex gap-2">
                  <Input value={dnsTarget} onChange={(e) => setDnsTarget(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && dnsTarget.trim()) { openModal(`DNS — ${dnsTarget.trim()}`); runToolWithTarget(dnsTarget.trim()); } }}
                    placeholder="ex: google.com" />
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                    onClick={() => { if (!dnsTarget.trim()) return; openModal(`DNS — ${dnsTarget.trim()}`); runToolWithTarget(dnsTarget.trim()); }}
                    disabled={isLoading || !dnsTarget.trim()}
                    className="btn-accent flex shrink-0 px-3 py-2.5 disabled:opacity-40"
                  ><Search size={15} /></motion.button>
                </div>
              </div>

              <div className="border-t border-line" />

              {/* Netstat */}
              <ToolButton label="Netstat — Conexões Ativas" icon={Terminal} disabled={isLoading}
                onClick={() => { openModal("Netstat -an"); runNetstat(); }} />

              <div className="border-t border-line" />

              {/* IP / DNS (ipconfig) */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-muted">IP / DNS</label>
                <div className="grid grid-cols-3 gap-2">
                  <WinToolBtn label={"Ver\nConfig"} icon={Globe} disabled={isLoading}
                    onClick={() => { openModal("Configuração de Rede (ipconfig /all)"); runIpconfig("config"); }} />
                  <WinToolBtn label={"Limpar\nDNS"} icon={Trash2} disabled={isLoading}
                    onClick={() => { openModal("Limpar cache DNS"); runIpconfig("flushdns"); }} />
                  <WinToolBtn label={"Renovar\nIP"} icon={RefreshCw} disabled={isLoading}
                    onClick={() => { openModal("Renovar IP (DHCP)"); runIpconfig("renew"); }} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Manutenção do Sistema */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 24 }} className="flex min-w-0 flex-col space-y-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-strong">
              <Wrench className="h-4 w-4 text-accent-soft" /> Manutenção do Sistema
            </h2>
            <div className={`${sectionClass} flex flex-1 flex-col space-y-2`}>
              {maintenanceTools.map((t, i) => (
                <ToolButton key={t.task} label={t.label} icon={t.icon} delay={0.12 + i * 0.04} disabled={isLoading}
                  variant={t.variant}
                  onClick={() => { if (t.modal) openModal(t.modal); runMaintenance(t.task); }} />
              ))}
            </div>
          </motion.div>
        </div>

        {/* ── Linha 2: Administrativas + Ferramentas Windows ─────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Ferramentas Administrativas */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 24 }} className="min-w-0 space-y-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-strong">
              <Settings className="h-4 w-4 text-accent-soft" /> Ferramentas Administrativas
            </h2>
            <div className={`${sectionClass} space-y-2`}>
              {adminTools.map((t, i) => (
                <ToolButton key={t.task} label={t.label} icon={t.icon} delay={0.17 + i * 0.04} disabled={isLoading}
                  onClick={() => { if (t.modal) openModal(t.modal); runMaintenance(t.task); }} />
              ))}
            </div>
          </motion.div>

          {/* Ferramentas Windows */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 24 }} className="min-w-0 space-y-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-strong">
              <Monitor className="h-4 w-4 text-accent-soft" /> Ferramentas Windows
            </h2>
            <div className={sectionClass}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {winTools.map(({ label, icon, task }, i) => (
                  <WinToolBtn key={task} label={label} icon={icon} delay={0.22 + i * 0.04} disabled={isLoading} onClick={() => runMaintenance(task)} />
                ))}
              </div>
            </div>
          </motion.div>
        </div>
        </div>
      </PageShell>
    </>
  );
}
