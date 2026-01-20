# 🚀 Auto-Start - Printer Service

Este documento explica como configurar o Printer Service para iniciar automaticamente ao ligar o PC.

## 📋 Método Implementado: Task Scheduler

O serviço usa o **Agendador de Tarefas do Windows** para iniciar automaticamente quando você faz login.

### ✅ Vantagens

- ✅ Nativo do Windows (sem dependências externas)
- ✅ Configuração automática durante instalação
- ✅ Reinicia automaticamente até 3 vezes se falhar
- ✅ Funciona mesmo sem o usuário estar logado (após login)
- ✅ Pode ser gerenciado via interface do Windows

---

## 🎯 Configuração Automática

### Durante a Instalação

Quando você executa `install.bat`, o instalador pergunta se deseja configurar auto-start:

```
Deseja configurar para iniciar automaticamente ao ligar o PC? (S/n) [S]:
```

Responda **S** (ou Enter) para configurar automaticamente.

### Configuração Manual

Se você pulou a configuração durante a instalação, pode configurar depois:

```powershell
# Na pasta printer-service
powershell.exe -ExecutionPolicy Bypass -File scripts\setup-autostart.ps1
```

---

## 🔧 Gerenciamento

### Ver Status da Tarefa

```powershell
Get-ScheduledTask -TaskName "PrinterService-Cardapix"
```

### Iniciar Manualmente

```powershell
Start-ScheduledTask -TaskName "PrinterService-Cardapix"
```

### Parar o Serviço

```powershell
Stop-ScheduledTask -TaskName "PrinterService-Cardapix"
```

### Remover Auto-Start

```powershell
# Via script
powershell.exe -ExecutionPolicy Bypass -File scripts\remove-autostart.ps1

# Ou manualmente
Unregister-ScheduledTask -TaskName "PrinterService-Cardapix" -Confirm:$false
```

---

## 🖥️ Interface Gráfica do Windows

Você também pode gerenciar a tarefa pela interface do Windows:

1. Pressione `Win + R`
2. Digite `taskschd.msc` e pressione Enter
3. Procure por **"PrinterService-Cardapix"** na lista
4. Clique com botão direito para:
   - Executar
   - Desabilitar/Habilitar
   - Propriedades
   - Excluir

---

## ⚙️ Configurações da Tarefa

A tarefa é configurada com:

- **Trigger**: Ao fazer login no Windows
- **Ação**: Executar `node dist/index.js`
- **Reinício**: Até 3 vezes se falhar (com intervalo de 1 minuto)
- **Permissões**: Executa com permissões do usuário atual
- **Bateria**: Funciona mesmo em modo bateria

---

## ❓ Problemas Comuns

### Tarefa não inicia automaticamente

1. **Verifique se a tarefa está habilitada:**
   ```powershell
   Get-ScheduledTask -TaskName "PrinterService-Cardapix" | Select-Object State
   ```
   Deve mostrar `Ready` ou `Running`

2. **Verifique os logs da tarefa:**
   - Abra o Agendador de Tarefas (`taskschd.msc`)
   - Encontre a tarefa "PrinterService-Cardapix"
   - Clique em "Histórico" para ver erros

3. **Verifique se o projeto foi compilado:**
   ```bash
   npm run build
   ```

4. **Verifique se o arquivo .env existe:**
   ```bash
   # Deve existir o arquivo .env na pasta printer-service
   ```

### Erro de Permissões

Se você receber erro de permissões:

1. Execute o PowerShell como **Administrador**
2. Execute o script novamente:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File scripts\setup-autostart.ps1
   ```

### Tarefa não aparece no Agendador

1. Verifique se foi criada:
   ```powershell
   Get-ScheduledTask -TaskName "PrinterService-Cardapix"
   ```

2. Se não aparecer, recrie a tarefa:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File scripts\setup-autostart.ps1
   ```

---

## 📝 Notas Importantes

- ⚠️ A tarefa inicia **após o login**, não antes
- ⚠️ Se o Node.js não estiver no PATH, a tarefa pode falhar
- ⚠️ A tarefa usa o diretório de trabalho configurado (pasta printer-service)
- ⚠️ Se você mover a pasta do projeto, será necessário recriar a tarefa

---

## 🔄 Atualizar Configuração

Se você mudou a localização do projeto ou reinstalou:

1. Remova a tarefa antiga:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File scripts\remove-autostart.ps1
   ```

2. Recrie a tarefa:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File scripts\setup-autostart.ps1
   ```

---

## 📞 Suporte

Se tiver problemas:

1. Verifique os logs em `logs/printer-service.log`
2. Verifique o histórico da tarefa no Agendador de Tarefas
3. Execute o serviço manualmente para ver erros:
   ```bash
   npm start
   ```

---

## 🎉 Pronto!

Agora o Printer Service iniciará automaticamente toda vez que você fizer login no Windows! 🚀
