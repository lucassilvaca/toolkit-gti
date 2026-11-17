import { test, expect } from '@playwright/test';
import { LoginPage } from './utils/LoginPage';
import { DashboardPage } from './utils/DashboardPage';
import { mockTauri, recordedCalls } from './utils/tauriMock';
import { TEST_SESSION, VALID_PASSWORD } from './fixtures/test-data';

/** Smoke de autenticação contra o Vite com o IPC do Tauri mockado. */

test.describe('Login', () => {
  test('conta detectada com domínio: envia só o usuário e abre o painel', async ({ page }) => {
    const login = new LoginPage(page);
    await mockTauri(page, { currentUser: `EMPRESA\\${TEST_SESSION.user}` });
    await page.goto('/');

    await expect(login.detectedAccount).toHaveText(`Conta Windows · EMPRESA\\${TEST_SESSION.user}`);
    await login.login(VALID_PASSWORD);

    await expect(new DashboardPage(page).container).toBeVisible();
    expect((await recordedCalls(page, 'login')).map((c) => c.args)).toEqual([
      { username: TEST_SESSION.user, password: VALID_PASSWORD },
    ]);
  });

  test('senha errada mostra erro e continua na tela de login', async ({ page }) => {
    const login = new LoginPage(page);
    await mockTauri(page);
    await page.goto('/');

    await login.login('errada');

    await expect(login.errorMessage('Senha incorreta. Tente novamente.')).toBeVisible();
    await expect(login.passwordInput).toBeEmpty();
    await expect(new DashboardPage(page).container).toHaveCount(0);
  });

  test('sem conta detectada: digita usuário manualmente', async ({ page }) => {
    const login = new LoginPage(page);
    await mockTauri(page, { currentUser: '' });
    await page.goto('/');

    await expect(login.loginButton).toBeDisabled();
    await login.login(VALID_PASSWORD, TEST_SESSION.user);

    await expect(new DashboardPage(page).container).toBeVisible();
  });

  test('bloqueio por excesso de tentativas aparece para o técnico', async ({ page }) => {
    const login = new LoginPage(page);
    await mockTauri(page, {
      errors: { login: { message: 'Muitas tentativas. Tente novamente em 15 minutos', code: 'RATE_LIMITED' } },
    });
    await page.goto('/');

    await login.login(VALID_PASSWORD);

    await expect(login.errorMessage(/Erro na autenticação: Muitas tentativas. Tente novamente em 15 minutos/)).toBeVisible();
    await expect(login.errorMessage('Senha incorreta. Tente novamente.')).toHaveCount(0);
    await expect(new DashboardPage(page).container).toHaveCount(0);
  });
});
