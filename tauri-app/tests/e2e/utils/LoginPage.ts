import type { Page, Locator } from '@playwright/test';

/** Tela de login (features/auth/views/LoginView.tsx). */
export class LoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly detectedAccount: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByText('Gestão de Tecnologia da Informação');
    this.usernameInput = page.getByLabel('Usuário', { exact: true });
    this.passwordInput = page.getByLabel('Senha', { exact: true });
    this.loginButton = page.getByRole('button', { name: 'Entrar', exact: true });
    this.detectedAccount = page.getByText(/^Conta Windows · /);
  }

  /** Com conta do Windows detectada só a senha é pedida; `username` é opcional. */
  async login(password: string, username?: string) {
    if (username !== undefined) await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  errorMessage(text: string | RegExp): Locator {
    return this.page.getByText(text);
  }
}
