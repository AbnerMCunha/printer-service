#!/bin/bash

echo ""
echo "============================================"
echo "  Desinstalador do Printer Service"
echo "============================================"
echo ""

# Verificar se o serviço está rodando
if pgrep -f "node.*dist/index.js" > /dev/null; then
    echo "[AVISO] Serviço em execução detectado."
    echo ""
    read -p "Deseja parar o serviço? (S/n): " STOP_SERVICE
    if [[ ! "$STOP_SERVICE" =~ ^[Nn]$ ]]; then
        echo "Parando serviço..."
        pkill -f "node.*dist/index.js"
        sleep 2
    fi
fi

echo ""
read -p "Deseja realmente desinstalar? (s/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Ss]$ ]]; then
    echo "Desinstalação cancelada."
    exit 0
fi

echo ""
echo "Removendo arquivos..."

# Remover node_modules
if [ -d "node_modules" ]; then
    echo "  - Removendo node_modules..."
    rm -rf node_modules
fi

# Remover dist
if [ -d "dist" ]; then
    echo "  - Removendo dist..."
    rm -rf dist
fi

# Remover logs
if [ -d "logs" ]; then
    echo "  - Removendo logs..."
    rm -rf logs
fi

# Remover arquivos de configuração (opcional)
read -p "Deseja remover arquivos de configuração (.env, .device-id)? (s/N): " REMOVE_CONFIG
if [[ "$REMOVE_CONFIG" =~ ^[Ss]$ ]]; then
    if [ -f ".env" ]; then
        echo "  - Removendo .env..."
        rm -f .env
    fi
    if [ -f ".device-id" ]; then
        echo "  - Removendo .device-id..."
        rm -f .device-id
    fi
fi

echo ""
echo "[OK] Desinstalação concluída!"
echo ""
echo "Nota: O Node.js não foi removido. Se desejar, remova manualmente."
echo ""

