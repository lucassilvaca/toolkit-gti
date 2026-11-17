import { test, expect, type Page } from '@playwright/test';
import { DashboardPage } from './utils/DashboardPage';
import { emitTauriEvent, mockTauri, recordedCalls, type TauriMockOptions } from './utils/tauriMock';
import { CHAT_PORT, PING_OUTPUT } from './fixtures/test-data';

/**
 * Ferramentas de rede e configuração da porta do chat, com o IPC mockado.
 * Valida o contrato front ↔ comandos Rust (nome + argumentos) e o que o
 * técnico vê no terminal modal.
 */

async function openApp(page: Page, tab: string, options: TauriMockOptions = {}) {
  const shell = new DashboardPage(page);
  await mockTauri(page, {
    loggedIn: true,
    ...options,
    responses: { save_settings: null, ...options.responses },
  });
  await page.goto('/');
  await shell.waitForDashboard();
  await shell.openTab(tab);
  return shell;
}

const terminal = (page: Page) => page.getByRole('log');

test.describe('Ferramentas de rede', () => {
  test('ping mostra a saída do comando', async ({ page }) => {
    await openApp(page, 'Ferramentas', {
      responses: { run_ping: { success: true, output: PING_OUTPUT, error: null } },
    });

    await page.getByPlaceholder('IP ou hostname').fill('10.10.0.1');
    await page.getByRole('button', { name: 'Ping', exact: true }).click();

    await expect(terminal(page)).toContainText('Resposta de 10.10.0.1: bytes=32 tempo<1ms TTL=128');
    await expect(page.getByText('Concluído · 4 linhas')).toBeVisible();
    expect(await recordedCalls(page, 'run_ping')).toEqual([
      { cmd: 'run_ping', args: { target: '10.10.0.1' } },
    ]);
  });

  test('destino rejeitado pelo backend aparece como falha', async ({ page }) => {
    await openApp(page, 'Ferramentas', {
      errors: {
        run_ping: {
          message: 'Destino invalido. Use apenas letras, numeros, ponto, hifen, underscore e dois-pontos',
          code: 'VALIDATION_ERROR',
        },
      },
    });

    await page.getByPlaceholder('IP ou hostname').fill('10.10.0.1 & calc');
    await page.getByRole('button', { name: 'Ping', exact: true }).click();

    await expect(page.getByText('Falhou', { exact: true })).toBeVisible();
    await expect(page.getByText(/Destino invalido/)).toBeVisible();
  });

  test('ping contínuo recebe linhas em streaming e pode ser parado', async ({ page }) => {
    await openApp(page, 'Ferramentas', {
      responses: { run_network_streaming: null, stop_streaming_command: null },
    });

    await page.getByPlaceholder('IP ou hostname').fill('10.10.0.1');
    // O input do Switch é sr-only; o usuário clica no rótulo visível.
    await page.getByText('Modo Contínuo (-t)', { exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Modo Contínuo (-t)' })).toBeChecked();
    await page.getByRole('button', { name: 'Ping', exact: true }).click();

    await expect(page.getByText('Aguardando a primeira linha…')).toBeVisible();
    expect(await recordedCalls(page, 'run_network_streaming')).toEqual([
      { cmd: 'run_network_streaming', args: { command: 'ping_continuous', target: '10.10.0.1' } },
    ]);

    await emitTauriEvent(page, 'network-output', 'Resposta de 10.10.0.1: bytes=32 tempo=1ms TTL=128');
    await emitTauriEvent(page, 'network-output', 'Resposta de 10.10.0.1: bytes=32 tempo=2ms TTL=128');
    await expect(terminal(page)).toContainText('tempo=2ms');

    await page.getByRole('button', { name: 'Parar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Parar', exact: true })).toHaveCount(0);
    expect(await recordedCalls(page, 'stop_streaming_command')).toHaveLength(1);
  });

  test('portas HTTP/HTTPS mostram o resultado da verificação', async ({ page }) => {
    await openApp(page, 'Ferramentas', {
      responses: {
        check_web_ports: {
          host: 'intranet.empresa.local',
          port80: true,
          port443: true,
          message: 'Porta 80: ABERTA | Porta 443: ABERTA',
        },
      },
    });

    await page.getByPlaceholder('hostname ou IP').fill('intranet.empresa.local');
    await page.getByRole('button', { name: 'Verificar', exact: true }).click();

    await expect(terminal(page)).toContainText('Porta 443: ABERTA');
    expect(await recordedCalls(page, 'check_web_ports')).toEqual([
      { cmd: 'check_web_ports', args: { host: 'intranet.empresa.local' } },
    ]);
  });
});

test.describe('Configuração da porta do chat', () => {
  const networkConfig = JSON.stringify({
    tcp_port: CHAT_PORT,
    last_modified: '2026-10-01T00:00:00Z',
    applied_at: '2026-10-01T00:00:00Z',
  });
  const portInput = (page: Page) => page.getByLabel(/Alterar porta/);
  const applyButton = (page: Page) => page.getByRole('button', { name: 'Aplicar na próxima sessão' });

  test('mostra a porta em uso e salva uma porta livre', async ({ page }) => {
    await openApp(page, 'Configurações', {
      responses: { read_network_config: networkConfig, is_port_available: true, write_network_config: null },
    });

    await expect(page.getByText(String(CHAT_PORT), { exact: true })).toBeVisible();
    await expect(portInput(page)).toHaveValue(String(CHAT_PORT));

    await portInput(page).fill('9000');
    await expect(page.getByText('Disponível', { exact: true })).toBeVisible();
    await applyButton(page).click();

    await expect(page.getByText('Porta alterada para 9000. Será aplicada no próximo restart.')).toBeVisible();
    const [write] = await recordedCalls(page, 'write_network_config');
    expect(JSON.parse(String(write.args.config)).tcp_port).toBe(9000);
  });

  test('porta reservada (< 1024) é bloqueada sem chamar o backend', async ({ page }) => {
    await openApp(page, 'Configurações', {
      responses: { read_network_config: networkConfig, is_port_available: true },
    });

    await portInput(page).fill('80');

    await expect(page.getByText('Porta deve estar entre 1024 e 65535.')).toBeVisible();
    await expect(applyButton(page)).toBeDisabled();
    expect(await recordedCalls(page, 'is_port_available')).toHaveLength(0);
  });

  test('porta ocupada na máquina não pode ser aplicada', async ({ page }) => {
    await openApp(page, 'Configurações', {
      responses: { read_network_config: networkConfig, is_port_available: false },
    });

    await portInput(page).fill('9001');

    await expect(page.getByText('Porta não está disponível ou em uso.')).toBeVisible();
    await expect(applyButton(page)).toBeDisabled();
  });
});

test.describe('Redes da varredura (outras VLANs)', () => {
  const field = (page: Page) => page.getByLabel(/Faixas extras/);
  const save = (page: Page) => page.getByRole('button', { name: 'Salvar faixas' });

  test('carrega as faixas salvas e grava a lista normalizada pelo backend', async ({ page }) => {
    await openApp(page, 'Configurações', {
      responses: {
        read_network_config: '{"tcp_port":7890}',
        get_scan_networks: ['10.20.31.0/24'],
        set_scan_networks: ['10.20.31.0/24', '10.20.32.0/25'],
      },
    });

    await expect(field(page)).toHaveValue('10.20.31.0/24');
    await expect(save(page)).toBeDisabled();

    await field(page).fill('10.20.31.0/24\n10.20.32.77/25');
    await save(page).click();

    await expect(page.getByText('2 faixa(s) salva(s). Entram na próxima varredura.')).toBeVisible();
    await expect(field(page)).toHaveValue('10.20.31.0/24\n10.20.32.0/25');
    const [call] = await recordedCalls(page, 'set_scan_networks');
    expect(call.args.networks).toEqual(['10.20.31.0/24', '10.20.32.77/25']);
  });

  test('faixa inválida mostra o motivo do backend e não perde o texto', async ({ page }) => {
    await openApp(page, 'Configurações', {
      responses: { read_network_config: '{"tcp_port":7890}', get_scan_networks: [] },
      errors: {
        set_scan_networks: {
          message: 'Erro de validação no campo: networks',
          code: 'VALIDATION_ERROR',
        },
      },
    });

    await field(page).fill('10.0.0.0/8');
    await save(page).click();

    await expect(page.getByText(/Erro de validação no campo: networks/)).toBeVisible();
    await expect(field(page)).toHaveValue('10.0.0.0/8');
  });
});

test('aba Online mostra as faixas varridas em CIDR', async ({ page }) => {
  await openApp(page, 'Usuários Online', {
    responses: {
      get_chat_port_from_config: CHAT_PORT,
      scan_online_users: { net: '10.20.30.128/25 + 10.20.31.0/24', probed: 379, users: [] },
    },
  });

  await expect(page.getByText('10.20.30.128/25 + 10.20.31.0/24').first()).toBeVisible();
  const [scan] = await recordedCalls(page, 'scan_online_users');
  expect(scan.args).toEqual({ baseIp: '192.0.2.10', wsPort: CHAT_PORT });
});

test('conectar por IP de outro estado mostra o usuário achado via SMB', async ({ page }) => {
  await openApp(page, 'Usuários Online', {
    responses: {
      get_chat_port_from_config: CHAT_PORT,
      scan_online_users: { net: '10.20.30.128/25', probed: 125, users: [] },
      probe_host_by_ip: {
        ip: '10.40.178.65',
        hostname: 'PC0101',
        username: 'maria.rodrigues',
        online: true,
        has_toolkit: false,
        uptime_secs: null,
        last_seen: 1761739200,
      },
    },
  });

  await page.getByRole('textbox', { name: 'Conectar por IP ou host' }).fill('10.40.178.65');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();

  await expect(
    page.getByText('PC0101 está ligado · maria.rodrigues (sem Toolkit: chat indisponível).'),
  ).toBeVisible();
  const row = page.getByRole('row', { name: /PC0101/ });
  await expect(row).toContainText('maria.rodrigues');
  await expect(row).toContainText('sem toolkit');
});

test('IP de outra VLAN digitado na busca oferece conectar', async ({ page }) => {
  await openApp(page, 'Usuários Online', {
    responses: {
      get_chat_port_from_config: CHAT_PORT,
      scan_online_users: { net: '10.20.30.128/25', probed: 125, users: [] },
      probe_host_by_ip: {
        ip: '10.40.178.65',
        hostname: 'PC0101',
        username: 'maria.rodrigues',
        online: true,
        has_toolkit: false,
        uptime_secs: null,
        last_seen: 1761739200,
      },
    },
  });

  await page.getByRole('textbox', { name: 'Buscar usuários por host, usuário ou IP' }).fill('10.40.178.65');
  await expect(page.getByText('Nenhum resultado para "10.40.178.65" nas faixas varridas.')).toBeVisible();
  await page.getByRole('button', { name: 'Conectar a 10.40.178.65' }).click();

  await expect(page.getByText('Conectados por IP (1)')).toBeVisible();
  await expect(page.getByRole('row', { name: /PC0101/ })).toContainText('maria.rodrigues');
  expect((await recordedCalls(page, 'probe_host_by_ip'))[0].args).toEqual({ ip: '10.40.178.65', wsPort: CHAT_PORT });
});

test('host de outra VLAN digitado na busca oferece conectar pelo nome', async ({ page }) => {
  await openApp(page, 'Usuários Online', {
    responses: {
      get_chat_port_from_config: CHAT_PORT,
      scan_online_users: { net: '10.20.30.128/25', probed: 125, users: [] },
      probe_host_by_ip: {
        ip: '10.40.178.65',
        hostname: 'PC0101',
        username: 'maria.rodrigues',
        online: true,
        has_toolkit: true,
        uptime_secs: 3600,
        last_seen: 1761739200,
      },
    },
  });

  await page.getByRole('textbox', { name: 'Buscar usuários por host, usuário ou IP' }).fill('PC0101');
  await page.getByRole('button', { name: 'Conectar a PC0101' }).click();

  await expect(page.getByRole('row', { name: /PC0101/ })).toContainText('10.40.178.65');
  expect((await recordedCalls(page, 'probe_host_by_ip'))[0].args).toEqual({ ip: 'PC0101', wsPort: CHAT_PORT });
});

test('lista de usuários mostra ~7 linhas e rola o restante, sem fictícios', async ({ page }) => {
  const users = Array.from({ length: 15 }, (_, i) => ({
    ip: `10.20.30.${130 + i}`,
    hostname: `PC-${String(i).padStart(2, '0')}`,
    username: `usuario.${i}`,
    online: true,
    has_toolkit: true,
    uptime_secs: 3600,
    last_seen: 1761739200,
  }));
  await openApp(page, 'Usuários Online', {
    responses: {
      get_chat_port_from_config: CHAT_PORT,
      scan_online_users: { net: '10.20.30.128/25', probed: 125, users },
    },
  });

  const list = page.getByRole('region', { name: 'Lista de usuários online e vistos recentemente' });
  await expect(list.getByRole('row', { name: /PC-00/ })).toBeVisible();
  await expect(page.getByText('fictício')).toHaveCount(0);
  await expect(page.getByText('Online (15)')).toBeVisible();

  const box = await list.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  expect(box.scroll).toBeGreaterThan(box.client);
  expect(box.client).toBeLessThanOrEqual(452);

  // Dentro da área da lista: a 7ª linha cabe; a 8ª fica abaixo até rolar.
  const visible = (name: string) =>
    list.evaluate((el, n) => {
      const row = Array.from(el.querySelectorAll('tr')).find((r) => r.textContent?.includes(n));
      const area = el.getBoundingClientRect();
      const r = row!.getBoundingClientRect();
      return r.top >= area.top && r.bottom <= area.bottom + 1;
    }, name);
  expect(await visible('PC-06')).toBe(true);
  expect(await visible('PC-07')).toBe(false);
  expect(await visible('PC-14')).toBe(false);
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await visible('PC-14')).toBe(true);
});

test('chamar da lista leva os dados da máquina ao painel do atendimento', async ({ page }) => {
  await openApp(page, 'Usuários Online', {
    responses: {
      get_chat_port_from_config: CHAT_PORT,
      scan_online_users: {
        net: '10.20.30.128/25',
        probed: 125,
        users: [
          {
            ip: '10.20.30.7',
            hostname: 'PC0103',
            username: 'joana.souza',
            online: true,
            has_toolkit: true,
            uptime_secs: 7200,
            last_seen: Math.floor(Date.now() / 1000),
          },
        ],
      },
      create_chat_room: { room_id: 'sala-1', token: 'tok-1' },
      send_chat_invite: { busy: false },
    },
  });

  await page.getByRole('row', { name: /PC0103/ }).getByRole('button', { name: 'Chamar' }).click();

  const painel = page.getByRole('complementary').filter({ hasText: 'Painel de atendimento' });
  await expect(painel).toContainText('PC0103');
  await expect(painel).toContainText('10.20.30.7');
  await expect(painel).toContainText('joana.souza');
  await expect(painel).toContainText('2h 0min');
  await expect(painel).toContainText('Disponível');
  await expect(painel).not.toContainText('Não informado');
});
