import { describe, it, expect } from "vitest";
import {
  presenceFrame,
  clientIdentityFrame,
  typingFrame,
  receiptFrame,
  textFrame,
  fileFrame,
} from "../features/chat/services/chatFrames";
import {
  isLikelyEcho,
  validateOutgoingFile,
  shouldUseNativeSocket,
} from "../features/chat/services/chatProtocol";
import type { WsChatMessage } from "../shared/types/chat";

describe("chatFrames", () => {
  it("presenceFrame inclui role/presence/sender system", () => {
    expect(presenceFrame("user", "active", 123)).toEqual({
      sender: "system",
      msg_type: "presence",
      role: "user",
      presence: "active",
      timestamp: 123,
    });
  });

  it("clientIdentityFrame é sempre do role user", () => {
    expect(clientIdentityFrame("DOMAIN\\joao", 9)).toEqual({
      sender: "system",
      msg_type: "client_identity",
      role: "user",
      display_name: "DOMAIN\\joao",
      timestamp: 9,
    });
  });

  it("typingFrame carrega o estado start/stop", () => {
    expect(typingFrame("tech", "start", 1)).toMatchObject({ msg_type: "typing", state: "start", role: "tech" });
  });

  it("receiptFrame usa msg_id para um id e msg_ids para vários", () => {
    expect(receiptFrame("delivered", ["x"], 5)).toEqual({
      sender: "system",
      msg_type: "receipt",
      state: "delivered",
      timestamp: 5,
      msg_id: "x",
    });
    expect(receiptFrame("read", ["a", "b"], 7)).toEqual({
      sender: "system",
      msg_type: "receipt",
      state: "read",
      timestamp: 7,
      msg_ids: ["a", "b"],
    });
  });

  it("textFrame e fileFrame têm sender me e os campos do payload", () => {
    expect(textFrame("oi", 2, "id1")).toEqual({
      sender: "me",
      msg_type: "text",
      content: "oi",
      timestamp: 2,
      msg_id: "id1",
    });
    expect(fileFrame("a.png", "image/png", "BASE64", 3, "id2")).toEqual({
      sender: "me",
      msg_type: "file",
      filename: "a.png",
      mime_type: "image/png",
      file_data: "BASE64",
      timestamp: 3,
      msg_id: "id2",
    });
  });
});

describe("chatProtocol", () => {
  describe("validateOutgoingFile", () => {
    it("aceita arquivo comum", () => {
      expect(validateOutgoingFile("relatorio.pdf", "AAAA")).toEqual({ ok: true });
    });
    it("rejeita nome vazio", () => {
      expect(validateOutgoingFile("   ", "AAAA")).toMatchObject({ ok: false });
    });
    it("rejeita extensão perigosa", () => {
      const r = validateOutgoingFile("malware.exe", "AAAA");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(".exe");
    });
    it("rejeita arquivo grande demais", () => {
      // ~13MB em base64 → > 10MB binário
      const big = "a".repeat(14 * 1024 * 1024);
      expect(validateOutgoingFile("foto.png", big)).toMatchObject({ ok: false });
    });
  });

  describe("isLikelyEcho", () => {
    const mine: WsChatMessage = {
      id: "m1",
      sender: "me",
      type: "text",
      content: "ola",
      timestamp: 100,
    };
    it("detecta eco da própria mensagem de texto", () => {
      const json = { sender: "me", msg_type: "text", content: "ola" };
      expect(isLikelyEcho(json, [mine], 100)).toBe(true);
    });
    it("não marca eco quando o conteúdo difere", () => {
      const json = { sender: "me", msg_type: "text", content: "outro" };
      expect(isLikelyEcho(json, [mine], 100)).toBe(false);
    });
    it("não marca eco para mensagens do remoto", () => {
      const json = { sender: "remote", msg_type: "text", content: "ola" };
      expect(isLikelyEcho(json, [mine], 100)).toBe(false);
    });
  });

  it("shouldUseNativeSocket é false sem internals do Tauri", () => {
    expect(shouldUseNativeSocket()).toBe(false);
  });
});
