/** Helpers de data/hora compartilhados. */

/**
 * Formata um horário no padrão do chat: "HH:MM" em pt-BR.
 * Sem argumento, usa o horário atual.
 */
export function formatChatTime(ts: string | number | Date = new Date()): string {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Verdadeiro se os dois instantes caem no mesmo dia do calendário (local). */
export function isSameDay(a: string | number | Date, b: string | number | Date): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

/**
 * Rótulo de separador de data no chat: "Hoje", "Ontem" ou
 * "DD de mês de AAAA" (pt-BR).
 */
export function formatDateSeparator(ts: string | number | Date): string {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(d, now)) return "Hoje";
  if (isSameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
