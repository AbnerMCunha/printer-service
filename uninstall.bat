@echo off
echo.
echo ============================================
echo   Desinstalador do Printer Service
echo ============================================
echo.

REM Verificar se o serviço está rodando
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [AVISO] Servico em execucao detectado.
    echo.
    set /p STOP_SERVICE="Deseja parar o servico? (S/n): "
    if /i not "!STOP_SERVICE!"=="n" (
        echo Parando servico...
        taskkill /F /IM node.exe /T 2>nul
        timeout /t 2 /nobreak >nul
    )
)

echo.
set /p CONFIRM="Deseja realmente desinstalar? (s/N): "
if /i not "!CONFIRM!"=="s" (
    echo Desinstalacao cancelada.
    pause
    exit /b 0
)

echo.
echo Removendo arquivos...

REM Remover node_modules
if exist node_modules (
    echo   - Removendo node_modules...
    rmdir /s /q node_modules 2>nul
)

REM Remover dist
if exist dist (
    echo   - Removendo dist...
    rmdir /s /q dist 2>nul
)

REM Remover logs
if exist logs (
    echo   - Removendo logs...
    rmdir /s /q logs 2>nul
)

REM Remover arquivos de configuração (opcional)
set /p REMOVE_CONFIG="Deseja remover arquivos de configuracao (.env, .device-id)? (s/N): "
if /i "!REMOVE_CONFIG!"=="s" (
    if exist .env (
        echo   - Removendo .env...
        del /q .env 2>nul
    )
    if exist .device-id (
        echo   - Removendo .device-id...
        del /q .device-id 2>nul
    )
)

echo.
echo [OK] Desinstalacao concluida!
echo.
echo Nota: O Node.js nao foi removido. Se desejar, remova manualmente.
echo.
pause

