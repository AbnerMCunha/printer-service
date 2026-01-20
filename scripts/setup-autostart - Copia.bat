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
    Write-Host "❌ Erro: Arquivo dist\index.js não encontrado!" -ForegroundColor Red
    Write-Host "   Diretório atual: $(Get-Location)" -ForegroundColor Red
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
    Write-Host "✅ Node.js encontrado: $nodePath" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro: Node.js não encontrado!" -ForegroundColor Red
    exit 1
}

# Nome da tarefa
$taskName = "PrinterService-Cardapix"

Write-Host ""
Write-Host "📋 Configuração:" -ForegroundColor Yellow
Write-Host "   Nome da tarefa: $taskName"
Write-Host "   Caminho do serviço: $ServicePath"
Write-Host "   Diretório de trabalho: $WorkingDir"
Write-Host "   Node.js: $nodePath"
Write-Host ""

# Remover tarefa existente se houver
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "⚠️  Tarefa existente encontrada. Removendo..." -ForegroundColor Yellow
    try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
        Write-Host "✅ Tarefa antiga removida" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Aviso: Não foi possível remover tarefa existente: $_" -ForegroundColor Yellow
    }
}

# Criar ação
try {
    $action = New-ScheduledTaskAction `
        -Execute $nodePath `
        -Argument "`"$ServicePath`"" `
        -WorkingDirectory $WorkingDir

    Write-Host "✅ Ação criada" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao criar ação: $_" -ForegroundColor Red
    exit 1
}

# Criar trigger (ao fazer login)
try {
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    Write-Host "✅ Trigger criado (ao fazer login)" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao criar trigger: $_" -ForegroundColor Red
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

    Write-Host "✅ Configurações criadas" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao criar configurações: $_" -ForegroundColor Red
    exit 1
}

# Principal (usuário atual)
try {
    $principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive `
        -RunLevel Highest

    Write-Host "✅ Principal configurado" -ForegroundColor Green
} catch {
    Write-Host "❌ Erro ao configurar principal: $_" -ForegroundColor Red
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
    Write-Host "✅ Tarefa criada com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Informações:" -ForegroundColor Cyan
    Write-Host "   • O serviço iniciará automaticamente na próxima vez que você fizer login"
    Write-Host "   • A tarefa está configurada para reiniciar até 3 vezes se falhar"
    Write-Host ""
    Write-Host "🔧 Comandos úteis:" -ForegroundColor Yellow
    Write-Host "   Ver status: Get-ScheduledTask -TaskName '$taskName'"
    Write-Host "   Iniciar agora: Start-ScheduledTask -TaskName '$taskName'"
    Write-Host "   Parar: Stop-ScheduledTask -TaskName '$taskName'"
    Write-Host "   Remover: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
    Write-Host ""
    
    return 0
} catch {
    Write-Host ""
    Write-Host "❌ Erro ao criar tarefa: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Possíveis causas:" -ForegroundColor Yellow
    Write-Host "   • Permissões insuficientes (tente executar como Administrador)"
    Write-Host "   • Task Scheduler não está disponível"
    Write-Host ""
    return 1
}

pause