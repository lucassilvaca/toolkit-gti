/**
 * Detecta se o código está rodando dentro do webview do Tauri.
 *
 * Em runtime Tauri v2 a global `__TAURI_INTERNALS__` (e/ou `isTauri`)
 * é injetada no `window`. Em um navegador comum (ex.: `vite dev` aberto
 * no Chrome) essas globals não existem, então as ações de janela
 * (minimizar/fechar) devem ser ignoradas silenciosamente.
 */
export function isTauriWebview(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    isTauri?: boolean;
  };

  return (
    typeof w.__TAURI_INTERNALS__ !== "undefined" ||
    typeof w.__TAURI__ !== "undefined" ||
    w.isTauri === true
  );
}
