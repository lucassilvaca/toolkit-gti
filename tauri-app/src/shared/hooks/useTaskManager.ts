import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useTaskManager() {
  const openTaskManager = useCallback(async () => {
    try {
      await invoke("open_task_manager");
    } catch (err) {
      console.error("Failed to open Task Manager:", err);
    }
  }, []);

  return { openTaskManager };
}