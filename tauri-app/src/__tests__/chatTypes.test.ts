import { describe, it, expect } from 'vitest';
import { isWsTextMessage, isWsFileMessage } from '../shared/types/chat';
import type { NetworkConfig, WsChatMessage, WsConnectionStatus } from '../shared/types/chat';

describe('NetworkConfig', () => {
  it('should have required fields', () => {
    const config: NetworkConfig = {
      tcp_port: 7890,
      last_modified: '2024-01-01T00:00:00Z',
      applied_at: '2024-01-01T00:00:00Z'
    };
    
    expect(config.tcp_port).toBe(7890);
    expect(config.last_modified).toBeDefined();
    expect(config.applied_at).toBeDefined();
  });

  it('should accept valid port numbers', () => {
    const validPorts = [1024, 7890, 8080, 65535];
    validPorts.forEach(port => {
      const config: NetworkConfig = {
        tcp_port: port,
        last_modified: new Date().toISOString(),
        applied_at: new Date().toISOString()
      };
      expect(config.tcp_port).toBeGreaterThanOrEqual(1024);
      expect(config.tcp_port).toBeLessThanOrEqual(65535);
    });
  });
});

describe('WsChatMessage type guards', () => {
  it('isWsTextMessage returns true for text type', () => {
    const msg: WsChatMessage = {
      id: 'abc',
      sender: 'me',
      type: 'text',
      content: 'hello',
      timestamp: Date.now(),
    }
    expect(isWsTextMessage(msg)).toBe(true)
  })

  it('isWsTextMessage returns false for file type', () => {
    const msg: WsChatMessage = {
      id: 'def',
      sender: 'remote',
      type: 'file',
      filename: 'doc.pdf',
      mime_type: 'application/pdf',
      file_data: 'base64==',
      timestamp: Date.now(),
    }
    expect(isWsTextMessage(msg)).toBe(false)
  })

  it('isWsFileMessage returns true for file type', () => {
    const msg: WsChatMessage = {
      id: 'def',
      sender: 'remote',
      type: 'file',
      filename: 'doc.pdf',
      mime_type: 'application/pdf',
      file_data: 'base64==',
      timestamp: Date.now(),
    }
    expect(isWsFileMessage(msg)).toBe(true)
  })

  it('isWsFileMessage returns false for text type', () => {
    const msg: WsChatMessage = {
      id: 'abc',
      sender: 'me',
      type: 'text',
      content: 'hello',
      timestamp: Date.now(),
    }
    expect(isWsFileMessage(msg)).toBe(false)
  })
})

describe('WsConnectionStatus', () => {
  it('accepts valid status values', () => {
    const statuses: WsConnectionStatus[] = ['connecting', 'connected', 'idle', 'disconnected']
    statuses.forEach(s => {
      expect(['connecting', 'connected', 'idle', 'disconnected']).toContain(s)
    })
  })
})
