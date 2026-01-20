@echo off
echo.
echo ============================================
echo   Configurando Auto-Start
echo ============================================
echo.

REM Obter o diretório onde o script está
set SCRIPT_DIR=%~dp0

REM Executar o script PowerShell
powershell.exe -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\setup-autostart.ps1"

if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo   Auto-Start Configurado!
    echo ============================================
    echo.
    echo O servico iniciara automaticamente ao fazer login.
    echo.
) else (
    echo.
    echo ============================================
    echo   Erro ao Configurar Auto-Start
    echo ============================================
    echo.
    echo Verifique as mensagens acima para mais detalhes.
    echo.
)

pause
