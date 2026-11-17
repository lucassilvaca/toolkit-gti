import { useCallback, useEffect, useState, lazy, Suspense, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";

import { Sidebar, WindowTopbar, ErrorBoundary, DotsLoader } from "../shared/components";
import { invoke } from "@tauri-apps/api/core";
import { useAppEvents, type RuntimeAlert } from "../shared/hooks";

import { LoginView, useAuth } from "../features/auth";
import { useChatSessions } from "../features/chat/hooks/useChatSessions";
import type { GoToChat } from "../features/chat/hooks/useChatSessions";
import { DashboardView, useSystemInfo, SystemInfoProvider } from "../features/system";

import { TABS } from "../shared/config/tabs";
import type { TabType } from "../shared/types/types";

import { BootScreen } from "./components/BootScreen";
import { RuntimeAlertBanner } from "./components/RuntimeAlertBanner";
import { MobileTabBar } from "./components/MobileTabBar";
import { RequiresAdminView } from "./components/RequiresAdminView";

// Views não-iniciais carregadas sob demanda (code-splitting): reduz o JS
// avaliado no boot. DashboardView fica eager por ser a aba padrão.
const ChatWorkspace = lazy(() =>
  import("../features/chat/views/ChatWorkspace").then((m) => ({ default: m.ChatWorkspace })),
);
const SettingsView = lazy(() => import("../features/settings").then((m) => ({ default: m.SettingsView })));
const OnlineUsersView = lazy(() =>
  import("../features/presence/views/OnlineUsersView").then((m) => ({ default: m.OnlineUsersView })),
);
const ToolsView = lazy(() => import("../features/system").then((m) => ({ default: m.ToolsView })));
const BrowsersView = lazy(() => import("../features/browser").then((m) => ({ default: m.BrowsersView })));
const HistoryView = lazy(() => import("../features/history").then((m) => ({ default: m.HistoryView })));
const NotificationsView = lazy(() => import("../features/notifications").then((m) => ({ default: m.NotificationsView })));

function ViewFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <DotsLoader className="text-lg" label="Carregando" />
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [isTrayMode, setIsTrayMode] = useState(false);
  // Alertas do runtime por tipo (chat, firewall, named pipe).
  const [alerts, setAlerts] = useState<Record<string, string>>({});

  const { authenticated, login, logout } = useAuth({ enabled: !isTrayMode });
  const systemInfoState = useSystemInfo({
    enabled: !isTrayMode && authenticated,
  });
  const { systemInfo, isAdmin } = systemInfoState;
  const chatManager = useChatSessions();

  const handleLock = useCallback(() => {
    setIsTrayMode(true);
    void logout();
  }, [logout]);

  const handleUnlock = useCallback(() => {
    setIsTrayMode(false);
  }, []);

  const { closeAll: closeAllChats, setChatTabOpen } = chatManager;
  useEffect(() => {
    if (!authenticated) {
      closeAllChats();
      setChatTabOpen(false);
    }
  }, [authenticated, closeAllChats, setChatTabOpen]);

  const goToChat: GoToChat = (roomId, wsUrl, label, target) => {
    chatManager.openSession(roomId, wsUrl, label, target);
    setActiveTab("chat");
    chatManager.setChatTabOpen(true);
  };

  const handleRuntimeAlert = useCallback(({ kind, message }: RuntimeAlert) => {
    setAlerts((prev) => {
      const next = { ...prev };
      if (message) next[kind] = message;
      else delete next[kind];
      return next;
    });
  }, []);

  // Os alertas costumam sair no startup, antes deste listen existir: busca os
  // que já estão ativos no backend.
  useEffect(() => {
    invoke<RuntimeAlert[]>("get_runtime_alerts")
      .then((list) => list.forEach(handleRuntimeAlert))
      .catch((e: unknown) => console.error("get_runtime_alerts:", e));
  }, [handleRuntimeAlert]);

  const dismissAlert = useCallback((kind: string) => {
    setAlerts(({ [kind]: _dismissed, ...rest }) => rest);
  }, []);

  useAppEvents({
    onLock: handleLock,
    onUnlock: handleUnlock,
    onRuntimeAlert: handleRuntimeAlert,
  });

  if (isTrayMode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-base px-6 text-center text-ink">
        <p className="text-sm text-ink-muted">Modo bandeja ativo — restaure a janela pelo ícone na bandeja.</p>
      </div>
    );
  }

  if (isAdmin === null) {
    return <BootScreen />;
  }

  if (!isAdmin) {
    return <RequiresAdminView />;
  }

  if (!authenticated) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-base">
        <WindowTopbar subtitle="Autenticação" />
        <div className="min-h-0 flex-1">
          <LoginView onAuthenticated={login} />
        </div>
      </div>
    );
  }

  const currentTab = TABS.find((t) => t.id === activeTab) || TABS[0];

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    chatManager.setChatTabOpen(tab === "chat");
  };

  // "chat" é renderizado por uma camada persistente (fora do swap de abas)
  // para manter os sockets vivos ao navegar entre abas — ver abaixo.
  const views: Record<Exclude<TabType, "chat">, ReactNode> = {
    dashboard: <DashboardView />,
    tools: <ToolsView />,
    browsers: <BrowsersView />,
    history: <HistoryView />,
    notifications: <NotificationsView onGoToChat={goToChat} />,
    online: <OnlineUsersView onGoToChat={goToChat} />,
    settings: <SettingsView />,
  };

  return (
    <SystemInfoProvider value={systemInfoState}>
    <motion.div
      data-testid="app-container"
      initial={false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex h-screen flex-col overflow-hidden bg-base"
    >
      <WindowTopbar />

      {Object.entries(alerts).map(([kind, message]) => (
        <RuntimeAlertBanner key={kind} kind={kind} message={message} onDismiss={() => dismissAlert(kind)} />
      ))}

      <div className="flex min-h-0 flex-1 overflow-hidden pb-16 md:pb-0">
        <Sidebar
          systemInfo={systemInfo}
          activeTab={activeTab}
          unreadChat={chatManager.totalUnread}
          isAdmin={isAdmin}
          onTabChange={handleTabChange}
          onLogout={logout}
        />

        <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden bg-base">
          <div
            className={`relative z-10 flex min-h-0 flex-1 flex-col px-8 pb-6 pt-7 ${
              activeTab === "chat" ? "overflow-hidden" : "overflow-y-auto"
            }`}
          >
            {activeTab !== "dashboard" ? (
              <div className="mb-6 flex shrink-0 flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="font-display text-[2.6rem] font-normal leading-[1.05] text-ink-strong">
                    {currentTab.title}
                  </h1>
                  <p className="mt-1.5 text-sm text-ink-muted">{currentTab.subtitle}</p>
                </div>
                <div className="rounded-full bg-surface px-4 py-2 text-xs text-ink-muted shadow-soft">
                  <span className="font-semibold text-ink-strong">{systemInfo?.hostname || "-"}</span>
                  <span className="px-1.5 opacity-40">·</span>
                  <span>{systemInfo?.username || "-"}</span>
                </div>
              </div>
            ) : null}

            {/*
              Chat: camada PERSISTENTE, montada assim que há uma conversa (ou a
              aba está aberta) e mantida ao trocar de aba — só escondida via CSS.
              Isso preserva os sockets vivos em segundo plano, para que mensagens
              de outras conversas incrementem o badge e disparem notificação
              mesmo com o técnico em outra aba.
            */}
            {(chatManager.sessions.length > 0 || activeTab === "chat") && (
              <div className={activeTab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                <ErrorBoundary label="Chat" compact>
                  <Suspense fallback={<ViewFallback />}>
                    <ChatWorkspace manager={chatManager} />
                  </Suspense>
                </ErrorBoundary>
              </div>
            )}

            {activeTab !== "chat" && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  <ErrorBoundary key={activeTab} label={currentTab.title} compact>
                    <Suspense fallback={<ViewFallback />}>
                      {views[activeTab]}
                    </Suspense>
                  </ErrorBoundary>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </main>
      </div>

      <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </motion.div>
    </SystemInfoProvider>
  );
}
