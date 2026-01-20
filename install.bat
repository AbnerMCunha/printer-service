@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================
echo   Instalador do Printer Service - Cardapix
echo ============================================
echo.

REM Verificar se Node.js está instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    echo.
    echo Por favor, instale o Node.js versao 18 ou superior:
    echo https://nodejs.org/
    echo.
    echo Apos instalar, execute este script novamente.
    pause
    exit /b 1
)

echo [OK] Node.js encontrado
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo       Versao: %NODE_VERSION%
echo.

REM Verificar se npm está instalado
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] npm nao encontrado!
    pause
    exit /b 1
)

echo [OK] npm encontrado
echo.

REM Verificar se já existe .env
if exist .env (
    echo [AVISO] Arquivo .env ja existe.
    set /p OVERWRITE="Deseja sobrescrever? (s/N): "
    if /i not "!OVERWRITE!"=="s" (
        echo Instalacao cancelada.
        pause
        exit /b 0
    )
    echo.
)

echo ============================================
echo   Configuracao Inicial
echo ============================================
echo.

REM Solicitar informações
set /p API_URL="URL da API (ex: https://api.cardapix.net ou http://localhost:3001): "
if "!API_URL!"=="" (
    echo [ERRO] URL da API e obrigatoria!
    pause
    exit /b 1
)

echo.
set /p ADMIN_EMAIL="Email do admin: "
if "!ADMIN_EMAIL!"=="" (
    echo [ERRO] Email e obrigatorio!
    pause
    exit /b 1
)

echo.
set /p ADMIN_PASSWORD="Senha do admin: "
if "!ADMIN_PASSWORD!"=="" (
    echo [ERRO] Senha e obrigatoria!
    pause
    exit /b 1
)

echo.
set /p PRINTER_TYPE="Tipo de impressora (thermal/system) [thermal]: "
if "!PRINTER_TYPE!"=="" set PRINTER_TYPE=thermal

if /i "!PRINTER_TYPE!"=="thermal" (
    echo.
    set /p PRINTER_IP="IP da impressora termica (ex: 192.168.1.100): "
    if "!PRINTER_IP!"=="" (
        echo [ERRO] IP da impressora e obrigatorio para impressoras termicas!
        pause
        exit /b 1
    )
    echo.
    set /p PRINTER_PORT="Porta da impressora [9100]: "
    if "!PRINTER_PORT!"=="" set PRINTER_PORT=9100
    set PRINTER_NAME=
) else (
    echo.
    set /p PRINTER_NAME="Nome da impressora no sistema (deixe vazio para padrao): "
    set PRINTER_IP=
    set PRINTER_PORT=
)

echo.
set /p HTTP_PORT="Porta do servidor HTTP local [3002]: "
if "!HTTP_PORT!"=="" set HTTP_PORT=3002

echo.
set /p ENABLE_POLLING="Habilitar polling automatico? (S/n) [S]: "
if "!ENABLE_POLLING!"=="" set ENABLE_POLLING=true
if /i "!ENABLE_POLLING!"=="s" set ENABLE_POLLING=true
if /i "!ENABLE_POLLING!"=="n" set ENABLE_POLLING=false
if /i not "!ENABLE_POLLING!"=="true" set ENABLE_POLLING=false

echo.
echo ============================================
echo   Obtendo Tokens JWT
echo ============================================
echo.

REM Obter tokens via Node.js inline
echo Executando login para obter tokens...
node -e "const axios=require('axios');axios.post('%API_URL%/api/admin/login',{email:'%ADMIN_EMAIL%',password:'%ADMIN_PASSWORD%'}).then(r=>{if(r.data.success&&r.data.data){console.log('API_TOKEN='+r.data.data.accessToken);if(r.data.data.refreshToken)console.log('REFRESH_TOKEN='+r.data.data.refreshToken);process.exit(0);}else{console.error('ERRO: Resposta invalida');process.exit(1);}}).catch(e=>{console.error('ERRO:',e.response?e.response.data?.error||e.message:e.message);process.exit(1);})" > temp_tokens.txt 2>&1

REM Verificar se obteve tokens
findstr /C:"API_TOKEN=" temp_tokens.txt >nul
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao obter tokens. Verifique as credenciais e a URL da API.
    echo.
    type temp_tokens.txt
    echo.
    echo Por favor, execute manualmente:
    echo   npm run get-token
    echo.
    del temp_tokens.txt 2>nul
    pause
    exit /b 1
)

REM Extrair tokens
for /f "tokens=2 delims==" %%a in ('findstr /C:"API_TOKEN=" temp_tokens.txt') do set API_TOKEN=%%a
for /f "tokens=2 delims==" %%a in ('findstr /C:"REFRESH_TOKEN=" temp_tokens.txt') do set REFRESH_TOKEN=%%a

del temp_tokens.txt 2>nul

if "!API_TOKEN!"=="" (
    echo [ERRO] Token nao obtido. Execute manualmente: npm run get-token
    pause
    exit /b 1
)

echo [OK] Tokens obtidos com sucesso!
echo.

echo ============================================
echo   Criando arquivo .env
echo ============================================
echo.

REM Criar arquivo .env
(
    echo # Configuracao do Printer Service
    echo # Gerado automaticamente pelo instalador
    echo.
    echo API_URL=!API_URL!
    echo API_TOKEN=!API_TOKEN!
    if not "!REFRESH_TOKEN!"=="" echo REFRESH_TOKEN=!REFRESH_TOKEN!
    echo ADMIN_EMAIL=!ADMIN_EMAIL!
    echo ADMIN_PASSWORD=!ADMIN_PASSWORD!
    echo.
    echo PRINTER_TYPE=!PRINTER_TYPE!
    if not "!PRINTER_IP!"=="" echo PRINTER_IP=!PRINTER_IP!
    if not "!PRINTER_PORT!"=="" echo PRINTER_PORT=!PRINTER_PORT!
    if not "!PRINTER_NAME!"=="" echo PRINTER_NAME=!PRINTER_NAME!
    echo.
    echo HTTP_PORT=!HTTP_PORT!
    echo ENABLE_POLLING=!ENABLE_POLLING!
    echo POLLING_INTERVAL=30000
    echo LOG_LEVEL=info
) > .env

echo [OK] Arquivo .env criado!
echo.

echo ============================================
echo   Instalando Dependencias
echo ============================================
echo.

call npm install
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao instalar dependencias!
    pause
    exit /b 1
)

echo [OK] Dependencias instaladas!
echo.

echo ============================================
echo   Compilando Projeto
echo ============================================
echo.

call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao compilar projeto!
    pause
    exit /b 1
)

echo [OK] Projeto compilado!
echo.

echo ============================================
echo   Configuracao Concluida!
echo ============================================
echo.
echo O servico esta pronto para uso!
echo.
echo Para iniciar o servico:
echo   npm start
echo.
echo Para executar em modo desenvolvimento:
echo   npm run dev
echo.
echo IMPORTANTE: Configure o Device ID no painel admin:
echo   1. Execute: npm start
echo   2. Copie o Device ID exibido nos logs
echo   3. Configure no painel admin do Cardapix
echo.
set /p START_NOW="Deseja iniciar o servico agora? (S/n): "
if /i "!START_NOW!"=="" set START_NOW=s
if /i "!START_NOW!"=="s" (
    echo.
    echo Iniciando servico...
    echo.
    call npm start
) else (
    echo.
    echo Para iniciar depois, execute: npm start
)

echo.
pause

