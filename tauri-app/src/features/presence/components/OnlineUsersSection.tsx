import type { OnlineUser } from "../types";
import { OnlineUserRow } from "./OnlineUserRow";

const COLSPAN = 6;

export function OnlineUsersSection({
  title, tone, users, onCall, callingIp, onNotifyOk, onNotifyErr,
}: {
  title: string;
  tone: "online" | "recent";
  users: OnlineUser[];
  onCall: (u: OnlineUser) => void;
  callingIp: string | null;
  onNotifyOk: (msg: string) => void;
  onNotifyErr: (msg: string) => void;
}) {
  if (users.length === 0) return null;
  const dot = tone === "online" ? "bg-success" : "bg-ink-faint";

  return (
    <tbody>
      <tr>
        <td colSpan={COLSPAN} className="px-4 pb-1.5 pt-4">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {title} ({users.length})
          </span>
        </td>
      </tr>
      {users.map((u) => (
        <OnlineUserRow
          key={u.ip}
          user={u}
          onCall={onCall}
          calling={callingIp === u.ip}
          onNotifyOk={onNotifyOk}
          onNotifyErr={onNotifyErr}
        />
      ))}
    </tbody>
  );
}
