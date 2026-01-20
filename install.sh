#!/bin/bash

set -e

echo ""
echo "============================================"
echo "  Instalador do Printer Service - Cardapix"
echo "============================================"
echo ""

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "[ERRO] Node.js não encontrado!"
    echo ""
    echo "Por favor, instale o Node.js versão 18 ou superior:"
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  ou visite: https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[OK] Node.js encontrado"
NODE_VERSION=$(node --version)
echo "      Versão: $NODE_VERSION"
echo ""

# Verificar se npm está instalado
if ! command -v npm &> /dev/null; then
    echo "[ERRO] npm não encontrado!"
    exit 1
fi

echo "[OK] npm encontrado"
echo ""

# Verificar se já existe .env
if [ -f .env ]; then
    echo "[AVISO] Arquivo .env já existe."
    read -p "Deseja sobrescrever? (s/N): " OVERWRITE
    if [[ ! "$OVERWRITE" =~ ^[Ss]$ ]]; then
        echo "Instalação cancelada."
        exit 0
    fi
    echo ""
fi

echo "============================================"
echo "  Configuração Inicial"
echo "============================================"
echo ""

# Solicitar informações
read -p "URL da API (ex: https://api.cardapix.net ou http://localhost:3001): " API_URL
if [ -z "$API_URL" ]; then
    echo "[ERRO] URL da API é obrigatória!"
    exit 1
fi

echo ""
read -p "Email do admin: " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
    echo "[ERRO] Email é obrigatório!"
    exit 1
fi

echo ""
read -sp "Senha do admin: " ADMIN_PASSWORD
echo ""
if [ -z "$ADMIN_PASSWORD" ]; then
    echo "[ERRO] Senha é obrigatória!"
    exit 1
fi

echo ""
read -p "Tipo de impressora (thermal/system) [thermal]: " PRINTER_TYPE
PRINTER_TYPE=${PRINTER_TYPE:-thermal}

if [ "$PRINTER_TYPE" = "thermal" ]; then
    echo ""
    read -p "IP da impressora térmica (ex: 192.168.1.100): " PRINTER_IP
    if [ -z "$PRINTER_IP" ]; then
        echo "[ERRO] IP da impressora é obrigatório para impressoras térmicas!"
        exit 1
    fi
    echo ""
    read -p "Porta da impressora [9100]: " PRINTER_PORT
    PRINTER_PORT=${PRINTER_PORT:-9100}
    PRINTER_NAME=""
else
    echo ""
    read -p "Nome da impressora no sistema (deixe vazio para padrão): " PRINTER_NAME
    PRINTER_IP=""
    PRINTER_PORT=""
fi

echo ""
read -p "Porta do servidor HTTP local [3002]: " HTTP_PORT
HTTP_PORT=${HTTP_PORT:-3002}

echo ""
read -p "Habilitar polling automático? (S/n) [S]: " ENABLE_POLLING
ENABLE_POLLING=${ENABLE_POLLING:-true}
if [[ ! "$ENABLE_POLLING" =~ ^[Nn]$ ]]; then
    ENABLE_POLLING=true
else
    ENABLE_POLLING=false
fi

echo ""
echo "============================================"
echo "  Obtendo Tokens JWT"
echo "============================================"
echo ""

# Configurar API_URL temporariamente
export API_URL_TEMP="$API_URL"

# Obter tokens via script Node.js
echo "Fazendo login e obtendo tokens..."
TOKEN_OUTPUT=$(node -e "
const axios = require('axios');
axios.post('$API_URL/api/admin/login', {
  email: '$ADMIN_EMAIL',
  password: '$ADMIN_PASSWORD'
})
.then(r => {
  if (r.data.success && r.data.data) {
    console.log('API_TOKEN=' + r.data.data.accessToken);
    if (r.data.data.refreshToken) {
      console.log('REFRESH_TOKEN=' + r.data.data.refreshToken);
    }
  } else {
    process.exit(1);
  }
})
.catch(e => {
  console.error('ERRO:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Mensagem:', e.response.data?.error || 'Erro desconhecido');
  }
  process.exit(1);
});
" 2>&1)

if [ $? -ne 0 ]; then
    echo "[ERRO] Falha ao obter tokens. Verifique as credenciais."
    echo "$TOKEN_OUTPUT"
    exit 1
fi

# Extrair tokens
API_TOKEN=$(echo "$TOKEN_OUTPUT" | grep "^API_TOKEN=" | cut -d'=' -f2-)
REFRESH_TOKEN=$(echo "$TOKEN_OUTPUT" | grep "^REFRESH_TOKEN=" | cut -d'=' -f2-)

if [ -z "$API_TOKEN" ]; then
    echo "[ERRO] Token não obtido. Execute manualmente: npm run get-token"
    exit 1
fi

echo "[OK] Tokens obtidos com sucesso!"
echo ""

echo "============================================"
echo "  Criando arquivo .env"
echo "============================================"
echo ""

# Criar arquivo .env
cat > .env << EOF
# Configuração do Printer Service
# Gerado automaticamente pelo instalador

API_URL=$API_URL
API_TOKEN=$API_TOKEN
EOF

if [ -n "$REFRESH_TOKEN" ]; then
    echo "REFRESH_TOKEN=$REFRESH_TOKEN" >> .env
fi

cat >> .env << EOF
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD

PRINTER_TYPE=$PRINTER_TYPE
EOF

if [ -n "$PRINTER_IP" ]; then
    echo "PRINTER_IP=$PRINTER_IP" >> .env
fi

if [ -n "$PRINTER_PORT" ]; then
    echo "PRINTER_PORT=$PRINTER_PORT" >> .env
fi

if [ -n "$PRINTER_NAME" ]; then
    echo "PRINTER_NAME=$PRINTER_NAME" >> .env
fi

cat >> .env << EOF

HTTP_PORT=$HTTP_PORT
ENABLE_POLLING=$ENABLE_POLLING
POLLING_INTERVAL=30000
LOG_LEVEL=info
EOF

echo "[OK] Arquivo .env criado!"
echo ""

echo "============================================"
echo "  Instalando Dependências"
echo "============================================"
echo ""

npm install
if [ $? -ne 0 ]; then
    echo "[ERRO] Falha ao instalar dependências!"
    exit 1
fi

echo "[OK] Dependências instaladas!"
echo ""

echo "============================================"
echo "  Compilando Projeto"
echo "============================================"
echo ""

npm run build
if [ $? -ne 0 ]; then
    echo "[ERRO] Falha ao compilar projeto!"
    exit 1
fi

echo "[OK] Projeto compilado!"
echo ""

echo "============================================"
echo "  Configuração Concluída!"
echo "============================================"
echo ""
echo "O serviço está pronto para uso!"
echo ""
echo "Para iniciar o serviço:"
echo "  npm start"
echo ""
echo "Para executar em modo desenvolvimento:"
echo "  npm run dev"
echo ""
echo "IMPORTANTE: Configure o Device ID no painel admin:"
echo "  1. Execute: npm start"
echo "  2. Copie o Device ID exibido nos logs"
echo "  3. Configure no painel admin do Cardapix"
echo ""

read -p "Deseja iniciar o serviço agora? (S/n): " START_NOW
if [[ ! "$START_NOW" =~ ^[Nn]$ ]]; then
    echo ""
    echo "Iniciando serviço..."
    echo ""
    npm start
else
    echo ""
    echo "Para iniciar depois, execute: npm start"
fi

echo ""

