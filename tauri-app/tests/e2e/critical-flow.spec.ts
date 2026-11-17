import { test, expect } from '@playwright/test';
import { LoginPage } from './utils/LoginPage';
import { DashboardPage } from './utils/DashboardPage';
import { ChatPage } from './utils/ChatPage';
import { emitTauriEvent, mockTauri, recordedCalls } from './utils/tauriMock';
import { TABS, VALID_PASSWORD } from './fixtures/test-data';

/**
 * Jornada principal do técnico: login → painel → todas as abas → logout.
 * IPC do Tauri mockado (utils/tauriMock.ts); comandos sem mock rejeitam,
 * então cada aba também prova que sobrevive a backend indisponível.
 */

test.describe('Fluxo crítico do técnico', () => {
  test('login → resumo → todas as abas → logout', async ({ page }) => {
    const login = new LoginPage(page);
    const shell = new DashboardPage(page);
    const chat = new ChatPage(page);
    await mockTauri(page);
    await page.goto('/');

    await test.step('login com a conta detectada do Windows', async () => {
      await expect(login.detectedAccount).toBeVisible();
      await login.login(VALID_PASSWORD);
      await expect(shell.container).toBeVisible();
    });

    await test.step('resumo mostra dados da estação', async () => {
      await expect(shell.pageHeading(/resumo do sistema/i)).toBeVisible();
      await expect(shell.main.getByRole('heading', { name: 'ESTACAO-SUPORTE-01' })).toBeVisible();
      await expect(shell.main.getByRole('region', { name: 'Pontos de atenção' })).toContainText('Firewall inativo');
    });

    await test.step('cada aba da sidebar abre a própria tela', async () => {
      for (const tab of TABS.filter((t) => t.id !== 'dashboard')) {
        await shell.openTab(tab.navLabel);
        await expect(shell.pageHeading(tab.title), `aba ${tab.id}`).toBeVisible();
      }
    });

    await test.step('chat sem atendimento aponta para onde iniciar', async () => {
      await shell.openTab('Chat');
      await expect(chat.emptyState).toBeVisible();
      await expect(chat.emptyHint).toBeVisible();
    });

    await test.step('configurações mostram a versão real do app', async () => {
      await shell.openTab('Configurações');
      const { version } = (await import('../../package.json', { with: { type: 'json' } })).default;
      await expect(shell.main.getByText(version, { exact: true })).toBeVisible();
    });

    await test.step('sair volta para o login e encerra a sessão no backend', async () => {
      await shell.logoutButton.click();
      await expect(login.passwordInput).toBeVisible();
      await expect(login.passwordInput).toBeEmpty();
      await expect(shell.container).toHaveCount(0);
      expect(await recordedCalls(page, 'logout')).toHaveLength(1);
    });
  });

  test('sessão existente no backend pula o login', async ({ page }) => {
    const shell = new DashboardPage(page);
    await mockTauri(page, { loggedIn: true });
    await page.goto('/');

    await expect(shell.container).toBeVisible();
    expect(await recordedCalls(page, 'login')).toHaveLength(0);
  });

  test('máquina sem privilégio de administrador não mostra o login', async ({ page }) => {
    await mockTauri(page, { responses: { is_admin: false } });
    await page.goto('/');

    await expect(new LoginPage(page).passwordInput).toHaveCount(0);
    await expect(page.getByTestId('app-container')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Área restrita à equipe GTI' })).toBeVisible();
  });

  test('sem privilégio, "Abrir como administrador" pede elevação e mostra o cancelamento', async ({ page }) => {
    await mockTauri(page, {
      responses: { is_admin: false },
      errors: {
        relaunch_as_admin: {
          message: 'Permissão negada',
          code: 'PERMISSION_DENIED',
        },
      },
    });
    await page.goto('/');

    await page.getByRole('button', { name: 'Abrir como administrador' }).click();

    await expect(page.getByText('Permissão negada')).toBeVisible();
    expect(await recordedCalls(page, 'relaunch_as_admin')).toHaveLength(1);
  });

  test('falha ao ler dados da estação não derruba o resumo', async ({ page }) => {
    const shell = new DashboardPage(page);
    await mockTauri(page, {
      loggedIn: true,
      errors: {
        get_static_info: { message: 'Falha ao consultar WMI', code: 'SYSTEM_ERROR' },
        get_dynamic_info: { message: 'Falha ao consultar WMI', code: 'SYSTEM_ERROR' },
      },
    });
    await page.goto('/');

    await expect(shell.pageHeading(/resumo do sistema/i)).toBeVisible();
    await expect(page.getByText('Algo deu errado')).toHaveCount(0);
  });

  test('barra mobile navega entre as abas', async ({ page }) => {
    const shell = new DashboardPage(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await mockTauri(page, { loggedIn: true });
    await page.goto('/');

    await expect(shell.sidebarNav).toBeHidden();
    const tools = TABS.find((t) => t.id === 'tools')!;
    await shell.openMobileTab(tools.title);
    await expect(shell.pageHeading(tools.title)).toBeVisible();
  });
});

test('alerta do startup (firewall) aparece mesmo emitido antes da tela abrir', async ({ page }) => {
  await mockTauri(page, {
    loggedIn: true,
    responses: {
      get_runtime_alerts: [{ kind: 'firewall-error', message: 'Falha ao criar regra: Acesso negado.' }],
    },
  });
  await page.goto('/');

  const banner = page.getByRole('alert').filter({ hasText: 'Firewall não liberado para o chat' });
  await expect(banner).toContainText('Falha ao criar regra: Acesso negado.');

  // Backend avisa que resolveu (regra criada): o banner some.
  await emitTauriEvent(page, 'runtime-alert', { kind: 'firewall-error', message: '' });
  await expect(banner).toHaveCount(0);

  // Novo alerta em tempo real (porta do chat em uso).
  await emitTauriEvent(page, 'runtime-alert', {
    kind: 'ws-server-error',
    message: 'Falha ao iniciar servidor WS na porta 7890.',
  });
  await expect(page.getByRole('alert').filter({ hasText: 'Chat indisponível' })).toBeVisible();
});
