const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const axios = require('axios');
const os = require('os');

let mainWindow = null;
let serviceProcess = null;
let isServiceRunning = false;

// Criar janela principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../assets/icon.png'), // Opcional: adicionar ícone
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'default',
    show: false, // Não mostrar até carregar
  });

  // Carregar interface
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Mostrar quando pronto
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Fechar processo quando janela fechar
  mainWindow.on('closed', () => {
    mainWindow = null;
    stopService();
  });
}

// Iniciar serviço
function startService() {
  if (isServiceRunning) {
    return { success: false, message: 'Serviço já está em execução' };
  }

  const servicePath = path.join(__dirname, '../dist/index.js');
  
  if (!fs.existsSync(servicePath)) {
    return { success: false, message: 'Serviço não compilado. Execute: npm run build' };
  }

  // Verificar se .env existe
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    return { success: false, message: 'Arquivo .env não encontrado. Configure primeiro.' };
  }

  // Carregar variáveis de ambiente
  const dotenv = require('dotenv');
  const envConfig = dotenv.config({ path: envPath });
  const envVars = envConfig.parsed || {};

  // Validar configurações obrigatórias antes de iniciar
  if (!envVars.API_URL) {
    return { success: false, message: 'API_URL não configurado no .env. Configure primeiro.' };
  }
  
  if (!envVars.API_TOKEN && !envVars.ADMIN_EMAIL) {
    return { 
      success: false, 
      message: 'API_TOKEN ou ADMIN_EMAIL/ADMIN_PASSWORD não configurados no .env. Configure primeiro.' 
    };
  }

  try {
    serviceProcess = spawn('node', [servicePath], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ...envVars },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    isServiceRunning = true;

    // Capturar logs
    serviceProcess.stdout.on('data', (data) => {
      const log = data.toString();
      if (mainWindow) {
        mainWindow.webContents.send('service-log', log);
      }
    });

    serviceProcess.stderr.on('data', (data) => {
      const log = data.toString();
      if (mainWindow) {
        mainWindow.webContents.send('service-log', log);
      }
    });

    serviceProcess.on('exit', (code) => {
      isServiceRunning = false;
      serviceProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('service-status', { running: false, exitCode: code });
      }
    });

    // Aguardar um pouco para verificar se iniciou corretamente
    setTimeout(() => {
      if (serviceProcess && !serviceProcess.killed) {
        if (mainWindow) {
          mainWindow.webContents.send('service-status', { running: true });
        }
      }
    }, 2000);

    return { success: true, message: 'Serviço iniciado' };
  } catch (error) {
    isServiceRunning = false;
    return { success: false, message: `Erro ao iniciar: ${error.message}` };
  }
}

// Parar serviço
function stopService() {
  if (!isServiceRunning || !serviceProcess) {
    // Se o flag diz que não está rodando mas há processo, limpar
    if (serviceProcess) {
      try {
        serviceProcess.kill('SIGTERM');
      } catch (e) {
        // Ignorar erro
      }
      serviceProcess = null;
    }
    isServiceRunning = false;
    return { success: false, message: 'Serviço não está em execução' };
  }

  try {
    // Marcar como não rodando imediatamente para evitar múltiplas chamadas
    isServiceRunning = false;
    const processToKill = serviceProcess;
    serviceProcess = null;
    
    if (!processToKill || processToKill.killed) {
      return { success: true, message: 'Serviço já estava parado' };
    }

    // Tentar parar graciosamente primeiro
    processToKill.kill('SIGTERM');
    
    // Se não parar em 3 segundos, forçar parada
    const forceKillTimeout = setTimeout(() => {
      if (processToKill && !processToKill.killed) {
        try {
          // Windows: usar SIGKILL ou kill com força
          if (os.platform() === 'win32') {
            // No Windows, usar taskkill para garantir
            exec(`taskkill /F /T /PID ${processToKill.pid}`, (error) => {
              // Ignorar erro se processo já foi finalizado
            });
          } else {
            processToKill.kill('SIGKILL');
          }
        } catch (e) {
          // Ignorar erro
        }
      }
    }, 3000);

    // Limpar timeout se processo parar antes
    processToKill.on('exit', () => {
      clearTimeout(forceKillTimeout);
    });
    
    // Notificar interface imediatamente
    if (mainWindow) {
      mainWindow.webContents.send('service-status', { running: false });
    }
    
    return { success: true, message: 'Serviço parado' };
  } catch (error) {
    isServiceRunning = false;
    serviceProcess = null;
    return { success: false, message: `Erro ao parar: ${error.message}` };
  }
}

// Verificar status do serviço
async function checkServiceStatus() {
  try {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) {
      return { running: false, configured: false };
    }

    const dotenv = require('dotenv');
    const envConfig = dotenv.config({ path: envPath });
    const env = envConfig.parsed || {};
    const httpPort = env.HTTP_PORT || 3002;

    // Tentar conectar ao endpoint de health
    const response = await axios.get(`http://localhost:${httpPort}/health`, {
      timeout: 2000,
    });

    return {
      running: response.status === 200,
      configured: true,
      data: response.data,
    };
  } catch (error) {
    return {
      running: isServiceRunning,
      configured: fs.existsSync(path.join(__dirname, '../.env')),
    };
  }
}

// Ler arquivo .env
function readEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();
        if (key) {
          env[key] = value;
        }
      }
    }
  });

  return env;
}

