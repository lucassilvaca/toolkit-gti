import { invoke } from "@tauri-apps/api/core";

/** Login Windows da máquina (bruto, sem trim). Lança se o comando falhar. */
export function getCurrentUser(): Promise<string> {
  return invoke<string>("get_current_user");
}
