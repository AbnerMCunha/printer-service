# 🖥️ App Electron - Printer Service

Interface gráfica completa para o Printer Service, facilitando configuração e monitoramento.

## 🚀 Características

- ✅ **Interface gráfica moderna e intuitiva**
- ✅ **Configuração visual** (sem editar arquivos)
- ✅ **Monitoramento em tempo real** do status do serviço
- ✅ **Visualização de logs** em tempo real
- ✅ **Controle de início/parada** do serviço
- ✅ **Teste de conexões** integrado
- ✅ **Device ID** visível e copiável
- ✅ **Auto-refresh** de status e logs

## 📋 Pré-requisitos

- Node.js 18+
- Serviço compilado (`npm run build`)

## 🛠️ Instalação

### 1. Instalar dependências

```bash
npm install
```

### 2. Compilar o serviço

```bash
npm run build
```

### 3. Executar o app Electron

**Modo desenvolvimento:**
```bash
npm run electron:dev
```

**Modo produção (após build):**
```bash
npm run electron
```

## 📦 Gerar Executável

### Windows (.exe)

```bash
npm run build:electron
```

O executável será gerado em `release/Printer Service - Cardapix Setup x.x.x.exe`

### Linux (AppImage/Deb)

```bash
npm run build:electron
```

Serão gerados:
- `release/Printer Service - Cardapix-x.x.x.AppImage`
- `release/printer-service-x.x.x.deb`

### macOS (.dmg)

```bash
npm run build:electron
```

Será gerado: `release/Printer Service - Cardapix-x.x.x.dmg`

## 🎯 Como Usar

### 1. Configuração Inicial

1. Abra o app Electron
2. Vá para a aba **Configuração**
3. Preencha os campos:
   - **URL da API**: URL do backend (ex: `https://api.cardapix.net`)
   - **Email e Senha**: Credenciais de admin
   - **Tipo de Impressora**: Térmica ou Sistema
   - **IP/Porta ou Nome**: Dependendo do tipo
4. Clique em **💾 Salvar Configuração**
5. Clique em **🔍 Testar Conexões** para verificar

### 2. Iniciar Serviço

1. Na barra de status, clique em **▶ Iniciar**
2. O serviço será iniciado e você verá os logs em tempo real
3. O status mudará para "Serviço em execução" (indicador verde)

### 3. Monitoramento

1. Vá para a aba **Monitoramento**
2. Veja o status em tempo real:
   - Status do serviço
   - Conexão com API
   - Status da impressora
   - Device ID
3. O status é atualizado automaticamente a cada 5 segundos

### 4. Visualizar Logs

1. Vá para a aba **Logs**
2. Veja os logs do serviço em tempo real
3. Use **🔄 Atualizar Logs** para recarregar
4. Marque **Auto-scroll** para acompanhar automaticamente

### 5. Device ID

1. Após iniciar o serviço, o Device ID aparecerá na aba Configuração
2. Clique em **📋 Copiar** para copiar o ID
3. Configure no painel admin do Cardapix

## 🎨 Interface

### Aba Configuração

- Formulário completo de configuração
- Validação de campos obrigatórios
- Toggle automático entre térmica/sistema
- Botão de teste de conexões
- Exibição do Device ID

### Aba Monitoramento

- Status do serviço em tempo real
- Status da conexão com API
- Status da impressora
- Estatísticas (Device ID, etc.)
- Auto-refresh configurável

### Aba Logs

- Visualização de logs em tempo real
- Cores por tipo (info, warn, error)
- Auto-scroll configurável
- Atualização manual
- Limpeza da visualização

## 🔧 Desenvolvimento

### Estrutura do Projeto

```
printer-service/
├── electron/
│   ├── main.js              # Processo principal do Electron
│   ├── preload.js           # Script de preload (segurança)
│   └── renderer/
│       ├── index.html       # Interface HTML
│       ├── styles.css       # Estilos
│       └── renderer.js     # Lógica do frontend
├── dist/                    # Serviço compilado
└── package.json
```

### Modificar Interface

1. Edite `electron/renderer/index.html` para HTML
2. Edite `electron/renderer/styles.css` para estilos
3. Edite `electron/renderer/renderer.js` para lógica

### Adicionar Funcionalidades

1. Adicione handlers IPC em `electron/main.js`
2. Exponha APIs em `electron/preload.js`
3. Use APIs em `electron/renderer/renderer.js`

## 📝 Notas

- O app Electron gerencia o processo do serviço Node.js
- Os logs são capturados em tempo real do stdout/stderr
- O arquivo `.env` é criado/editado pela interface
- O Device ID é lido do arquivo `.device-id`

## 🐛 Troubleshooting

### App não inicia

- Verifique se o serviço foi compilado: `npm run build`
- Verifique se as dependências estão instaladas: `npm install`

### Serviço não inicia

- Verifique se o arquivo `.env` existe e está configurado
- Verifique os logs na aba Logs
- Teste manualmente: `npm start`

### Executável não funciona

- Verifique se todas as dependências estão no `package.json`
- Recompile: `npm run build && npm run build:electron`
- Verifique os logs de build

## 📦 Distribuição

Após gerar o executável:

1. **Windows**: Distribua o `.exe` gerado
2. **Linux**: Distribua o `.AppImage` ou `.deb`
3. **macOS**: Distribua o `.dmg`

O cliente só precisa:
1. Instalar o executável
2. Abrir o app
3. Configurar e iniciar

**Zero conhecimento técnico necessário!** 🎉

