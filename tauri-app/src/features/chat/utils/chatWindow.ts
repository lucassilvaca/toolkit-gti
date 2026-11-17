import type { WsPresenceState } from "../../../shared/types/chat";

export const DEFAULT_TITLE = "Chat - Suporte Técnico GTI";

export interface RoomParams {
  roomId: string;
  wsHost: string;
  wsToken: string;
  adminName: string;
}

/** Lê os parâmetros da sala da query string da janela do usuário. */
export function getRoomFromUrl(): RoomParams | null {
  const p = new URLSearchParams(window.location.search);
  const roomId = p.get("room");
  const wsHost = p.get("host");
  const wsToken = p.get("token") ?? "";
  const adminName = p.get("name") ?? "Técnico GTI";
  if (!roomId || !wsHost) return null;
  return { roomId, wsHost, wsToken, adminName };
}

/** Cor do "dot" e rótulo de status do técnico para a janela do usuário. */
export function getTechnicianStatus(
  presence: WsPresenceState,
  connected: boolean,
): { dotClass: string; label: string } {
  if (!connected) {
    return { dotClass: "bg-warning", label: "Conectando..." };
  }
  if (presence === "offline") {
    return { dotClass: "bg-danger", label: "Offline" };
  }
  if (presence === "away") {
    return { dotClass: "bg-warning", label: "Ausente" };
  }
  return { dotClass: "bg-success", label: "Online" };
}

/** Dois bipes curtos (estilo "tarefa concluída"), sem depender de arquivo. */
export function playMessageArrivalChime() {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    void ctx.resume().catch(() => {});

    const beep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const t0 = ctx.currentTime + start;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.1, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.start(t0);
      osc.stop(t0 + duration + 0.04);
    };

    beep(523.25, 0, 0.11);
    beep(659.25, 0.13, 0.14);
  } catch {
    /* política de áudio / webview */
  }
}
