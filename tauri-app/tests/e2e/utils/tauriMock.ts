import type { Page } from '@playwright/test';
import { dashboardInfo } from '../../../src/__tests__/fixtures/dashboard';

/**
 * Mock do IPC do Tauri para rodar o frontend no Vite (porta 1427) sem o
 * backend Rust. Substitui `window.__TAURI_INTERNALS__` antes do app carregar.
 *
 * - `responses`: resposta fixa por comando (sobrepõe os padrões).
 * - `errors`: comandos que rejeitam com `{ message, code }` (formato do ApiError).
 * - Comando sem resposta nem erro rejeita com `E2E_UNMOCKED`, como um backend
 *   que falhou — a UI precisa sobreviver a isso.
 * - `emitTauriEvent` dispara um evento para quem fez `listen()` (ex.: streaming).
 */

export const TEST_SESSION = {
  user: 'tecnico',
  authenticated_at: '2026-10-29T12:00:00Z',
  expires_in_minutes: 30,
};

export const VALID_PASSWORD = 'senha-certa';

export interface TauriMockOptions {
  currentUser?: string;
  loggedIn?: boolean;
  responses?: Record<string, unknown>;
  errors?: Record<string, { message: string; code: string }>;
}

export interface RecordedCall {
  cmd: string;
  args: Record<string, unknown>;
}

const {
  cpuUsage, memoryUsage, memoryUsedGb, memoryTotalGb, processCount, battery, uptime,
  ...staticInfo
} = dashboardInfo;

const DEFAULT_RESPONSES: Record<string, unknown> = {
  is_admin: true,
  get_static_info: staticInfo,
  get_dynamic_info: { cpuUsage, memoryUsage, memoryUsedGb, memoryTotalGb, processCount, battery, uptime },
  refresh_session: TEST_SESSION,
  logout: null,
  append_log_entry: null,
  get_runtime_alerts: [],
  'plugin:event|unlisten': null,
};

export async function mockTauri(page: Page, options: TauriMockOptions = {}): Promise<void> {
  await page.addInitScript(
    ({ session, password, currentUser, loggedIn, responses, errors }) => {
      const w = window as unknown as Record<string, unknown>;
      const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
      const callbacks = new Map<number, (payload: unknown) => void>();
      const listeners: Array<{ event: string; handler: number }> = [];
      let authenticated = loggedIn;
      let nextId = 1;

      const builtins: Record<string, (args: Record<string, unknown>) => unknown> = {
        get_current_user: () => currentUser,
        get_session: () => (authenticated ? session : null),
        login: (args) => {
          if (args.username === session.user && args.password === password) {
            authenticated = true;
            return session;
          }
          throw { message: 'Credenciais inválidas', code: 'INVALID_CREDENTIALS' };
        },
        logout: () => {
          authenticated = false;
          return null;
        },
        'plugin:event|listen': (args) => {
          listeners.push({ event: String(args.event), handler: Number(args.handler) });
          return nextId++;
        },
      };

      w.__E2E_CALLS__ = calls;
      w.__E2E_EMIT__ = (event: string, payload: unknown) => {
        for (const l of listeners.filter((x) => x.event === event)) {
          callbacks.get(l.handler)?.({ event, id: l.handler, payload });
        }
      };
      // `unlisten()` do @tauri-apps/api chama isto antes do IPC `plugin:event|unlisten`.
      w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: (_event: string, handler: number) => callbacks.delete(handler),
      };
      w.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: 'main' },
          currentWebview: { windowLabel: 'main', label: 'main' },
        },
        transformCallback: (cb: (payload: unknown) => void) => {
          const id = nextId++;
          callbacks.set(id, cb);
          return id;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        convertFileSrc: (path: string) => path,
        invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
          calls.push({ cmd, args });
          if (cmd in errors) throw errors[cmd];
          if (cmd in builtins) {
            const result = builtins[cmd](args);
            return cmd in responses && cmd !== 'login' ? responses[cmd] : result;
          }
          if (cmd in responses) return responses[cmd];
          throw { message: `sem mock para ${cmd}`, code: 'E2E_UNMOCKED' };
        },
      };
    },
    {
      session: TEST_SESSION,
      password: VALID_PASSWORD,
      currentUser: options.currentUser ?? TEST_SESSION.user,
      loggedIn: options.loggedIn ?? false,
      responses: { ...DEFAULT_RESPONSES, ...options.responses },
      errors: options.errors ?? {},
    },
  );
}

export async function recordedCalls(page: Page, cmd: string): Promise<RecordedCall[]> {
  return page.evaluate(
    (name) =>
      ((window as unknown as Record<string, unknown>).__E2E_CALLS__ as RecordedCall[]).filter(
        (c) => c.cmd === name,
      ),
    cmd,
  );
}

export async function emitTauriEvent(page: Page, event: string, payload: unknown): Promise<void> {
  await page.evaluate(
    ([name, data]) =>
      ((window as unknown as Record<string, unknown>).__E2E_EMIT__ as (e: string, p: unknown) => void)(
        name as string,
        data,
      ),
    [event, payload] as const,
  );
}
