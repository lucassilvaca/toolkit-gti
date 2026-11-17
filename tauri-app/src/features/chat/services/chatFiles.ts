import { invoke } from "@tauri-apps/api/core";

/** Grava um arquivo recebido no chat e devolve o caminho salvo. */
export function saveReceivedFile(fileName: string, fileData: string): Promise<string> {
  return invoke<string>("save_received_file", { fileName, fileData });
}
