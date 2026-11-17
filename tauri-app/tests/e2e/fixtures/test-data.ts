/**
 * Dados compartilhados dos testes E2E.
 * Títulos das abas vêm da fonte única do app, não de cópia local.
 */
export { TABS } from '../../../src/shared/config/tabs';
export { TEST_SESSION, VALID_PASSWORD } from '../utils/tauriMock';

/** Porta padrão do chat na rede interna (NetworkConfigService.DEFAULT_PORT). */
export const CHAT_PORT = 7890;

/** Saída real do `ping` no Windows pt-BR (console OEM já decodificado). */
export const PING_OUTPUT = [
  'Disparando 10.10.0.1 com 32 bytes de dados:',
  'Resposta de 10.10.0.1: bytes=32 tempo<1ms TTL=128',
  'Estatísticas do Ping para 10.10.0.1:',
  'Pacotes: Enviados = 4, Recebidos = 4, Perdidos = 0 (0% de perda),',
].join('\n');

export const Timeouts = {
  short: 2_000,
  medium: 5_000,
  long: 10_000,
} as const;
