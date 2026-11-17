import type { Page, Locator } from '@playwright/test';

/**
 * Aba Chat do técnico (features/chat/views/ChatWorkspace.tsx).
 * Sem sessão ativa mostra o estado vazio; sessões só nascem de um convite
 * aceito, que depende do servidor WS real e fica fora do E2E com mock.
 */
export class ChatPage {
  readonly page: Page;
  readonly emptyState: Locator;
  readonly emptyHint: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emptyState = page.getByText('Nenhum atendimento ativo');
    this.emptyHint = page.getByText(/Inicie um chat pela aba Chamados/);
  }
}
