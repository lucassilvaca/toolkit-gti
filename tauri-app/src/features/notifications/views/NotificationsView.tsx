import { PageShell } from "../../../shared/components";
import type { GoToChat } from "../../chat/hooks/useChatSessions";
import { useSharedSystemInfo } from "../../system/hooks/SystemInfoContext";
import { CallToChatCard } from "../components/CallToChatCard";
import { RemoteAssistanceCard } from "../components/RemoteAssistanceCard";

interface NotificationsViewProps {
  onGoToChat: GoToChat;
}

export function NotificationsView({ onGoToChat }: NotificationsViewProps) {
  const { systemInfo } = useSharedSystemInfo();

  return (
    <PageShell variant="singleColumn" maxWidthClassName="w-full">
      <div className="grid min-w-0 grid-cols-1 auto-rows-auto gap-4 pb-8 lg:grid-cols-3">
        <CallToChatCard localIp={systemInfo.localIp} onGoToChat={onGoToChat} />
        <RemoteAssistanceCard />
      </div>
    </PageShell>
  );
}
