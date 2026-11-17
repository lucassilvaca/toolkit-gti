/**
 * PortConfiguration Component
 *
 * Allows users to configure the TCP port used for chat communication.
 * Aligned with the shared design system (FormField, StatusAlert, PrimaryButton).
 */
import { useState, useEffect } from "react";
import { Check, AlertTriangle, Loader2, Plug, RotateCcw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { NetworkConfig } from "../../../shared/types/chat";
import { errorText } from "../../../shared/utils/errorText";
import { NetworkConfigService } from "../services/NetworkConfig";
import {
  Input,
  FormField,
  StatusAlert,
  PrimaryButton,
} from "../../../shared/components";

interface PortConfigurationProps {
  className?: string;
  onConfigSaved?: (newPort: number) => void;
}

export function PortConfiguration({
  className = "",
  onConfigSaved,
}: PortConfigurationProps) {
  const [config, setConfig] = useState<NetworkConfig | null>(null);
  const [newPort, setNewPort] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [portAvailable, setPortAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const parsedConfig = await NetworkConfigService.readConfig();
        setConfig(parsedConfig);
        setNewPort(parsedConfig.tcp_port.toString());
      } catch {
        setError("Erro ao carregar configuração");
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  useEffect(() => {
    const validatePort = async () => {
      const port = parseInt(newPort);

      if (!newPort || isNaN(port)) {
        setPortAvailable(null);
        return;
      }

      if (port < 1024 || port > 65535) {
        setPortAvailable(false);
        return;
      }

      if (config && port === config.tcp_port) {
        setPortAvailable(true);
        return;
      }

      setIsValidating(true);
      try {
        const available = await invoke<boolean>("is_port_available", { port });
        setPortAvailable(available);
      } catch {
        setPortAvailable(false);
      } finally {
        setIsValidating(false);
      }
    };

    const debounceTimer = setTimeout(validatePort, 500);
    return () => clearTimeout(debounceTimer);
  }, [newPort, config]);

  const handleSave = async () => {
    if (!config || saving) return;

    const port = parseInt(newPort);
    if (!portAvailable || port === config.tcp_port) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updatedConfig: NetworkConfig = {
        ...config,
        tcp_port: port,
        last_modified: new Date().toISOString(),
      };

      await invoke("write_network_config", {
        config: JSON.stringify(updatedConfig, null, 2),
      });

      setConfig(updatedConfig);
      setSuccess(`Porta alterada para ${port}. Será aplicada no próximo restart.`);
      onConfigSaved?.(port);
    } catch (err) {
      setError(
        errorText(err) || "Erro ao salvar configuração"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (config) {
      setNewPort(config.tcp_port.toString());
      setError(null);
      setSuccess(null);
    }
  };

  const isPortChanged = config && parseInt(newPort) !== config.tcp_port;
  const isPortValid = portAvailable === true;
  const canSave = Boolean(isPortChanged && isPortValid && !saving && !isValidating);

  if (loading) {
    return (
      <div className={`animate-pulse space-y-4 ${className}`}>
        <div className="h-24 rounded-2xl bg-surface-overlay/60" />
        <div className="h-12 rounded-xl bg-surface-overlay/60" />
        <div className="h-11 rounded-xl bg-surface-overlay/60" />
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Hero — porta ativa */}
      <div className="relative overflow-hidden rounded-2xl border border-accent/15 bg-surface-raised px-6 py-5 shadow-soft">
        <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-accent/15 blur-2xl" />
        <div className="relative flex items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Porta em uso
              </span>
            </div>
            <p className="text-xs leading-5 text-ink-muted">
              Canal interno de comunicação do chat
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-4xl font-semibold leading-none tracking-tight text-ink-strong">
              {config?.tcp_port}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-ink-faint">
              TCP
            </div>
          </div>
        </div>
      </div>

      {/* Form — alterar porta */}
      <div className="space-y-4">
        <FormField
          label="Alterar porta (1024–65535)"
          htmlFor="tcp-port"
          icon={Plug}
          labelRight={
            isValidating ? (
              <Loader2 size={13} className="animate-spin text-accent-soft" />
            ) : portAvailable === true && isPortChanged ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                <Check size={12} /> Disponível
              </span>
            ) : portAvailable === false ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-danger">
                <AlertTriangle size={12} /> Indisponível
              </span>
            ) : null
          }
        >
          <div className="relative">
            <Input
              id="tcp-port"
              type="number"
              min={1024}
              max={65535}
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              className="pr-10 font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              disabled={saving}
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5">
              {isValidating && (
                <Loader2 size={16} className="animate-spin text-accent-soft" />
              )}
              {!isValidating && portAvailable === true && isPortChanged && (
                <Check size={16} className="text-success" />
              )}
              {!isValidating && portAvailable === false && (
                <AlertTriangle size={16} className="text-danger" />
              )}
            </div>
          </div>
        </FormField>

        {portAvailable === false && (
          <p className="text-xs leading-5 text-danger">
            {parseInt(newPort) < 1024 || parseInt(newPort) > 65535
              ? "Porta deve estar entre 1024 e 65535."
              : "Porta não está disponível ou em uso."}
          </p>
        )}

        {error && <StatusAlert status={{ ok: false, msg: error }} />}
        {success && <StatusAlert status={{ ok: true, msg: success }} />}

        <div className="flex gap-3 pt-1">
          <PrimaryButton
            icon={Check}
            loading={saving}
            loadingText="Salvando..."
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1"
          >
            Aplicar na próxima sessão
          </PrimaryButton>

          {isPortChanged && (
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="btn-ghost text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Resetar
            </button>
          )}
        </div>

        <p className="text-xs leading-5 text-ink-muted">
          A alteração entra em vigor após reiniciar o aplicativo. Verifique se a
          porta está liberada no firewall do Windows.
        </p>
      </div>
    </div>
  );
}
