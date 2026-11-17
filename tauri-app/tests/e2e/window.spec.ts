import { test, expect } from '@playwright/test';
import { mockTauri, recordedCalls } from './utils/tauriMock';

/**
 * Janela principal: botão maximizar/restaurar e layout no tamanho mínimo
 * (1024x640, definido em tauri.conf.json e em bootstrap/wiring.rs).
 */

test.describe('Janela principal', () => {
  test('botão maximizar chama toggle_maximize', async ({ page }) => {
    await mockTauri(page, { loggedIn: true });
    await page.goto('/');

    const maximize = page.getByRole('button', { name: 'Maximizar janela' });
    await expect(maximize).toBeVisible();
    await maximize.click();

    await expect
      .poll(async () => (await recordedCalls(page, 'plugin:window|toggle_maximize')).length)
      .toBe(1);
  });

  test('no tamanho mínimo o conteúdo cabe sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 640 });
    await mockTauri(page, { loggedIn: true });
    await page.goto('/');

    await expect(page.getByTestId('app-container')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
