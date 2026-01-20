# Serviço Local de Impressão Automática

Serviço Node.js standalone que faz polling na API para detectar novos pedidos e imprimir automaticamente em impressora térmica de rede usando comandos ESC/POS.

## Características

- **🖥️ App Electron**: Interface gráfica completa para configuração e monitoramento
- **Impressão via requisição HTTP**: Frontend envia pedidos diretamente (mais rápido e eficiente)
- **Polling automático opcional**: Fallback quando frontend não está aberto
- **Login automático**: Renovação de tokens sem intervenção manual (configure ADMIN_EMAIL e ADMIN_PASSWORD)
- **Suporte a múltiplos tipos de impressora**: Térmicas (TCP/IP) e normais (spooler do sistema)
- **Formatação de recibo idêntica ao sistema web**
- **Reconexão automática em caso de falhas**
- **Logging detalhado com rotação de arquivos**
- **Shutdown graceful**

## Pré-requisitos

- Node.js 18+ instalado
- Impressora térmica de rede configurada e acessível (ou impressora do sistema)
- Credenciais de admin do sistema (email e senha)
- Acesso à API do backend

## 🎯 Formas de Instalação

### 1. 🖥️ App Electron (Mais Fácil - Recomendado para Clientes)

Interface gráfica completa - **Zero conhecimento técnico necessário!**

```bash
# Instalar dependências
npm install

# Compilar serviço
npm run build

# Executar app
npm run electron:dev

# Gerar executável (.exe, .AppImage, .dmg)
npm run build:electron
```

📖 **Veja o guia completo:** [ELECTRON_README.md](./ELECTRON_README.md)

**Vantagens:**
- ✅ Interface gráfica intuitiva
- ✅ Configuração visual (sem editar arquivos)
- ✅ Monitoramento em tempo real
- ✅ Visualização de logs
- ✅ Controle de início/parada
- ✅ Executável standalone

### 2. 🚀 Instalação Automatizada (Script)

**Para Windows:**
```bash
install.bat
```

**Para Linux/macOS:**
```bash
chmod +x install.sh
./install.sh
```

O script de instalação automatizada irá:
- ✅ Verificar se Node.js está instalado
- ✅ Instalar todas as dependências automaticamente
- ✅ Solicitar informações de configuração de forma interativa
- ✅ Fazer login automaticamente e obter tokens JWT
- ✅ Criar o arquivo `.env` com todas as configurações
- ✅ Compilar o projeto
- ✅ Iniciar o serviço (opcional)

**Tempo estimado:** 5-10 minutos

### 3. 📝 Instalação Manual

Se preferir instalar manualmente ou o script automatizado não funcionar:

#### 1. Instalar dependências

```bash
cd printer-service
npm install
```

### 2. Configurar variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e preencha com seus valores:

```bash
cp .env.example .env
```

Edite o arquivo `.env`:

```env
# URL da API
API_URL=https://api.cardapix.net

# Token JWT do admin
API_TOKEN=seu-token-jwt-aqui

# IP da impressora
PRINTER_IP=192.168.1.100

# Porta da impressora (padrão: 9100)
PRINTER_PORT=9100

# Intervalo de polling em ms (padrão: 30000)
POLLING_INTERVAL=30000
```

### 3. Configurar Autenticação

**Opção 1: Login Automático (Recomendado - Zero manutenção)**

Configure email e senha no `.env`:
```env
ADMIN_EMAIL=admin@restaurant.com
ADMIN_PASSWORD=sua-senha-aqui
```

O serviço fará login automático quando tokens expirarem. **Não precisa mais atualizar tokens manualmente!**

**Opção 2: Tokens Manuais**

Se preferir usar tokens, execute:
```bash
npm run get-token
```

Copie `API_TOKEN` e `REFRESH_TOKEN` para o `.env`.

### 4. Compilar o projeto

```bash
npm run build
```

### 5. Configurar Device ID no Painel Admin

1. Execute o serviço: `npm start`
2. Copie o Device ID exibido nos logs (últimos 8 caracteres são mostrados)
3. Acesse o painel admin do sistema
4. Vá em Configurações > Impressão Automática
5. Habilite a impressão automática
6. Cole o Device ID completo no campo "Device ID para Impressão Automática"
7. Salve as configurações

## Uso

### Executar em modo desenvolvimento

```bash
npm run dev
```

O serviço iniciará:
- **Servidor HTTP** na porta configurada (padrão: 3002)
- **Endpoint de impressão**: `http://localhost:3002/print`
- **Polling** (se habilitado) como fallback

### Executar em produção

```bash
npm start
```

## Como Funciona

### Modo Híbrido (Recomendado)

1. **Frontend aberto**: Quando a aba do admin está aberta e detecta novo pedido, envia requisição HTTP direta para o serviço local (`http://localhost:3002/print`)
   - ✅ Mais rápido (impressão imediata)
   - ✅ Menos carga no servidor (sem polling constante)
   - ✅ Mais eficiente

2. **Frontend fechado**: O serviço continua fazendo polling como fallback (se `ENABLE_POLLING=true`)
   - ✅ Funciona mesmo sem frontend aberto
   - ✅ Garante que nenhum pedido seja perdido

### Modo Apenas HTTP

Configure `ENABLE_POLLING=false` no `.env`:
- ✅ Apenas responde a requisições do frontend
- ✅ Zero polling (economia de recursos)
- ⚠️ Requer frontend aberto para funcionar

