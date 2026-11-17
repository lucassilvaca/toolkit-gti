import type { Page, Locator } from '@playwright/test';

/** Shell autenticado (App.tsx): sidebar, barra mobile e área principal. */
export class DashboardPage {
  readonly page: Page;
  readonly container: Locator;
  readonly main: Locator;
  readonly sidebarNav: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.getByTestId('app-container');
    this.main = page.getByRole('main');
    this.sidebarNav = page.getByRole('navigation', { name: 'Navegação principal' });
    this.logoutButton = page.getByRole('button', { name: 'Sair', exact: true });
  }

  /** Clica no item da sidebar pelo `navLabel` de shared/config/tabs.tsx. */
  async openTab(navLabel: string) {
    await this.sidebarNav.getByRole('button', { name: navLabel, exact: true }).click();
  }

  /** Clica no item da barra mobile (aria-label = `title` da aba). */
  async openMobileTab(title: string) {
    await this.page.getByRole('button', { name: title, exact: true }).click();
  }

  pageHeading(title: string | RegExp): Locator {
    return this.main.getByRole('heading', { level: 1, name: title });
  }

  async waitForDashboard(timeout = 10_000) {
    await this.container.waitFor({ timeout });
  }
}
