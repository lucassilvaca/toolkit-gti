import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "popup-notification": resolve(__dirname, "popup-notification.html"),
        "popup-reply": resolve(__dirname, "popup-reply.html"),
        "chat-invite": resolve(__dirname, "chat-invite.html"),
        "user-chat": resolve(__dirname, "user-chat.html"),
      },
    },
  },
  server: {
    port: 1427,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
