import { useState } from "react";
import { errorText } from "../../../shared/utils/errorText";

export interface Status {
  ok: boolean;
  msg: string;
  /** Aviso (amarelo): nem sucesso nem erro — ex.: usuário já em atendimento. */
  warn?: boolean;
}

export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  const setOk   = (msg: string)    => setStatus({ ok: true,  msg });
  const setErr  = (e: unknown)     => setStatus({ ok: false, msg: errorText(e) });
  const setWarn = (msg: string)    => setStatus({ ok: false, msg, warn: true });
  const clear   = ()               => setStatus(null);

  return { status, setOk, setErr, setWarn, clear } as const;
}
