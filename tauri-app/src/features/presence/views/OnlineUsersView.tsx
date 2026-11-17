import { useCallback, useState, type FormEvent } from "react";
import { Users, RefreshCw, Loader2, Search, ArrowUp, ArrowDown, Network, X } from "lucide-react";
import { PageShell, PrimaryButton, StatusAlert, Input, RadarLoader, Switch } from "../../../shared/components";
import { callUser } from "../../chat/services/callUser";
import type { GoToChat } from "../../chat/hooks/useChatSessions";
import { useOnlineUsers } from "../hooks/useOnlineUsers";
import { OnlineUsersSection } from "../components/OnlineUsersSection";
import type { OnlineUser, SortKey } from "../types";

/** IPv4 ou nome de máquina digitado na busca (validação real fica no backend). */
const HOST_OR_IP_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

interface OnlineUsersViewProps {
  onGoToChat: GoToChat;
}

export function OnlineUsersView({ onGoToChat }: OnlineUsersViewProps) {
  const {
    localIp, chatPort, ipReady, loading, progress, net, probed, scannedAt,
    autoRefresh, setAutoRefresh, query, setQuery, sort, toggleSort,
    manual, online, recent, onlineCount, scan, status, setOk, setErr, setWarn, clear,
    connectByIp, connecting, clearManual, manualCount,
  } = useOnlineUsers();

  const [callingIp, setCallingIp] = useState<string | null>(null);
  const [manualIp, setManualIp] = useState("");

  const submitConnectByIp = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (connecting || !manualIp.trim()) return;
      void connectByIp(manualIp).then(() => setManualIp(""));
    },
    [connecting, manualIp, connectByIp],
  );

  const handleCall = useCallback(
    async (u: OnlineUser) => {
      if (callingIp) return;
      if (!ipReady) { setErr("IP local ainda não disponível."); return; }
      setCallingIp(u.ip);
      clear();
      const result = await callUser({ hostname: u.ip, localIp, chatPort });
      setCallingIp(null);
      if (result.status === "busy") { setWarn(`${u.hostname || u.ip} já está em atendimento.`); return; }
      if (result.status === "error") { setErr(result.message); return; }
      // Dados da descoberta alimentam o painel "Máquina" do atendimento.
      onGoToChat(result.roomId, result.wsUrl, u.hostname || u.ip, {
        address: u.ip,
        hostname: u.hostname || undefined,
        username: u.username || undefined,
        online: u.online,
        hasToolkit: u.has_toolkit,
        uptimeSeconds: u.uptime_secs,
        lastSeen: u.last_seen,
      });
    },
    [ipReady, callingIp, localIp, chatPort, clear, setErr, setWarn, onGoToChat],
  );

  // Cabeçalho de coluna clicável (ordenação). O sort é global e reflete nas duas seções.
  const SortHeader = ({ label, sortKey, align = "left" }: { label: string; sortKey: SortKey; align?: "left" | "right" }) => (
    <th
      scope="col"
      aria-sort={sort.key === sortKey ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className={`inline-flex min-h-11 items-center gap-1 transition hover:text-ink-strong ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        {sort.key === sortKey && (sort.dir === "asc" ? <ArrowUp size={11} aria-hidden /> : <ArrowDown size={11} aria-hidden />)}
      </button>
    </th>
  );

  const empty = manual.length === 0 && online.length === 0 && recent.length === 0;

  return (
    <PageShell variant="singleColumn" maxWidthClassName="w-full">
      <div className="pb-8">
        <section aria-labelledby="online-users-heading" className="overflow-hidden rounded-xl border border-line bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent-soft">
                <Users size={17} />
              </span>
              <h2 id="online-users-heading" className="text-lg font-semibold tracking-tight text-ink-strong">Usuários Online</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Switch checked={autoRefresh} onChange={setAutoRefresh} className="text-ink-muted">
                Auto-atualizar
              </Switch>
              <PrimaryButton icon={loading ? Loader2 : RefreshCw} onClick={() => void scan()} disabled={loading || !ipReady}>
                {loading ? "Buscando..." : "Atualizar"}
              </PrimaryButton>
            </div>
          </header>

          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <p aria-live="polite" className="text-xs text-ink-muted">
              {loading
                ? progress ? `Sondando ${progress.done}/${progress.total} hosts...` : "Procurando na rede..."
                : `${onlineCount} ${onlineCount === 1 ? "usuário online" : "usuários online"}`}
              {scannedAt && !loading && <span className="text-ink-faint"> · atualizado {scannedAt}</span>}
              {net && !loading && <span className="text-ink-faint"> · faixas <span className="font-mono">{net}</span></span>}
            </p>

            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
              <Input aria-label="Buscar usuários por host, usuário ou IP" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por host, usuário ou IP..." className="pl-9" />
            </div>

            {/* Conectar por IP ou host: sonda uma máquina específica (inclusive de outra VLAN, se alcançável). */}
            <form onSubmit={submitConnectByIp} className="flex flex-col gap-1.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="relative flex-1">
                  <Network size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
                  <Input
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                    placeholder="Conectar por IP ou host (ex.: 10.20.30.40 ou PC-1234)..."
                    className="pl-9"
                    aria-label="Conectar por IP ou host"
                  />
                </div>
                <PrimaryButton className="w-full sm:w-auto" type="submit" icon={connecting ? Loader2 : Network} disabled={connecting || !manualIp.trim()}>
                  {connecting ? "Sondando..." : "Conectar"}
                </PrimaryButton>
                {manualCount > 0 && (
                  <button
                    type="button"
                    onClick={clearManual}
                    className="focus-ring inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted transition hover:bg-surface-overlay sm:w-auto"
                    title="Remover as máquinas adicionadas por IP"
                  >
                    <X size={13} aria-hidden /> Limpar ({manualCount})
                  </button>
                )}
              </div>
              <p className="text-xs text-ink-faint">
                Para uma máquina fora da sua VLAN, informe o IP ou o nome dela — o Toolkit resolve o nome no DNS e sonda o endereço direto (ping · TCP · Toolkit).
              </p>
            </form>

            <StatusAlert status={status} />

            {empty ? (
              <div className="rounded-lg border border-line bg-surface-raised px-4 py-8 text-center sm:py-10">
                {loading ? (
                  <div className="flex flex-col items-center gap-4 text-ink-muted">
                    <RadarLoader size={112} />
                    <span>{progress ? `Varrendo ${progress.done}/${progress.total}...` : "Varrendo a rede local..."}</span>
                  </div>
                ) : query ? (
                  <div className="flex flex-col items-center gap-3 text-ink-faint">
                    <span>Nenhum resultado para "{query}" nas faixas varridas.</span>
                    {/* A busca só filtra a lista; um IP/host de outra VLAN precisa ser sondado. */}
                    {HOST_OR_IP_PATTERN.test(query.trim()) && (
                      <button
                        type="button"
                        onClick={() => void connectByIp(query.trim())}
                        disabled={connecting}
                        className="btn-accent text-sm disabled:opacity-40"
                      >
                        {connecting ? "Conectando..." : `Conectar a ${query.trim()}`}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-ink-faint">
                    <span className="text-ink-muted">Nenhum usuário encontrado nas faixas varridas.</span>
                    {net && (
                      <span className="text-xs">
                        Faixas varridas: <span className="font-mono text-ink-muted">{net}</span>
                        {probed > 0 && <> · {probed} hosts sondados</>} na porta <span className="font-mono text-ink-muted">{chatPort}</span>
                      </span>
                    )}
                    <span className="text-xs">
                      Se esperava máquinas aqui, verifique se estão com o Toolkit aberto e com a porta {chatPort} liberada. Outras VLANs entram em Configurações → Redes da varredura.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-line">
                <div
                  role="region"
                  aria-label="Lista de usuários online e vistos recentemente"
                  tabIndex={0}
                  // ≈ 7 linhas visíveis (cabeçalho 64px + título de seção 44px + 7 × 49px); o resto rola.
                  className="max-h-[28.25rem] overflow-auto rounded-lg focus-ring"
                >
                  <table aria-label="Usuários online e vistos recentemente" className="w-max min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-surface-raised">
                      <tr className="border-b border-line bg-surface-raised text-left text-xs uppercase tracking-wide text-ink-faint">
                        <SortHeader label="Host" sortKey="hostname" />
                        <SortHeader label="Usuário" sortKey="username" />
                        <SortHeader label="IP" sortKey="ip" />
                        <SortHeader label="Ligado há" sortKey="uptime" />
                        <SortHeader label="Visto" sortKey="lastSeen" />
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Ação</th>
                      </tr>
                    </thead>
                    <OnlineUsersSection title="Conectados por IP" tone="online" users={manual} onCall={handleCall} callingIp={callingIp} onNotifyOk={setOk} onNotifyErr={setErr} />
                    <OnlineUsersSection title="Online" tone="online" users={online} onCall={handleCall} callingIp={callingIp} onNotifyOk={setOk} onNotifyErr={setErr} />
                    <OnlineUsersSection title="Vistos recentemente" tone="recent" users={recent} onCall={handleCall} callingIp={callingIp} onNotifyOk={setOk} onNotifyErr={setErr} />
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
