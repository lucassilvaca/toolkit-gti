import { describe, it, expect } from "vitest";
import { buildChatTimeline } from "../features/chat/utils/timeline";
import { isSameDay, formatDateSeparator } from "../shared/utils/datetime";
import type { WsChatMessage } from "../shared/types/chat";

function textMsg(
  id: string,
  sender: "me" | "remote",
  timestamp: number,
): WsChatMessage {
  return { id, sender, type: "text", content: id, timestamp };
}

const DAY = 24 * 60 * 60 * 1000;

describe("datetime helpers", () => {
  it("isSameDay true para o mesmo dia, falso para dias diferentes", () => {
    const a = new Date(2026, 5, 28, 9, 0, 0).getTime();
    const b = new Date(2026, 5, 28, 23, 59, 0).getTime();
    const c = new Date(2026, 5, 29, 0, 1, 0).getTime();
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });

  it("formatDateSeparator rotula Hoje e Ontem", () => {
    const now = Date.now();
    expect(formatDateSeparator(now)).toBe("Hoje");
    expect(formatDateSeparator(now - DAY)).toBe("Ontem");
  });

  it("formatDateSeparator usa data completa para datas antigas", () => {
    const old = new Date(2024, 0, 15).getTime();
    expect(formatDateSeparator(old)).toMatch(/2024/);
  });
});

describe("buildChatTimeline", () => {
  it("insere um separador de data antes da primeira mensagem", () => {
    const t = new Date(2026, 5, 28, 10, 0, 0).getTime();
    const items = buildChatTimeline([textMsg("a", "me", t)], null);
    expect(items[0]).toMatchObject({ kind: "date" });
    expect(items[1]).toMatchObject({ kind: "message", key: "a" });
  });

  it("não repete o separador para mensagens do mesmo dia", () => {
    const t = new Date(2026, 5, 28, 10, 0, 0).getTime();
    const items = buildChatTimeline(
      [textMsg("a", "me", t), textMsg("b", "remote", t + 60_000)],
      null,
    );
    expect(items.filter((i) => i.kind === "date")).toHaveLength(1);
  });

  it("insere novo separador quando o dia muda", () => {
    const d1 = new Date(2026, 5, 28, 23, 0, 0).getTime();
    const d2 = new Date(2026, 5, 29, 1, 0, 0).getTime();
    const items = buildChatTimeline(
      [textMsg("a", "me", d1), textMsg("b", "remote", d2)],
      null,
    );
    expect(items.filter((i) => i.kind === "date")).toHaveLength(2);
  });

  it("insere o divisor de não-lidas antes do id indicado", () => {
    const t = new Date(2026, 5, 28, 10, 0, 0).getTime();
    const items = buildChatTimeline(
      [textMsg("a", "me", t), textMsg("b", "remote", t + 60_000)],
      "b",
    );
    const idxUnread = items.findIndex((i) => i.kind === "unread");
    const idxB = items.findIndex((i) => i.kind === "message" && i.key === "b");
    expect(idxUnread).toBeGreaterThanOrEqual(0);
    expect(idxUnread).toBe(idxB - 1);
  });

  it("ignora separador de data para timestamp inválido (0)", () => {
    const items = buildChatTimeline([textMsg("a", "remote", 0)], null);
    expect(items.filter((i) => i.kind === "date")).toHaveLength(0);
    expect(items).toHaveLength(1);
  });
});
