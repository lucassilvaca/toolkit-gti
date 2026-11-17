// System Feature - Dashboard, tools and system information
export { useStatus } from './hooks/useStatus';
export { useSystemInfo } from './hooks/useSystemInfo';
export { SystemInfoProvider, useSharedSystemInfo } from './hooks/SystemInfoContext';
export { useTauriCommands } from './hooks/useTauriCommands';
export { DashboardView } from './views/DashboardView';
export { ToolsView } from './views/ToolsView';

// Tipo canônico de informação do sistema (mora em shared/types/system).
export type { SystemInfo } from '../../shared/types/system';
