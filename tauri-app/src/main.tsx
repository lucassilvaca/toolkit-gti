import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./app/App";
import { UserChatView } from "./features/chat/views/UserChatView";
import { LogProvider } from "./features/history/hooks/useLogHistory";
import { ErrorBoundary } from "./shared/components";
import "./styles/globals.css";

const rootElement = document.getElementById("root") as HTMLElement;

// Guard: if this index.html is loaded inside the "user-chat" window, render the
// standalone chat component — no auth, no admin tooling, completely isolated.
if (getCurrentWindow().label === "user-chat") {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary label="Chat">
        <UserChatView />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <LogProvider>
          <App />
        </LogProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
