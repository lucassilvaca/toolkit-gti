import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({}) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { withSenderInfo } from "../features/chat/utils/senderInfo";
import { sessionTitle } from "../features/chat/hooks/useUserChatWindow";
import { DEFAULT_TITLE } from "../features/chat/utils/chatWindow";
import type { WsChatMessage } from "../shared/types/chat";

const msg = (id: string, sender: "me" | "remote"): WsChatMessage => ({
  id,
  sender,
  type: "text",
  content: id,
  timestamp: 1,
});

describe("withSenderInfo", () => {
  it("anota remoto como usuário e local como técnico, sem mutar a entrada", () => {
    const input = [msg("a", "remote"), msg("b", "me")];
    const out = withSenderInfo(input, {
      remoteName: "joao",
      remotePresence: "away",
      localPresence: "active",
    });
    expect(out[0].senderInfo).toEqual({ name: "joao", role: "user", presence: "away" });
    expect(out[1].senderInfo).toEqual({ name: "Você", role: "tech", presence: "active" });
    expect(input[0].senderInfo).toBeUndefined();
  });
});

describe("sessionTitle", () => {
  it("usa o nome do técnico ou o título padrão", () => {
    expect(sessionTitle({ roomId: "r", wsHost: "h", wsToken: "", adminName: "Ana" })).toBe(
      "Chat - Atendimento com Ana",
    );
    expect(sessionTitle(null)).toBe(DEFAULT_TITLE);
  });
});
