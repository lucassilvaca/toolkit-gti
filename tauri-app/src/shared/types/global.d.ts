// Globais injetadas pelo runtime do Tauri v2 no `window`.
export {};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
