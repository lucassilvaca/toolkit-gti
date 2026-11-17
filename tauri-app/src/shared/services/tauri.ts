/**
 * Wrapper único para comandos Tauri (`invoke`).
 *
 * Padroniza o tratamento de erro: em vez de cada chamada repetir
 * try/catch + console.error, use `safeInvoke` e trate o `Result`.
 * Views nunca deveriam chamar `invoke` direto — só via hook/serviço.
 */
import { invoke } from "@tauri-apps/api/core";
import { errorText } from "../utils/errorText";

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Invoca um comando Tauri e nunca lança: retorna um `Result` discriminado.
 * Loga a falha de forma consistente (`[invoke:<cmd>]`).
 */
export async function safeInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<Result<T>> {
  try {
    const value = await invoke<T>(cmd, args);
    return { ok: true, value };
  } catch (error) {
    const message = errorText(error);
    console.error(`[invoke:${cmd}]`, message);
    return { ok: false, error: message };
  }
}

/**
 * Variante que lança em erro — para quem prefere try/catch local mas ainda
 * quer o log padronizado e a extração de mensagem.
 */
export async function invokeOrThrow<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const result = await safeInvoke<T>(cmd, args);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}
