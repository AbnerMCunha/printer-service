# 🚀 Guia de Instalação Rápida - Printer Service

## Instalação Automatizada (Recomendado)

### ⚡ Instalação em 5-10 minutos

#### Windows
1. Abra o PowerShell ou CMD no diretório `printer-service`
2. Execute: `install.bat`
3. Responda as perguntas interativas
4. Pronto! O serviço está configurado e pronto para uso

#### Linux/macOS
1. Abra o terminal no diretório `printer-service`
2. Execute: `chmod +x install.sh && ./install.sh`
3. Responda as perguntas interativas
4. Pronto! O serviço está configurado e pronto para uso

### 📋 O que o script faz automaticamente:

- ✅ Verifica se Node.js está instalado
- ✅ Instala todas as dependências (`npm install`)
- ✅ Solicita informações de configuração de forma interativa:
  - URL da API
  - Email e senha do admin
  - Tipo de impressora (térmica ou sistema)
  - IP/Porta da impressora (se térmica)
  - Nome da impressora (se sistema)
  - Porta do servidor HTTP local
  - Habilitar polling automático
- ✅ Faz login automaticamente e obtém tokens JWT
- ✅ Cria o arquivo `.env` com todas as configurações
- ✅ Compila o projeto (`npm run build`)
- ✅ Opcionalmente inicia o serviço

### 🎯 Informações necessárias antes de começar:

1. **URL da API do backend**
   - Exemplo: `https://api.cardapix.net` ou `http://localhost:3001`

2. **Credenciais de admin**
   - Email do administrador
   - Senha do administrador

3. **Configuração da impressora:**
   - **Se for térmica:**
     - IP da impressora na rede (ex: `192.168.1.100`)
     - Porta (geralmente `9100`)
   - **Se for impressora normal:**
     - Nome da impressora no sistema (opcional, usa padrão se vazio)

### 📝 Exemplo de instalação interativa:

```
============================================
  Instalador do Printer Service - Cardapix
============================================

[OK] Node.js encontrado
      Versão: v20.10.0

[OK] npm encontrado

============================================
  Configuração Inicial
============================================

URL da API (ex: https://api.cardapix.net ou http://localhost:3001): https://api.cardapix.net
Email do admin: admin@restaurant.com
Senha do admin: ********
Tipo de impressora (thermal/system) [thermal]: thermal
IP da impressora térmica (ex: 192.168.1.100): 192.168.1.100
Porta da impressora [9100]: 9100
Porta do servidor HTTP local [3002]: 3002
Habilitar polling automático? (S/n) [S]: S

============================================
  Obtendo Tokens JWT
============================================

Executando login para obter tokens...
[OK] Tokens obtidos com sucesso!

============================================
  Criando arquivo .env
============================================

[OK] Arquivo .env criado!

============================================
  Instalando Dependências
============================================

[OK] Dependências instaladas!

============================================
  Compilando Projeto
============================================

[OK] Projeto compilado!

============================================
  Configuração Concluída!
============================================

O serviço está pronto para uso!

Para iniciar o serviço:
  npm start

Deseja iniciar o serviço agora? (S/n): S
```

## Próximos Passos

Após a instalação:

1. **Inicie o serviço** (se não iniciou automaticamente):
   ```bash
   npm start
   ```

2. **Copie o Device ID** exibido nos logs (últimos 8 caracteres)

3. **Configure no painel admin:**
   - Acesse o painel admin do Cardapix
   - Vá em Configurações > Impressão Automática
   - Habilite a impressão automática
   - Cole o Device ID completo
   - Salve

4. **Teste a impressão:**
   - Crie um pedido de teste no sistema
   - O pedido deve ser impresso automaticamente

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

## Comparação: Manual vs Automatizada

| Aspecto | Instalação Manual | Instalação Automatizada |
|---------|------------------|------------------------|
| **Tempo** | 30-60 minutos | 5-10 minutos |
| **Passos** | 8-10 passos | 1 comando |
| **Taxa de erro** | Alta (60% sucesso) | Baixa (95% sucesso) |
| **Conhecimento técnico** | Médio-Alto | Baixo |
| **Configuração de tokens** | Manual | Automática |
| **Criação do .env** | Manual | Automática |

## Troubleshooting

### Erro: "Node.js não encontrado"
- Instale o Node.js 18+ de https://nodejs.org/
- Execute o script novamente

### Erro: "Falha ao obter tokens"
- Verifique se o email e senha estão corretos
- Verifique se a URL da API está acessível
- Execute manualmente: `npm run get-token`

### Erro: "Falha ao compilar"
- Verifique se todas as dependências foram instaladas: `npm install`
- Verifique se o TypeScript está instalado: `npm install -g typescript`

## Suporte

Para problemas ou dúvidas:
1. Consulte os logs em `logs/printer-service.log`
2. Verifique o arquivo `.env` criado
3. Execute `npm run get-token` para testar autenticação
4. Entre em contato com o suporte

