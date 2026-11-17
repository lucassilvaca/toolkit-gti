@echo off
chcp 65001 >nul
title Configurar Firewall - Toolkit GTI
echo.
echo ============================================================
echo   Toolkit GTI - Configuracao de Firewall
echo ============================================================
echo.
echo Este script adiciona uma regra no Windows Firewall para
echo permitir conexoes de chat na porta TCP 7890.
echo.
echo [!] IMPORTANTE: Execute como ADMINISTRADOR!
echo.
echo ------------------------------------------------------------
echo.

:: Verifica se esta executando como administrador
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERRO] Este script precisa ser executado como Administrador!
    echo.
    echo Por favor:
    echo   1. Clique com o botao DIREITO no arquivo
echo   2. Selecione "Executar como administrador"
    echo.
    pause
    exit /b 1
)

echo [OK] Executando com privilegios de administrador.
echo.
echo [1/3] Verificando regra existente...

:: Verifica se a regra ja existe
netsh advfirewall firewall show rule name="Toolkit GTI Chat WS 7890" >nul 2>&1
if %errorLevel% EQU 0 (
    echo [OK] Regra ja existe. Atualizando...
    netsh advfirewall firewall delete rule name="Toolkit GTI Chat WS 7890"
)

echo.
echo [2/3] Adicionando regra de firewall...

:: Adiciona a regra de firewall
netsh advfirewall firewall add rule name="Toolkit GTI Chat WS 7890" dir=in action=allow protocol=tcp localport=7890 profile=any enable=yes description="Permite conexoes de chat TCP na porta 7890 para o Toolkit GTI. Regra criada automaticamente."

if %errorLevel% NEQ 0 (
    echo.
    echo [ERRO] Falha ao adicionar regra de firewall!
    echo.
    pause
    exit /b 1
)

echo [OK] Regra adicionada com sucesso!
echo.
echo [3/3] Verificando configuracao...

:: Mostra a regra criada
netsh advfirewall firewall show rule name="Toolkit GTI Chat WS 7890"

echo.
echo ============================================================
echo   CONFIGURACAO CONCLUIDA COM SUCESSO!
echo ============================================================
echo.
echo [INFO] Regra configurada:
echo        - Nome: Toolkit GTI Chat WS 7890
echo        - Direcao: Entrada (Inbound)
echo        - Protocolo: TCP
echo        - Porta: 7890
echo        - Perfil: Todos (Any)
echo        - Acao: Permitir
echo.
echo [INFO] Proximos passos:
echo        1. Instale o Toolkit GTI (MSI)
echo        2. O chat agora funcionara corretamente!
echo.
echo ============================================================
echo.
pause
