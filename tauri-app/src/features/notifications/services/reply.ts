import { invoke } from "@tauri-apps/api/core";

interface SendReplyInput {
  technicianHost: string;
  technicianIp?: string;
  wsPort?: number;
  replyMessage: string;
}

/** Devolve uma resposta ao técnico que enviou a notificação/convite. */
export function sendReply(input: SendReplyInput): Promise<{ method: string }> {
  return invoke<{ method: string }>("send_reply", { ...input });
}
