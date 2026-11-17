import type { ReactNode } from "react";
import type { TimelineItem } from "../utils/timeline";
import { DateSeparator, UnreadSeparator } from "./TimelineSeparators";

export type MessageTimelineItem = Extract<TimelineItem, { kind: "message" }>;

interface ChatTimelineProps {
  timeline: TimelineItem[];
  /** Renderiza a mensagem; o elemento retornado deve usar `item.key` como key. */
  renderMessage: (item: MessageTimelineItem) => ReactNode;
}

/** Lista do chat com separadores de data e de não-lidas (técnico e usuário). */
export function ChatTimeline({ timeline, renderMessage }: ChatTimelineProps) {
  return (
    <>
      {timeline.map((item) =>
        item.kind === "date" ? (
          <DateSeparator key={item.key} label={item.label} />
        ) : item.kind === "unread" ? (
          <UnreadSeparator key={item.key} />
        ) : (
          renderMessage(item)
        ),
      )}
    </>
  );
}
