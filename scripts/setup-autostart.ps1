# Script para configurar auto-start via Task Scheduler
# Uso: .\scripts\setup-autostart.ps1

param(
    [string]$ServicePath = "",
    [string]$WorkingDir = ""
)

$ErrorActionPreference = "Stop"

# Determinar o diretório do script e mudar para a pasta printer-service
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$printerServiceDir = Split-Path -Parent $scriptDir
Set-Location $printerServiceDir

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Configurando Auto-Start (Task Scheduler)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se está na pasta correta
if (-not (Test-Path "dist\index.js")) {
    Write-Host "[ERRO] Arquivo dist\index.js nao encontrado!" -ForegroundColor Red
    Write-Host "   Diretorio atual: $(Get-Location)" -ForegroundColor Red
    Write-Host "   Execute este script da pasta printer-service ou compile o projeto primeiro" -ForegroundColor Red
    exit 1
}

# Obter caminhos
if ([string]::IsNullOrEmpty($ServicePath)) {
    $ServicePath = (Resolve-Path "dist\index.js").Path
}
if ([string]::IsNullOrEmpty($WorkingDir)) {
    $WorkingDir = (Get-Location).Path
}

# Verificar se Node.js está instalado
try {
    $nodePath = (Get-Command node).Source
    Write-Host "[OK] Node.js encontrado: $nodePath" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Node.js nao encontrado!" -ForegroundColor Red
    exit 1
}

# Nome da tarefa
$taskName = "PrinterService-Cardapix"

Write-Host ""
Write-Host "Configuracao:" -ForegroundColor Yellow
Write-Host "   Nome da tarefa: $taskName"
Write-Host "   Caminho do servico: $ServicePath"
Write-Host "   Diretorio de trabalho: $WorkingDir"
Write-Host "   Node.js: $nodePath"
Write-Host ""

# Remover tarefa existente se houver
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "[AVISO] Tarefa existente encontrada. Removendo..." -ForegroundColor Yellow
    try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
        Write-Host "[OK] Tarefa antiga removida" -ForegroundColor Green
    } catch {
        Write-Host "[AVISO] Nao foi possivel remover tarefa existente: $_" -ForegroundColor Yellow
    }
}

# Criar ação
try {
    $action = New-ScheduledTaskAction `
        -Execute $nodePath `
        -Argument "`"$ServicePath`"" `
        -WorkingDirectory $WorkingDir

    Write-Host "[OK] Acao criada" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Erro ao criar acao: $_" -ForegroundColor Red
    exit 1
}

# Criar trigger (ao fazer login)
try {
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    Write-Host "[OK] Trigger criado (ao fazer login)" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Erro ao criar trigger: $_" -ForegroundColor Red
    exit 1
}

# Configurações
try {
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
        -MultipleInstances IgnoreNew

    Write-Host "[OK] Configuracoes criadas" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Erro ao criar configuracoes: $_" -ForegroundColor Red
    exit 1
}

# Principal (usuário atual)
try {
    $principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive `
        -RunLevel Highest

    Write-Host "[OK] Principal configurado" -ForegroundColor Green
} catch {
    Write-Host "[ERRO] Erro ao configurar principal: $_" -ForegroundColor Red
    exit 1
}

# Registrar tarefa
try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "Printer Service Cardapix - Inicia automaticamente ao fazer login no Windows" `
        -Force | Out-Null

    Write-Host ""
    Write-Host "[OK] Tarefa criada com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Informacoes:" -ForegroundColor Cyan
    Write-Host "   - O servico iniciara automaticamente na proxima vez que voce fizer login"
    Write-Host "   - A tarefa esta configurada para reiniciar ate 3 vezes se falhar"
    Write-Host ""
    Write-Host "Comandos uteis:" -ForegroundColor Yellow
    Write-Host "   Ver status: Get-ScheduledTask -TaskName '$taskName'"
    Write-Host "   Iniciar agora: Start-ScheduledTask -TaskName '$taskName'"
    Write-Host "   Parar: Stop-ScheduledTask -TaskName '$taskName'"
    Write-Host "   Remover: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
    Write-Host ""
    
    return 0
} catch {
    Write-Host ""
    Write-Host "[ERRO] Erro ao criar tarefa: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Possiveis causas:" -ForegroundColor Yellow
    Write-Host "   - Permissoes insuficientes (tente executar como Administrador)"
    Write-Host "   - Task Scheduler nao esta disponivel"
    Write-Host ""
    return 1
}
