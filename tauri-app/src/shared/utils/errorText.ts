/**
 * Texto legível de um erro vindo do `invoke` do Tauri. O backend rejeita com o
 * `ApiError` serializado ({ message, code, details }), não com `Error` — então
 * `String(err)` viraria "[object Object]".
 */
export function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [e.message, e.details, e.code].filter(
      (p): p is string => typeof p === "string" && p.length > 0,
    );
    if (parts.length) return parts.join(" · ");
    return JSON.stringify(err);
  }
  return String(err);
}
