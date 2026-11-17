import { invoke } from "@tauri-apps/api/core";
import { errorText } from "../../../shared/utils/errorText";

interface CommandResult {
  success: boolean;
  output: string;
  error?: string | null;
}

export interface PingResult {
  ok: boolean;
  /** Saída bruta do ping (para tooltip). */
  output: string;
  /** O backend recusou o comando (ex.: sessão expirada) — o ping nem rodou. */
  error?: string;
}

export interface RemoteResult {
  ok: boolean;
  message: string;
}

interface TauriCommandError {
  message?: unknown;
}

/** `errorText` quando há mensagem; senão um texto amigável (nunca JSON cru). */
function commandErrorMessage(error: unknown): string {
  if (typeof error === "string" || error instanceof Error) return errorText(error);
  if (typeof error === "object" && error !== null) {
    const message = (error as TauriCommandError).message;
    if (typeof message === "string" && message.trim()) return errorText(error);
  }
  return "Não foi possível iniciar o acesso remoto";
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost" || normalized === "::1" || normalized.startsWith("127.");
}

/** Ping (`ping -n 4`) ao IP. Nunca lança. */
export async function pingHost(ip: string): Promise<PingResult> {
  try {
    const r = await invoke<CommandResult>("run_ping", { target: ip });
    return { ok: r.success, output: r.output || r.error || "" };
  } catch (e) {
    return { ok: false, output: "", error: errorText(e) };
  }
}

/** Oferece Assistência Remota (`msra /offerra {ip}`). Nunca lança. */
export async function openRemoteAssistance(ip: string): Promise<RemoteResult> {
  if (isLoopbackHost(ip)) {
    return {
      ok: false,
      message: "Acesso remoto requer o IP ou host da máquina atendida. 'localhost' é este computador.",
    };
  }

  try {
    const r = await invoke<CommandResult>("run_tool_with_target", { task: "rdp", target: ip });
    return { ok: r.success, message: r.output || "Abrindo assistência remota..." };
  } catch (e) {
    return { ok: false, message: commandErrorMessage(e) };
  }
}

/** Copia texto para o clipboard. Fallback silencioso — nunca lança. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