## Configuração do Autostart (Linux/Raspberry Pi)

### 1. Instalar o serviço systemd

Copie o arquivo `printer-service.service` para `/etc/systemd/system/`:

```bash
sudo cp printer-service.service /etc/systemd/system/
```

Edite o arquivo e ajuste os caminhos:

```bash
sudo nano /etc/systemd/system/printer-service.service
```

Ajuste:
- `WorkingDirectory`: Caminho completo para o diretório `printer-service`
- `ExecStart`: Caminho completo para o Node.js e o arquivo `dist/index.js`

### 2. Habilitar e iniciar o serviço

```bash
# Recarregar systemd
sudo systemctl daemon-reload

# Habilitar para iniciar no boot
sudo systemctl enable printer-service

# Iniciar o serviço
sudo systemctl start printer-service

# Verificar status
sudo systemctl status printer-service

# Ver logs
sudo journalctl -u printer-service -f
```

## Estrutura do Projeto

```
printer-service/
├── src/
│   ├── index.ts                 # Entry point principal
│   ├── config/
│   │   └── config.ts            # Configurações
│   ├── services/
│   │   ├── ApiService.ts        # Cliente HTTP para API
│   │   ├── PrinterService.ts    # Serviço de impressão
│   │   └── PollingService.ts   # Lógica de polling
│   ├── utils/
│   │   ├── receiptFormatter.ts  # Formatação do recibo
│   │   └── logger.ts            # Sistema de logs
│   └── types/
│       └── index.ts             # Tipos TypeScript
├── logs/                        # Arquivos de log (gerado automaticamente)
├── .device-id                   # Device ID (gerado automaticamente)
├── package.json
├── tsconfig.json
├── .env                         # Variáveis de ambiente (não commitado)
├── .env.example                 # Exemplo de variáveis
└── README.md
```

## Troubleshooting

### Erro: "Não foi possível conectar à API"

- Verifique se a URL da API está correta no `.env`
- Verifique se o token JWT é válido e não expirou
- Teste a conexão manualmente: `curl https://api.cardapix.net/api/health`

### Erro: "Não foi possível conectar à impressora"

- Verifique se o IP da impressora está correto
- Teste a conectividade: `ping 192.168.1.100` (substitua pelo IP da impressora)
- Teste a porta: `telnet 192.168.1.100 9100` (ou `nc -zv 192.168.1.100 9100`)
- Verifique se a impressora está ligada e na mesma rede
- Verifique o firewall do sistema

### Erro: "Device ID não corresponde"

- Verifique se o Device ID foi configurado corretamente no painel admin
- O Device ID é gerado automaticamente na primeira execução e salvo em `.device-id`
- Copie o Device ID completo (não apenas os últimos 8 caracteres)

### Erro: "Identificador inválido" ou "Win32Exception"

- Este erro pode ocorrer com impressoras IPP (Internet Printing Protocol)
- **Solução automática**: O sistema detecta este erro e usa automaticamente o comando `print` como fallback (v1.1.0+)
- Se o erro persistir:
  - Verifique se o nome da impressora está correto (use `Get-Printer` no PowerShell)
  - Verifique se a impressora está online e configurada corretamente
  - Tente definir a impressora como padrão no Windows
  - O sistema tentará ambos os métodos automaticamente (Out-Printer e print)

### Erro: "Não é possível inicializar o dispositivo" (comando print)

- Este erro ocorre quando a impressora está ocupada processando outra impressão
- **Solução**: A partir da versão 1.1.0, o sistema usa PowerShell Out-Printer primeiro, que enfileira automaticamente
- Se o erro ainda ocorrer, verifique:
  - Status da impressora (online, sem papel, etc.)
  - Nome exato da impressora no Windows
  - Permissões de impressão

### Pedidos não estão sendo impressos

- Verifique os logs em `logs/printer-service.log`
- Verifique se a impressão automática está habilitada no painel admin
- Verifique se o Device ID corresponde
- Verifique se os pedidos estão com status válido (PENDING, CONFIRMED, AWAITING_CASH_PAYMENT)
- Verifique se os pedidos não foram impressos anteriormente

### Logs não aparecem

- Verifique se o diretório `logs/` existe e tem permissões de escrita
- Verifique o nível de log no `.env` (LOG_LEVEL=debug para mais detalhes)

## Desinstalação

### Windows
```bash
uninstall.bat
```

### Linux/macOS
```bash
chmod +x uninstall.sh
./uninstall.sh
```

O script de desinstalação irá:
- ✅ Parar o serviço se estiver em execução
- ✅ Remover `node_modules` e `dist`
- ✅ Remover logs
- ✅ Opcionalmente remover arquivos de configuração (`.env`, `.device-id`)

## Desenvolvimento

### Modo desenvolvimento com watch

```bash
npm run dev
```

### Compilar TypeScript

```bash
npm run build
```

### Ver logs em tempo real

**Windows:**
```bash
type logs\printer-service.log
```

**Linux/macOS:**
```bash
tail -f logs/printer-service.log
```

## Compatibilidade

- **Impressoras**: Qualquer impressora térmica compatível com ESC/POS via TCP/IP
- **Sistemas Operacionais**: Linux, Windows, macOS
- **Node.js**: 18+

## Suporte

Para problemas ou dúvidas, consulte os logs em `logs/printer-service.log` ou entre em contato com o suporte.

