// Shared Hooks - Cross-cutting application hooks

// App-wide event management
export { useAppEvents } from "./useAppEvents";
export type { UseAppEventsOptions, ChatInvitePayload, RuntimeAlert } from "./useAppEvents";

// System utilities
export { useTaskManager } from "./useTaskManager";
