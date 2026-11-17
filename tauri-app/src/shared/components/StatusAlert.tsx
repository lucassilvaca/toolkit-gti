interface Props {
  status: { ok: boolean; msg: string; warn?: boolean } | null;
}

export function StatusAlert({ status }: Props) {
  if (!status) return null;
  const tone = status.warn
    ? "border-warning/28 bg-warning/10 text-warning"
    : status.ok
      ? "border-success/25 bg-success/10 text-success"
      : "border-danger/28 bg-danger/10 text-danger";
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${tone}`}>
      <span>{status.warn ? "!" : status.ok ? "✓" : "✗"}</span>
      {status.msg}
    </div>
  );
}
