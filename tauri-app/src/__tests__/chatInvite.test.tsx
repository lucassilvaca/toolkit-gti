import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: () => Promise.resolve() }),
}));

describe('ChatInviteView', () => {
  it('mostra mensagem com "%" sem decodificar duas vezes', async () => {
    // Formato gerado por infra/toast/mod.rs (url_encode: "%" vira "%25").
    window.history.replaceState(null, '', '/chat-invite.html?name=T%C3%A9cnico&host=GTI-01&ip=10.0.0.5&msg=Disco%2050%25%20cheio&dur=5&room=r1&ws_port=7890&token=t1');
    const { ChatInviteView } = await import('../features/chat/views/ChatInviteView');
    render(<ChatInviteView />);
    expect(screen.getByText(/Disco 50% cheio/)).toBeInTheDocument();
    expect(screen.getAllByText(/Técnico/).length).toBeGreaterThan(0);
  });
});
