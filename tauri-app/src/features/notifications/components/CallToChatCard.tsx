import { Bell, Wifi, Clock, Monitor, MessageSquare, History, Zap, X, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FormField, Input, PrimaryButton, StatusAlert, Textarea } from "../../../shared/components";
import { callUser } from "../../chat/services/callUser";
import type { GoToChat } from "../../chat/hooks/useChatSessions";
import { UserLookupPanel } from "../../presence/components/UserLookupPanel";
import { useUserLookup } from "../../presence/hooks/useUserLookup";
import { NetworkConfigService } from "../../settings/services/NetworkConfig";
import { useStatus } from "../../system/hooks/useStatus";
import { isUsableLocalIp } from "../../../shared/utils/localIp";
import { normalizeErrorMessage } from "../utils/callErrors";
import { clearRecents, loadRecents, pushRecent } from "../utils/recentHosts";

/** Mensagens prontas para os pedidos recorrentes do N1. */
const MESSAGE_TEMPLATES = [
  "Olá! Sou do suporte GTI. Posso te ajudar agora?",
  "Vou acessar para resolver seu chamado, tudo bem?",
  "Pode abrir o chat quando puder? Preciso te ajudar.",
];

export function CallToChatCard({ localIp, onGoToChat }: { localIp: string; onGoToChat: GoToChat }) {
  const [host, setHost] = useState("");
  const [message, setMessage] = useState("");
  const [duration, setDuration] = useState(30);
  const [chatPort, setChatPort] = useState<number>(NetworkConfigService.getDefaultPort());
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [showOptions, setShowOptions] = useState(false);
  const { status, setOk, setErr, setWarn, clear } = useStatus();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // "Esse usuário está online?" — busca pelo login antes de gastar um convite.
  const ipReady = isUsableLocalIp(localIp);
  const lookup = useUserLookup(localIp, chatPort, ipReady);

  useEffect(() => {
    NetworkConfigService.getChatPort()
      .then(setChatPort)
      .catch(() => setChatPort(NetworkConfigService.getDefaultPort()));

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCall = async () => {
    const target = host.trim();
    if (!target) return;
    if (!localIp || localIp === "...") {
      setErr("IP local ainda não está disponível. Aguarde a coleta das informações da rede.");
      return;
    }

    setLoading(true);
    clear();

    const result = await callUser({
      hostname: target,
      localIp,
      chatPort,
      message: message.trim() || undefined,
      duration,
    });
    setLoading(false);

    // Usuário já está em atendimento: o convite não foi exibido a ele.
    if (result.status === "busy") {
      setWarn(`${target} já está em atendimento. Aguarde o encerramento da conversa atual.`);
      return;
    }
    if (result.status === "error") {
      setErr(normalizeErrorMessage(result.message));
      return;
    }

    setRecents(pushRecent(target));
    setOk("Convite enviado! Abrindo chat...");
    timeoutRef.current = setTimeout(
      () => onGoToChat(result.roomId, result.wsUrl, target, { address: target, hostname: target }),
      800,
    );
  };

  const handleClearRecents = () => {
    clearRecents();
    setRecents([]);
  };

  return (
    <section aria-labelledby="call-chat-heading" className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface lg:col-span-2">
      <header className="flex items-center gap-3 border-b border-line px-4 py-4 sm:px-5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent-soft">
          <MessageSquare size={16} />
        </span>
        <h2 id="call-chat-heading" className="text-base font-semibold text-ink-strong">Chamar Usuário para Chat</h2>
      </header>
      <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-5">
        {/* Contexto: convite pela rede + seu endereço (antes ficava solto no rodapé). */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
          <span>Convite direto pela rede local</span>
          {localIp && localIp !== "..." && (
            <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 break-all rounded-full border border-line bg-surface-raised px-2.5 py-1 font-mono text-ink-muted">
              <Wifi size={12} className="shrink-0 text-accent-soft" aria-hidden />
              {localIp}
              <span className="opacity-30">·</span>
              {chatPort}
            </span>
          )}
        </div>

        {/* Antes de chamar: descobrir se a pessoa está online e em qual máquina. */}
        <UserLookupPanel
          name={lookup.name}
          onNameChange={lookup.setName}
          onSearch={() => void lookup.search()}
          onClear={lookup.clearSearch}
          loading={lookup.loading}
          progress={lookup.progress}
          error={lookup.error}
          summary={lookup.summary}
          matches={lookup.matches}
          onUse={(u) => setHost(u.ip)}
        />

        {/* Alvo — o input principal. */}
        <div className="space-y-2">
          <FormField label="IP ou Hostname do Usuário" icon={Monitor}>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCall()}
              placeholder="ex: 192.168.1.10 ou PC-USUARIO"
            />
          </FormField>

          {recents.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-ink-faint">
                <History className="h-3 w-3" aria-hidden /> Recentes
              </span>
              {recents.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setHost(r)}
                  className="focus-ring min-h-11 max-w-full break-all rounded-full border border-line bg-surface-raised px-3 py-1 font-mono text-xs text-ink transition-colors hover:border-accent-soft/40 hover:text-accent-soft"
                  title={`Usar ${r}`}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClearRecents}
                className="focus-ring ml-auto flex min-h-11 min-w-11 items-center justify-center rounded text-ink-faint transition-colors hover:text-ink"
                aria-label="Limpar hosts recentes"
                title="Limpar recentes"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </div>

        {/* Opcional (mensagem + duração) recolhido para não poluir. */}
        <div className="rounded-xl border border-line bg-surface-raised">
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            aria-expanded={showOptions}
            className="focus-ring flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-ink-muted transition hover:text-ink-strong"
          >
            <span className="flex items-center gap-1.5">
              <Zap size={14} className="text-accent-soft" aria-hidden /> Personalizar convite
            </span>
            <ChevronDown
              size={14}
              className={`transition-transform ${showOptions ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {showOptions && (
            <div className="flex flex-col gap-4 border-t border-line px-4 py-4 sm:px-5">
              <FormField
                label="Mensagem"
                icon={Bell}
                labelRight={<span className="text-xs text-ink-faint">{message.length}/300</span>}
              >
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 300))}
                  rows={3}
                  placeholder="Mensagem para o usuário (opcional)..."
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MESSAGE_TEMPLATES.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setMessage(t)}
                      className="focus-ring min-h-11 max-w-full truncate rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink transition-colors hover:border-accent-soft/40 hover:text-accent-soft"
                      title={t}
                    >
                      {t.length > 28 ? `${t.slice(0, 28)}…` : t}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField
                label="Duração do convite"
                icon={Clock}
                labelRight={(
                  <span className="rounded-md bg-surface-overlay px-2 py-0.5 text-xs font-semibold text-ink-strong">
                    {duration}s
                  </span>
                )}
              >
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="min-h-11 w-full accent-accent-soft"
                />
              </FormField>
            </div>
          )}
        </div>

        <StatusAlert status={status} />

        <PrimaryButton
          className="w-full justify-center"
          icon={MessageSquare}
          onClick={handleCall}
          disabled={loading || !host.trim()}
          loading={loading}
          loadingText="Enviando convite..."
        >
          Chamar para Chat
        </PrimaryButton>
      </div>
    </section>
  );
}
