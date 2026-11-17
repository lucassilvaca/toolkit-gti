import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Paperclip: () => <span data-testid="paperclip-icon">📎</span>,
  Download: () => <span data-testid="download-icon">⬇️</span>,
  Loader2: () => <span data-testid="loader-icon">⏳</span>,
}));

const TS = 1_700_000_000_000; // fixed timestamp for stable time display

describe('ChatMessage Component', () => {
  it('renders remote text message', async () => {
    const { ChatMessage } = await import('../features/chat/components/ChatMessage');

    render(
      <ChatMessage
        msg={{ id: '1', sender: 'remote', type: 'text', content: 'Hello World', timestamp: TS }}
        savingFile={null}
        onSaveFile={() => {}}
      />
    );

    expect(screen.getByText('Hello World')).toBeInTheDocument();
    // Avatar = inicial do nome padrão do remoto (usuário atendido): "Usuário" → U
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('renders own text message without avatar', async () => {
    const { ChatMessage } = await import('../features/chat/components/ChatMessage');

    render(
      <ChatMessage
        msg={{ id: '2', sender: 'me', type: 'text', content: 'My message', timestamp: TS }}
        savingFile={null}
        onSaveFile={() => {}}
      />
    );

    expect(screen.getByText('My message')).toBeInTheDocument();
    expect(screen.queryByText('S')).not.toBeInTheDocument();
  });

  it('renders remote file message with download button', async () => {
    const { ChatMessage } = await import('../features/chat/components/ChatMessage');
    const onSaveFile = vi.fn();

    render(
      <ChatMessage
        msg={{
          id: '3',
          sender: 'remote',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          file_data: 'base64data',
          timestamp: TS,
        }}
        savingFile={null}
        onSaveFile={onSaveFile}
      />
    );

    expect(screen.getByText('test.pdf')).toBeInTheDocument();
    const btn = screen.getByTitle('Salvar arquivo');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onSaveFile).toHaveBeenCalledWith('test.pdf', 'base64data');
  });

  it('does NOT show download button for own file messages', async () => {
    const { ChatMessage } = await import('../features/chat/components/ChatMessage');

    render(
      <ChatMessage
        msg={{
          id: '4',
          sender: 'me',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          file_data: 'base64data',
          timestamp: TS,
        }}
        savingFile={null}
        onSaveFile={() => {}}
      />
    );

    expect(screen.getByText('test.pdf')).toBeInTheDocument();
    expect(screen.queryByTitle('Salvar arquivo')).not.toBeInTheDocument();
  });

  it('shows loading spinner when saving the same file', async () => {
    const { ChatMessage } = await import('../features/chat/components/ChatMessage');

    render(
      <ChatMessage
        msg={{
          id: '5',
          sender: 'remote',
          type: 'file',
          filename: 'test.pdf',
          mime_type: 'application/pdf',
          file_data: 'base64data',
          timestamp: TS,
        }}
        savingFile="test.pdf"
        onSaveFile={() => {}}
      />
    );

    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });

  it('shows mime_type for file messages', async () => {
    const { ChatMessage } = await import('../features/chat/components/ChatMessage');

    render(
      <ChatMessage
        msg={{
          id: '6',
          sender: 'remote',
          type: 'file',
          filename: 'photo.jpg',
          mime_type: 'image/jpeg',
          file_data: 'base64data',
          timestamp: TS,
        }}
        savingFile={null}
        onSaveFile={() => {}}
      />
    );

    expect(screen.getByText('image/jpeg')).toBeInTheDocument();
  });
});
