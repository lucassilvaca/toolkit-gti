# ============================================================
# Script de Configuração de Firewall - Toolkit GTI
# ============================================================
# Este script adiciona a regra de firewall necessária para
# o recurso de chat funcionar corretamente em ambientes corporativos.
#
# INSTRUÇÕES:
# 1. Execute este script como Administrador em cada máquina
#    OU via GPO (Group Policy) em todas as máquinas do domínio
# 2. O script detecta automaticamente o perfil de rede
#
# VERSÃO: 1.0
# DATA: 2024
# ============================================================

param(
    [int]$Porta = 7890,
    [string]$NomeRegra = "Toolkit GTI Chat WS 7890",
    [switch]$Remover
)

# Verifica se está executando como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "`n[ERRO] Este script precisa ser executado como Administrador!" -ForegroundColor Red
    Write-Host "`nPor favor:" -ForegroundColor Yellow
    Write-Host "  1. Clique com botão direito no PowerShell" -ForegroundColor White
    Write-Host "  2. Selecione 'Executar como administrador'" -ForegroundColor White
    Write-Host "  3. Execute o script novamente`n" -ForegroundColor White
    exit 1
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Toolkit GTI - Configuração de Firewall" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($Remover) {
    # Remove a regra existente
    Write-Host "`n[1/3] Removendo regra de firewall existente..." -ForegroundColor Yellow
    $regraExistente = Get-NetFirewallRule -DisplayName $NomeRegra -ErrorAction SilentlyContinue
    
    if ($regraExistente) {
        Remove-NetFirewallRule -DisplayName $NomeRegra -ErrorAction Stop
        Write-Host "      ✓ Regra removida com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "      ℹ Nenhuma regra encontrada para remover" -ForegroundColor Gray
    }
} else {
    # Verifica se a regra já existe
    Write-Host "`n[1/3] Verificando regra existente..." -ForegroundColor Yellow
    $regraExistente = Get-NetFirewallRule -DisplayName $NomeRegra -ErrorAction SilentlyContinue
    
    if ($regraExistente) {
        Write-Host "      ℹ Regra já existe. Atualizando configurações..." -ForegroundColor Yellow
        Remove-NetFirewallRule -DisplayName $NomeRegra -ErrorAction SilentlyContinue
    }
    
    # Adiciona nova regra
    Write-Host "`n[2/3] Adicionando regra de firewall..." -ForegroundColor Yellow
    
    try {
        New-NetFirewallRule `
            -DisplayName $NomeRegra `
            -Description "Permite conexoes de chat TCP na porta $Porta para o Toolkit GTI. Regra criada automaticamente." `
            -Direction Inbound `
            -LocalPort $Porta `
            -Protocol TCP `
            -Action Allow `
            -Profile Any `
            -Enabled True `
            -ErrorAction Stop
        
        Write-Host "      ✓ Regra adicionada com sucesso!" -ForegroundColor Green
    } catch {
        Write-Host "      ✗ Erro ao adicionar regra: $_" -ForegroundColor Red
        exit 1
    }
    
    # Verifica se a regra foi criada
    Write-Host "`n[3/3] Verificando configuração..." -ForegroundColor Yellow
    $novaRegra = Get-NetFirewallRule -DisplayName $NomeRegra -ErrorAction SilentlyContinue
    
    if ($novaRegra) {
        $portFilter = $novaRegra | Get-NetFirewallPortFilter
        
        Write-Host "      ✓ Regra configurada corretamente:" -ForegroundColor Green
        Write-Host "        - Nome: $($novaRegra.DisplayName)" -ForegroundColor Gray
        Write-Host "        - Perfil: $($novaRegra.Profile)" -ForegroundColor Gray
        Write-Host "        - Direção: $($novaRegra.Direction)" -ForegroundColor Gray
        Write-Host "        - Ação: $($novaRegra.Action)" -ForegroundColor Gray
        Write-Host "        - Porta: $($portFilter.LocalPort)" -ForegroundColor Gray
        Write-Host "        - Protocolo: $($portFilter.Protocol)" -ForegroundColor Gray
        Write-Host "        - Habilitada: $(if ($novaRegra.Enabled -eq 'True') { 'Sim' } else { 'Não' })" -ForegroundColor Gray
    } else {
        Write-Host "      ✗ Regra não foi encontrada após criação!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n============================================================" -ForegroundColor Cyan
if ($Remover) {
    Write-Host "  Configuração removida com sucesso!" -ForegroundColor Green
} else {
    Write-Host "  Configuração concluída com sucesso!" -ForegroundColor Green
}
Write-Host "============================================================`n" -ForegroundColor Cyan

Write-Host "Próximos passos:" -ForegroundColor Yellow
Write-Host "  1. Instale o Toolkit GTI (Toolkit GTI_1.4.2_x64_pt-BR.msi)" -ForegroundColor White
Write-Host "  2. O chat agora deve funcionar em ambas as direções" -ForegroundColor White
Write-Host "  3. Se precisar usar outra porta, altere a configuração no app" -ForegroundColor White
Write-Host "`nPara remover esta regra posteriormente, execute:" -ForegroundColor Gray
Write-Host "  .\Add-FirewallRule.ps1 -Remover`n" -ForegroundColor Gray
