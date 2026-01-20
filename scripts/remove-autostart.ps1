# Script para remover auto-start do Task Scheduler
# Uso: .\scripts\remove-autostart.ps1

$ErrorActionPreference = "Stop"

$taskName = "PrinterService-Cardapix"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Removendo Auto-Start (Task Scheduler)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se a tarefa existe
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $existingTask) {
    Write-Host "⚠️  Tarefa '$taskName' não encontrada." -ForegroundColor Yellow
    Write-Host "   Nada para remover." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# Remover tarefa
try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
    Write-Host "✅ Tarefa '$taskName' removida com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 O serviço não iniciará mais automaticamente ao fazer login." -ForegroundColor Cyan
    Write-Host ""
    return 0
} catch {
    Write-Host "❌ Erro ao remover tarefa: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Tente executar como Administrador" -ForegroundColor Yellow
    Write-Host ""
    return 1
}