// Salvar arquivo .env
function saveEnv(envData) {
  const envPath = path.join(__dirname, '../.env');
  let content = '# Configuração do Printer Service\n';
  content += '# Gerado pelo App Electron\n\n';

  // Log para debug
  console.log('Salvando .env com dados:', Object.keys(envData));
  if (envData.PRINTER_TYPE === 'thermal') {
    console.log('Tipo: thermal');
    console.log('PRINTER_IP:', envData.PRINTER_IP || '(não definido)');
    console.log('PRINTER_NAME:', envData.PRINTER_NAME || '(não definido)');
    console.log('PRINTER_PORT:', envData.PRINTER_PORT || '(não definido)');
  }

  Object.entries(envData).forEach(([key, value]) => {
    // Ignorar valores undefined, null, string vazia ou apenas espaços
    if (value !== undefined && value !== null && value !== '' && String(value).trim() !== '') {
      content += `${key}=${String(value).trim()}\n`;
    }
  });

  // Log do conteúdo final (sem valores sensíveis)
  console.log('Conteúdo do .env (sem valores sensíveis):');
  const lines = content.split('\n');
  lines.forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key] = line.split('=');
      if (key && !['API_TOKEN', 'REFRESH_TOKEN', 'ADMIN_PASSWORD'].includes(key)) {
        console.log(`  ${line}`);
      }
    }
  });

  fs.writeFileSync(envPath, content, 'utf-8');
  return { success: true };
}

// Ler logs do serviço
function readLogs(lines = 100) {
  const logPath = path.join(__dirname, '../logs/printer-service.log');
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, 'utf-8');
  const allLines = content.split('\n').filter((line) => line.trim());
  return allLines.slice(-lines);
}

// Limpar arquivo de logs
function clearLogs() {
  try {
    const logPath = path.join(__dirname, '../logs/printer-service.log');
    const errorLogPath = path.join(__dirname, '../logs/printer-service-error.log');
    
    // Limpar arquivo de log principal
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '', 'utf-8');
    }
    
    // Limpar arquivo de erro (opcional, mas recomendado)
    if (fs.existsSync(errorLogPath)) {
      fs.writeFileSync(errorLogPath, '', 'utf-8');
    }
    
    return { success: true, message: 'Logs limpos com sucesso' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Ler Device ID
function readDeviceId() {
  const deviceIdPath = path.join(__dirname, '../.device-id');
  if (!fs.existsSync(deviceIdPath)) {
    return null;
  }
  return fs.readFileSync(deviceIdPath, 'utf-8').trim();
}

// Funções para gerenciar auto-start
function getAutoStartStatus() {
  try {
    const settings = app.getLoginItemSettings();
    return {
      enabled: settings.openAtLogin,
      openAsHidden: settings.openAsHidden || false
    };
  } catch (error) {
    return {
      enabled: false,
      error: error.message
    };
  }
}

function setupTaskScheduler() {
  return new Promise((resolve) => {
    // Só funciona no Windows
    if (os.platform() !== 'win32') {
      resolve({ success: false, error: 'Task Scheduler só está disponível no Windows' });
      return;
    }

    try {
      const scriptPath = path.join(__dirname, '../scripts/setup-autostart.ps1');
      
      if (!fs.existsSync(scriptPath)) {
        resolve({ success: false, error: 'Script setup-autostart.ps1 não encontrado' });
        return;
      }

      // Executar script PowerShell
      exec(
        `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`,
        { cwd: path.join(__dirname, '..') },
        (error, stdout, stderr) => {
          if (error) {
            console.error('Erro ao configurar Task Scheduler:', error);
            resolve({ success: false, error: error.message });
            return;
          }

          if (stderr && !stderr.includes('✅')) {
            console.warn('Aviso ao configurar Task Scheduler:', stderr);
          }

          resolve({ success: true, message: 'Task Scheduler configurado' });
        }
      );
    } catch (error) {
      console.error('Erro ao configurar Task Scheduler:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

async function setAutoStart(enabled) {
  try {
    // Configurar auto-start do Electron
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false, // Pode mudar para true se quiser iniciar minimizado
      name: 'Printer Service - Cardapix',
      path: process.execPath,
      args: []
    });

    // Se habilitando, também configurar Task Scheduler para garantir que o serviço inicie
    if (enabled && os.platform() === 'win32') {
      const taskResult = await setupTaskScheduler();
      if (!taskResult.success) {
        console.warn('Não foi possível configurar Task Scheduler:', taskResult.error);
        // Não falhar, apenas avisar - o Electron auto-start ainda funcionará
      }
    }

    return { success: true, enabled };
  } catch (error) {
    return { success: false, error: error.message, enabled: false };
  }
}

// Handlers IPC
ipcMain.handle('start-service', () => {
  return startService();
});

ipcMain.handle('stop-service', () => {
  return stopService();
});

ipcMain.handle('check-service-status', async () => {
  return await checkServiceStatus();
});

ipcMain.handle('read-env', () => {
  return readEnv();
});

ipcMain.handle('save-env', (event, envData) => {
  return saveEnv(envData);
});

ipcMain.handle('read-logs', (event, lines) => {
  return readLogs(lines);
});

ipcMain.handle('read-device-id', () => {
  return readDeviceId();
});

ipcMain.handle('copy-to-clipboard', (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-logs', () => {
  return clearLogs();
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result;
});

// Handlers para auto-start
ipcMain.handle('get-auto-start-status', () => {
  return getAutoStartStatus();
});

ipcMain.handle('set-auto-start', (event, enabled) => {
  return setAutoStart(enabled);
});

// Quando app estiver pronto
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Fechar quando todas as janelas fecharem (exceto macOS)
app.on('window-all-closed', () => {
  stopService();
  if (os.platform() !== 'darwin') {
    app.quit();
  }
});

// Parar serviço ao sair
app.on('before-quit', () => {
  stopService();
});

