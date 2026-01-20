# ⚡ Início Rápido - Printer Service

## 🎯 Escolha sua forma de instalação:

### 1️⃣ App Electron (Mais Fácil) ⭐ RECOMENDADO

**Para clientes sem conhecimento técnico**

1. **Instalar dependências:**
   ```bash
   npm install
   ```

2. **Compilar e executar:**
   ```bash
   npm run electron:dev
   ```

3. **Configurar na interface gráfica:**
   - Preencha URL da API, email, senha
   - Configure impressora
   - Clique em "Salvar"
   - Clique em "Iniciar"

4. **Gerar executável (opcional):**
   ```bash
   npm run build:electron
   ```

📖 **Guia completo:** [ELECTRON_README.md](./ELECTRON_README.md)

---

### 2️⃣ Script Automatizado

**Para instalação rápida via linha de comando**

**Windows:**
```bash
install.bat
```

**Linux/macOS:**
```bash
chmod +x install.sh
./install.sh
```

📖 **Guia completo:** [INSTALL_GUIDE.md](./INSTALL_GUIDE.md)

---

### 3️⃣ Instalação Manual

**Para controle total**

1. Instalar dependências: `npm install`
2. Copiar `.env.example` para `.env`
3. Configurar `.env` manualmente
4. Obter tokens: `npm run get-token`
5. Compilar: `npm run build`
6. Iniciar: `npm start`

📖 **Guia completo:** [README.md](./README.md)

---

## 🚀 Comparação Rápida

| Método | Facilidade | Tempo | Conhecimento Técnico |
|--------|-----------|-------|---------------------|
| **App Electron** | ⭐⭐⭐⭐⭐ | 5 min | Nenhum |
| **Script Automatizado** | ⭐⭐⭐⭐ | 5-10 min | Básico |
| **Manual** | ⭐⭐ | 30-60 min | Médio |

---

## 📋 O que você precisa antes de começar:

- ✅ Node.js 18+ instalado
- ✅ URL da API do backend
- ✅ Email e senha de admin
- ✅ IP da impressora (se térmica) ou nome (se sistema)

---

## 🎉 Pronto!

Após instalar e configurar:

1. **Copie o Device ID** (aparece nos logs ou na interface)
2. **Configure no painel admin** do Cardapix
3. **Teste criando um pedido**

---

## ❓ Precisa de ajuda?

- 📖 [README.md](./README.md) - Documentação completa
- 📖 [ELECTRON_README.md](./ELECTRON_README.md) - Guia do App Electron
- 📖 [INSTALL_GUIDE.md](./INSTALL_GUIDE.md) - Guia de instalação automatizada

