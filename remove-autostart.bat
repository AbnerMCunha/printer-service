@echo off
echo.
echo ============================================
echo   Removendo Auto-Start
echo ============================================
echo.

REM Obter o diretório onde o script está
set SCRIPT_DIR=%~dp0

REM Executar o script PowerShell
powershell.exe -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\remove-autostart.ps1"

if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo   Auto-Start Removido!
    echo ============================================
    echo.
    echo O servico nao iniciara mais automaticamente.
    echo.
) else (
    echo.
    echo ============================================
    echo   Erro ao Remover Auto-Start
    echo ============================================
    echo.
    echo Verifique as mensagens acima para mais detalhes.
    echo.
)

pause
