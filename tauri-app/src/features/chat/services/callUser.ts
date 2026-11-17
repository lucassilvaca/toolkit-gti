import { invoke } from "@tauri-apps/api/core";
import { errorText } from "../../../shared/utils/errorText";

/**
 * Resultado de chamar um usuário para o chat.
 * - `opened`: convite entregue, sessão pronta para abrir (roomId + wsUrl)
 * - `busy`:   usuário já está em atendimento (convite não exibido a ele)
 * - `error`:  falha de rede/entrega
 */
export type CallUserResult =
  | { status: "opened"; roomId: string; wsUrl: string }
  | { status: "busy" }
  | { status: "error"; message: string };

interface CallUserOptions {
  /** IP ou hostname do usuário a ser chamado. */
  hostname: string;
  /** IP local do técnico (vai no convite para o app do usuário conectar de volta). */
  localIp: string;
  chatPort: number;
  message?: string;
  duration?: number;
}

/**
 * Fluxo único de "chamar usuário para o chat": cria a sala, envia o convite e
 * traduz o resultado (aberto / ocupado / erro). Fonte única usada tanto pela
 * aba "Chamar Usuário" quanto pela tabela de "Usuários Online" — evita divergir
 * a construção do wsUrl e o tratamento de "ocupado".
 */
export async function callUser({
  hostname,
  localIp,
  chatPort,
  message,
  duration = 30,
}: CallUserOptions): Promise<CallUserResult> {
  try {
    const room = await invoke<{ room_id: string; token: string }>("create_chat_room");
    const invite = await invoke<{ busy: boolean }>("send_chat_invite", {
      hostname,
      adminIp: localIp,
      message,
      duration,
      roomId: room.room_id,
      roomToken: room.token,
      wsPort: chatPort,
    });

    if (invite?.busy) return { status: "busy" };

    const wsUrl = `ws://localhost:${chatPort}/chat/${room.room_id}?token=${room.token}`;
    return { status: "opened", roomId: room.room_id, wsUrl };
  } catch (e) {
    return { status: "error", message: errorText(e) };
  }
}
