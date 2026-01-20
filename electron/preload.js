const { contextBridge, ipcRenderer } = require('electron');

// Expor APIs seguras para o renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Controle do serviço
  startService: () => ipcRenderer.invoke('start-service'),
  stopService: () => ipcRenderer.invoke('stop-service'),
  checkServiceStatus: () => ipcRenderer.invoke('check-service-status'),

  // Configuração
  readEnv: () => ipcRenderer.invoke('read-env'),
  saveEnv: (envData) => ipcRenderer.invoke('save-env', envData),
  readDeviceId: () => ipcRenderer.invoke('read-device-id'),

  // Logs
  readLogs: (lines) => ipcRenderer.invoke('read-logs', lines),

  // Eventos
  onServiceLog: (callback) => {
    ipcRenderer.on('service-log', (event, data) => callback(data));
  },
  onServiceStatus: (callback) => {
    ipcRenderer.on('service-status', (event, data) => callback(data));
  },

  // Utilitários
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),

  // Remover listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

