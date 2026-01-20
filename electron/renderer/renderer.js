// Estado da aplicação
let currentTab = 'config';
let autoRefreshInterval = null;
let autoScrollLogs = true;

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  initializeTabs();
  initializeConfigForm();
  initializeServiceControls();
  initializeMonitor();
  initializeLogs();
  await loadConfiguration();
  await checkInitialStatus();
});

// ========== TABS ==========
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;

      // Atualizar botões
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // Atualizar painéis
      tabPanes.forEach((p) => p.classList.remove('active'));
      document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');

      currentTab = tabName;

      // Carregar dados da aba
      if (tabName === 'monitor') {
        refreshMonitor();
      } else if (tabName === 'logs') {
        refreshLogs();
      }
    });
  });
}

// ========== CONFIGURAÇÃO ==========
function initializeConfigForm() {
  const form = document.getElementById('configForm');
  const printerType = document.getElementById('printerType');
  const thermalConfig = document.getElementById('thermalConfig');
  const systemConfig = document.getElementById('systemConfig');
  const thermalConnection = document.getElementById('thermalConnection');
  const networkConfig = document.getElementById('networkConfig');
  const usbConfig = document.getElementById('usbConfig');

  // Toggle entre térmica e sistema
  printerType.addEventListener('change', () => {
    if (printerType.value === 'thermal') {
      thermalConfig.style.display = 'block';
      systemConfig.style.display = 'none';
      updateThermalConnectionFields();
    } else {
      thermalConfig.style.display = 'none';
      systemConfig.style.display = 'block';
      document.getElementById('printerIp').required = false;
      document.getElementById('printerName').required = false;
      const printerNameUsb = document.getElementById('printerNameUsb');
      if (printerNameUsb) printerNameUsb.required = false;
    }
  });

  // Toggle entre rede e USB/COM para térmicas
  if (thermalConnection) {
    thermalConnection.addEventListener('change', () => {
      updateThermalConnectionFields();
    });
  }

  function updateThermalConnectionFields() {
    if (thermalConnection.value === 'network') {
      networkConfig.style.display = 'block';
      usbConfig.style.display = 'none';
      document.getElementById('printerIp').required = true;
      document.getElementById('printerPort').required = false;
      const printerNameUsb = document.getElementById('printerNameUsb');
      if (printerNameUsb) printerNameUsb.required = false;
    } else {
      networkConfig.style.display = 'none';
      usbConfig.style.display = 'block';
      document.getElementById('printerIp').required = false;
      document.getElementById('printerPort').required = false;
      const printerNameUsb = document.getElementById('printerNameUsb');
      if (printerNameUsb) printerNameUsb.required = true;
    }
  }

  // Salvar configuração
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveConfiguration();
  });

  // Testar conexões
  document.getElementById('btnTestConnection').addEventListener('click', async () => {
    await testConnections();
  });

  // Copiar Device ID
  document.getElementById('btnCopyDeviceId').addEventListener('click', () => {
    const deviceId = document.getElementById('deviceIdValue').textContent;
    navigator.clipboard.writeText(deviceId).then(() => {
      alert('Device ID copiado para a área de transferência!');
    });
  });

  // Auto-start checkbox
  const autoStartCheckbox = document.getElementById('autoStartEnabled');
  if (autoStartCheckbox) {
    autoStartCheckbox.addEventListener('change', async () => {
      await saveAutoStartStatus();
    });
  }
}

async function loadConfiguration() {
  try {
    const env = await window.electronAPI.readEnv();
    if (!env) {
      return;
    }

    // Preencher formulário
    Object.keys(env).forEach((key) => {
      const input = document.querySelector(`[name="${key}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          input.checked = env[key] === 'true';
        } else {
          input.value = env[key];
        }
      }
    });

    // Configurar tipo de conexão térmica (rede ou USB/COM)
    if (env.PRINTER_TYPE === 'thermal') {
      const thermalConnection = document.getElementById('thermalConnection');
      if (thermalConnection) {
        if (env.PRINTER_IP) {
          thermalConnection.value = 'network';
        } else if (env.PRINTER_NAME) {
          thermalConnection.value = 'usb';
          // Copiar valor para o campo USB se existir
          const printerNameUsb = document.getElementById('printerNameUsb');
          if (printerNameUsb && !printerNameUsb.value) {
            printerNameUsb.value = env.PRINTER_NAME;
          }
        }
      }
    }

    // Trigger change para atualizar visibilidade
    document.getElementById('printerType').dispatchEvent(new Event('change'));
    const thermalConnection = document.getElementById('thermalConnection');
    if (thermalConnection) {
      thermalConnection.dispatchEvent(new Event('change'));
    }

    // Carregar Device ID
    const deviceId = await window.electronAPI.readDeviceId();
    if (deviceId) {
      document.getElementById('deviceIdValue').textContent = deviceId;
      document.getElementById('deviceIdSection').style.display = 'block';
    }

    // Carregar status do auto-start
    await loadAutoStartStatus();
  } catch (error) {
    console.error('Erro ao carregar configuração:', error);
  }
}

async function saveConfiguration() {
  try {
    const form = document.getElementById('configForm');
    const formData = new FormData(form);
    const envData = {};

    // Limpar campos não usados baseado no tipo de conexão térmica ANTES de coletar
    const thermalConnection = document.getElementById('thermalConnection');
    const printerType = formData.get('PRINTER_TYPE');
    
    // Coletar dados do formulário (filtrar valores vazios e campos ocultos)
    for (const [key, value] of formData.entries()) {
      // Ignorar THERMAL_CONNECTION (é apenas para UI)
      if (key === 'THERMAL_CONNECTION') {
        continue;
      }
      
      // Para impressora térmica, filtrar campos baseado no tipo de conexão
      if (printerType === 'thermal' && thermalConnection) {
        const connectionType = thermalConnection.value;
        
        // Se for rede, ignorar PRINTER_NAME de campos USB
        if (connectionType === 'network') {
          if (key === 'PRINTER_NAME') {
            const printerNameUsb = document.getElementById('printerNameUsb');
            if (printerNameUsb && formData.get('PRINTER_NAME') === printerNameUsb.value) {
              continue; // Ignorar PRINTER_NAME do campo USB
            }
          }
        }
        
        // Se for USB/COM, ignorar PRINTER_IP e PRINTER_PORT
        if (connectionType === 'usb') {
          if (key === 'PRINTER_IP' || key === 'PRINTER_PORT') {
            continue;
          }
          // Garantir que PRINTER_NAME vem do campo USB
          if (key === 'PRINTER_NAME') {
            const printerNameUsb = document.getElementById('printerNameUsb');
            if (printerNameUsb && printerNameUsb.value && printerNameUsb.value.trim() !== '') {
              envData[key] = printerNameUsb.value.trim();
            }
            continue;
          }
        }
      }
      
      // Ignorar valores vazios ou apenas espaços
      if (value && String(value).trim() !== '') {
        envData[key] = String(value).trim();
      }
    }

    // Adicionar checkboxes
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      if (cb.name) {
        envData[cb.name] = cb.checked ? 'true' : 'false';
      }
    });

    // Garantir que PRINTER_NAME está correto para USB/COM
    if (printerType === 'thermal' && thermalConnection && thermalConnection.value === 'usb') {
      const printerNameUsb = document.getElementById('printerNameUsb');
      if (printerNameUsb && printerNameUsb.value && printerNameUsb.value.trim() !== '') {
        envData.PRINTER_NAME = printerNameUsb.value.trim();
      }
      // Garantir que PRINTER_IP e PRINTER_PORT não estão presentes
      delete envData.PRINTER_IP;
      delete envData.PRINTER_PORT;
    }

    // Salvar
    const result = await window.electronAPI.saveEnv(envData);
    if (result.success) {
      alert('✅ Configuração salva com sucesso!');
      
      // Recarregar Device ID se disponível
      const deviceId = await window.electronAPI.readDeviceId();
      if (deviceId) {
        document.getElementById('deviceIdValue').textContent = deviceId;
        document.getElementById('deviceIdSection').style.display = 'block';
      }
    } else {
      alert('❌ Erro ao salvar configuração');
    }
  } catch (error) {
    console.error('Erro ao salvar:', error);
    alert('❌ Erro ao salvar configuração: ' + error.message);
  }
}

// ========== AUTO-START ==========
async function loadAutoStartStatus() {
  try {
    const status = await window.electronAPI.getAutoStartStatus();
    const checkbox = document.getElementById('autoStartEnabled');
    const statusBox = document.getElementById('autoStartStatus');
    const statusText = document.getElementById('autoStartStatusText');
    
    if (checkbox) {
      checkbox.checked = status.enabled || false;
    }
    
    if (statusBox && statusText) {
      if (status.enabled) {
        statusBox.style.display = 'block';
        statusBox.className = 'info-box';
        statusText.innerHTML = '✅ <strong>Auto-start habilitado!</strong> O aplicativo iniciará automaticamente ao fazer login.';
      } else if (status.error) {
        statusBox.style.display = 'block';
        statusBox.className = 'info-box';
        statusText.innerHTML = '⚠️ <strong>Erro ao verificar status:</strong> ' + status.error;
      } else {
        statusBox.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Erro ao carregar status do auto-start:', error);
  }
}

async function saveAutoStartStatus() {
  try {
    const checkbox = document.getElementById('autoStartEnabled');
    if (!checkbox) return;
    
    const enabled = checkbox.checked;
    const statusBox = document.getElementById('autoStartStatus');
    const statusText = document.getElementById('autoStartStatusText');
    
    // Mostrar loading
    if (statusBox && statusText) {
      statusBox.style.display = 'block';
      statusBox.className = 'info-box';
      statusText.innerHTML = '⏳ Configurando auto-start...';
    }
    
    const result = await window.electronAPI.setAutoStart(enabled);
    
    if (result.success) {
      if (statusBox && statusText) {
        if (enabled) {
          statusBox.className = 'info-box';
          statusText.innerHTML = '✅ <strong>Auto-start habilitado!</strong> O aplicativo iniciará automaticamente ao fazer login no Windows.';
        } else {
          statusBox.className = 'info-box';
          statusText.innerHTML = 'ℹ️ <strong>Auto-start desabilitado.</strong> O aplicativo não iniciará automaticamente.';
        }
      }
    } else {
      checkbox.checked = !enabled; // Reverter checkbox
      if (statusBox && statusText) {
        statusBox.className = 'info-box';
        statusText.innerHTML = '❌ <strong>Erro ao configurar auto-start:</strong> ' + (result.error || 'Erro desconhecido');
      }
      alert('❌ Erro ao configurar auto-start: ' + (result.error || 'Erro desconhecido'));
    }
  } catch (error) {
    console.error('Erro ao salvar auto-start:', error);
    const checkbox = document.getElementById('autoStartEnabled');
    if (checkbox) {
      checkbox.checked = !checkbox.checked; // Reverter checkbox
    }
    alert('❌ Erro ao configurar auto-start: ' + error.message);
  }
}

async function testConnections() {
  const btn = document.getElementById('btnTestConnection');
  btn.disabled = true;
  btn.textContent = '⏳ Testando...';

  try {
    const status = await window.electronAPI.checkServiceStatus();
    let message = '';

    if (status.configured) {
      message += '✅ Configuração encontrada\n';
    } else {
      message += '❌ Configuração não encontrada\n';
    }

    if (status.running) {
      message += '✅ Serviço em execução\n';
      if (status.data) {
        message += `✅ Device ID: ${status.data.deviceId}\n`;
        message += `✅ Impressora: ${status.data.printerConnected ? 'Conectada' : 'Desconectada'}\n`;
      }
    } else {
      message += '⚠️ Serviço não está em execução\n';
    }

    alert(message);
  } catch (error) {
    alert('❌ Erro ao testar conexões: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Testar Conexões';
  }
}

// ========== CONTROLE DO SERVIÇO ==========
function initializeServiceControls() {
  document.getElementById('btnStart').addEventListener('click', async () => {
    await startService();
  });

  document.getElementById('btnStop').addEventListener('click', async () => {
    await stopService();
  });

  // Listener para status do serviço
  window.electronAPI.onServiceStatus((status) => {
    updateServiceStatus(status.running);
  });

  // Listener para logs em tempo real
  window.electronAPI.onServiceLog((log) => {
    appendLog(log);
  });
}

async function startService() {
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');

  btnStart.disabled = true;
  btnStart.textContent = '⏳ Salvando e iniciando...';

  try {
    // Salvar configurações antes de iniciar
    const form = document.getElementById('configForm');
    if (form) {
      const formData = new FormData(form);
      const envData = {};

      // Coletar dados do formulário
      for (const [key, value] of formData.entries()) {
        envData[key] = value;
      }

      // Adicionar checkboxes
      const checkboxes = form.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((cb) => {
        if (cb.name) {
          envData[cb.name] = cb.checked ? 'true' : 'false';
        }
      });

      // Salvar configuração
      const saveResult = await window.electronAPI.saveEnv(envData);
      if (!saveResult.success) {
        alert('⚠️ Aviso: Não foi possível salvar as configurações. O serviço será iniciado com as configurações anteriores.');
      }
    }

    // Salvar auto-start se configurado
    const autoStartCheckbox = document.getElementById('autoStartEnabled');
    if (autoStartCheckbox) {
      await saveAutoStartStatus();
    }

    // Iniciar serviço
    btnStart.textContent = '⏳ Iniciando...';
    const result = await window.electronAPI.startService();
    if (result.success) {
      updateServiceStatus(true);
      alert('✅ ' + result.message);
    } else {
      alert('❌ ' + result.message);
    }
  } catch (error) {
    alert('❌ Erro ao iniciar serviço: ' + error.message);
  } finally {
    btnStart.disabled = false;
    btnStart.textContent = '▶ Iniciar';
  }
}

async function stopService() {
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');

  btnStop.disabled = true;
  btnStop.textContent = '⏳ Parando...';

  try {
    const result = await window.electronAPI.stopService();
    if (result.success) {
      updateServiceStatus(false);
      alert('✅ ' + result.message);
    } else {
      alert('❌ ' + result.message);
    }
  } catch (error) {
    alert('❌ Erro ao parar serviço: ' + error.message);
  } finally {
    btnStop.disabled = false;
    btnStop.textContent = '⏹ Parar';
  }
}

function updateServiceStatus(running) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = indicator.querySelector('.status-text');
  const statusDot = indicator.querySelector('.status-dot');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');

  statusDot.className = 'status-dot';
  btnStart.disabled = running;
  btnStop.disabled = !running;

  if (running) {
    statusDot.classList.add('running');
    statusText.textContent = 'Serviço em execução';
  } else {
    statusDot.classList.add('stopped');
    statusText.textContent = 'Serviço parado';
  }
}

async function checkInitialStatus() {
  try {
    const status = await window.electronAPI.checkServiceStatus();
    updateServiceStatus(status.running);
    
    // Sempre tentar iniciar o serviço se não estiver rodando e estiver configurado
    // Isso garante que o serviço inicie mesmo se o Task Scheduler não funcionar
    if (!status.running && status.configured) {
      // Aguardar um pouco para garantir que a interface está pronta
      setTimeout(async () => {
        try {
          console.log('🚀 Iniciando serviço automaticamente...');
          const result = await window.electronAPI.startService();
          if (result.success) {
            console.log('✅ Serviço iniciado automaticamente com sucesso');
            updateServiceStatus(true);
          } else {
            console.warn('⚠️ Não foi possível iniciar serviço automaticamente:', result.message);
          }
        } catch (error) {
          console.error('Erro ao iniciar serviço automaticamente:', error);
        }
      }, 2000); // 2 segundos de delay para garantir que tudo está carregado
    } else if (status.running) {
      console.log('✅ Serviço já está em execução');
    } else if (!status.configured) {
      console.log('ℹ️ Serviço não configurado ainda');
    }
  } catch (error) {
    console.error('Erro ao verificar status:', error);
  }
}

// ========== MONITORAMENTO ==========
function initializeMonitor() {
  document.getElementById('btnRefreshStatus').addEventListener('click', () => {
    refreshMonitor();
  });

  document.getElementById('autoRefresh').addEventListener('change', (e) => {
    if (e.target.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });

  startAutoRefresh();
}

async function refreshMonitor() {
  try {
    const status = await window.electronAPI.checkServiceStatus();

    // Status do serviço
    const serviceStatusInfo = document.getElementById('serviceStatusInfo');
    serviceStatusInfo.innerHTML = `
      <div class="status-item">
        <span>Status:</span>
        <span class="status-value ${status.running ? 'success' : 'error'}">
          ${status.running ? '✅ Em execução' : '❌ Parado'}
        </span>
      </div>
      <div class="status-item">
        <span>Configurado:</span>
        <span class="status-value ${status.configured ? 'success' : 'warning'}">
          ${status.configured ? '✅ Sim' : '⚠️ Não'}
        </span>
      </div>
    `;

    // Status da API
    const apiStatusInfo = document.getElementById('apiStatusInfo');
    apiStatusInfo.innerHTML = `
      <div class="status-item">
        <span>Conectado:</span>
        <span class="status-value ${status.running ? 'success' : 'error'}">
          ${status.running ? '✅ Sim' : '❌ Não'}
        </span>
      </div>
    `;

    // Status da impressora
    const printerStatusInfo = document.getElementById('printerStatusInfo');
    if (status.data && status.data.printerConnected !== undefined) {
      printerStatusInfo.innerHTML = `
        <div class="status-item">
          <span>Conectada:</span>
          <span class="status-value ${status.data.printerConnected ? 'success' : 'error'}">
            ${status.data.printerConnected ? '✅ Sim' : '❌ Não'}
          </span>
        </div>
      `;
    } else {
      printerStatusInfo.innerHTML = '<p>Não disponível</p>';
    }

    // Estatísticas
    const statsInfo = document.getElementById('statsInfo');
    statsInfo.innerHTML = `
      <div class="status-item">
        <span>Device ID:</span>
        <span class="status-value">${status.data?.deviceId || 'N/A'}</span>
      </div>
    `;
  } catch (error) {
    console.error('Erro ao atualizar monitor:', error);
  }
}

function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }
  autoRefreshInterval = setInterval(() => {
    if (currentTab === 'monitor') {
      refreshMonitor();
    }
  }, 5000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ========== LOGS ==========
let allLogs = []; // Armazenar todos os logs para busca
let filteredLogs = []; // Logs filtrados pela busca
let logsClearedAt = null; // Timestamp de quando os logs foram limpos

function initializeLogs() {
  document.getElementById('btnRefreshLogs').addEventListener('click', () => {
    refreshLogs();
  });

  document.getElementById('btnCopyLogs').addEventListener('click', () => {
    copyLogs();
  });

  document.getElementById('btnClearLogs').addEventListener('click', async () => {
    await clearLogsDisplay();
  });

  document.getElementById('autoScrollLogs').addEventListener('change', (e) => {
    autoScrollLogs = e.target.checked;
  });

  // Busca em tempo real
  const searchInput = document.getElementById('logsSearch');
  searchInput.addEventListener('input', (e) => {
    filterLogs(e.target.value);
  });

  // Botão limpar busca
  document.getElementById('btnClearSearch').addEventListener('click', () => {
    searchInput.value = '';
    filterLogs('');
    searchInput.focus();
  });

  // Atalho de teclado: Ctrl+F para focar busca
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'f' && currentTab === 'logs') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  refreshLogs();
}

async function copyLogs() {
  try {
    const logsToCopy = filteredLogs.length > 0 ? filteredLogs : allLogs;
    
    if (logsToCopy.length === 0) {
      alert('Nenhum log para copiar');
      return;
    }

    // Copiar logs como texto simples
    const logsText = logsToCopy.join('\n');
    
    // Usar API do Electron (mais confiável que navigator.clipboard)
    const result = await window.electronAPI.copyToClipboard(logsText);
    
    if (!result.success) {
      throw new Error(result.error || 'Erro desconhecido');
    }
    
    // Feedback visual
    const btn = document.getElementById('btnCopyLogs');
    const originalText = btn.textContent;
    btn.textContent = '✅ Copiado!';
    btn.disabled = true;
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Erro ao copiar logs:', error);
    
    // Fallback: tentar usar navigator.clipboard se disponível
    try {
      const logsToCopy = filteredLogs.length > 0 ? filteredLogs : allLogs;
      if (logsToCopy.length > 0 && navigator.clipboard) {
        await navigator.clipboard.writeText(logsToCopy.join('\n'));
        
        const btn = document.getElementById('btnCopyLogs');
        const originalText = btn.textContent;
        btn.textContent = '✅ Copiado!';
        btn.disabled = true;
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.disabled = false;
        }, 2000);
        return;
      }
    } catch (fallbackError) {
      console.error('Fallback também falhou:', fallbackError);
    }
    
    alert(`Erro ao copiar logs: ${error.message || 'Erro desconhecido'}\n\nTente selecionar e copiar manualmente (Ctrl+A, Ctrl+C)`);
  }
}

function filterLogs(searchTerm) {
  const btnClearSearch = document.getElementById('btnClearSearch');
  
  if (!searchTerm || searchTerm.trim() === '') {
    filteredLogs = [];
    btnClearSearch.style.display = 'none';
    renderLogs(allLogs);
    return;
  }

  btnClearSearch.style.display = 'inline-block';
  
  const term = searchTerm.toLowerCase().trim();
  filteredLogs = allLogs.filter((log) => {
    return log.toLowerCase().includes(term);
  });

  renderLogs(filteredLogs, term);
}

function renderLogs(logs, highlightTerm = '') {
  const container = document.getElementById('logsContainer');

  if (logs.length === 0) {
    container.innerHTML = '<p class="logs-placeholder">Nenhum log encontrado</p>';
    return;
  }

  container.innerHTML = logs.map((log) => {
    let className = 'log-entry';
    if (log.includes('error') || log.includes('ERRO') || log.includes('❌')) {
      className += ' error';
    } else if (log.includes('warn') || log.includes('AVISO') || log.includes('⚠️')) {
      className += ' warn';
    } else {
      className += ' info';
    }

    // Destacar termo de busca
    let displayLog = escapeHtml(log);
    if (highlightTerm) {
      const regex = new RegExp(`(${escapeHtml(highlightTerm)})`, 'gi');
      displayLog = displayLog.replace(regex, '<mark>$1</mark>');
    }

    return `<div class="${className}">${displayLog}</div>`;
  }).join('');

  if (autoScrollLogs && !highlightTerm) {
    container.scrollTop = container.scrollHeight;
  }
}

async function refreshLogs() {
  try {
    const logs = await window.electronAPI.readLogs(200);
    
    // Se os logs foram limpos recentemente (últimos 5 minutos), só adicionar novos logs
    if (logsClearedAt && (Date.now() - logsClearedAt) < 300000) { // 5 minutos
      // Verificar se há novos logs comparando com os que já temos
      // Usar uma abordagem mais robusta: comparar por conteúdo, não por referência
      const existingLogHashes = new Set(allLogs.map(log => log.substring(0, 100))); // Primeiros 100 chars como hash simples
      const newLogs = logs.filter(log => {
        const logHash = log.substring(0, 100);
        return !existingLogHashes.has(logHash);
      });
      
      // Adicionar apenas novos logs ao array
      if (newLogs.length > 0) {
        allLogs.push(...newLogs);
      }
    } else {
      // Se não foi limpo recentemente ou passou muito tempo, recarregar todos os logs normalmente
      allLogs = logs;
      logsClearedAt = null; // Resetar flag
    }

    if (allLogs.length === 0) {
      const container = document.getElementById('logsContainer');
      container.innerHTML = '<p class="logs-placeholder">Nenhum log disponível</p>';
      filteredLogs = [];
      return;
    }

    // Se houver busca ativa, manter o filtro
    const searchInput = document.getElementById('logsSearch');
    if (searchInput && searchInput.value.trim()) {
      filterLogs(searchInput.value);
    } else {
      renderLogs(allLogs);
    }
  } catch (error) {
    console.error('Erro ao carregar logs:', error);
  }
}

function appendLog(log) {
  // Se os logs foram limpos, resetar o timestamp após um tempo (para permitir recarregar normalmente depois)
  if (logsClearedAt && Date.now() - logsClearedAt > 60000) { // 1 minuto
    logsClearedAt = null;
  }
  
  // Adicionar ao array de logs
  allLogs.push(log);
  
  // Manter apenas os últimos 500 logs em memória
  if (allLogs.length > 500) {
    allLogs.shift();
  }

  const container = document.getElementById('logsContainer');
  if (container.querySelector('.logs-placeholder')) {
    container.innerHTML = '';
  }

  // Verificar se deve exibir este log (baseado na busca)
  const searchInput = document.getElementById('logsSearch');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  if (searchTerm && !log.toLowerCase().includes(searchTerm)) {
    // Log não corresponde à busca, não exibir
    return;
  }

  let className = 'log-entry';
  if (log.includes('error') || log.includes('ERRO') || log.includes('❌')) {
    className += ' error';
  } else if (log.includes('warn') || log.includes('AVISO') || log.includes('⚠️')) {
    className += ' warn';
  } else {
    className += ' info';
  }

  const logDiv = document.createElement('div');
  logDiv.className = className;
  
  // Destacar termo de busca se houver
  let displayLog = escapeHtml(log);
  if (searchTerm) {
    const regex = new RegExp(`(${escapeHtml(searchTerm)})`, 'gi');
    displayLog = displayLog.replace(regex, '<mark>$1</mark>');
  }
  
  logDiv.innerHTML = displayLog;
  container.appendChild(logDiv);

  if (autoScrollLogs && !searchTerm) {
    container.scrollTop = container.scrollHeight;
  }
}

async function clearLogsDisplay() {
  try {
    // Confirmar ação
    const confirmed = confirm('Tem certeza que deseja limpar todos os logs?\n\nIsso irá:\n- Limpar a visualização\n- Apagar o arquivo de logs\n\nNovos logs continuarão aparecendo normalmente.');
    
    if (!confirmed) {
      return;
    }

    // Limpar arquivo de logs no servidor
    const result = await window.electronAPI.clearLogs();
    
    if (!result.success) {
      alert(`Erro ao limpar logs: ${result.error || 'Erro desconhecido'}`);
      return;
    }

    // Limpar arrays em memória
    allLogs = [];
    filteredLogs = [];
    
    // Marcar que os logs foram limpos agora
    logsClearedAt = Date.now();
    
    // Limpar display
    const container = document.getElementById('logsContainer');
    container.innerHTML = '<p class="logs-placeholder">Logs limpos. Novos logs aparecerão aqui.</p>';
    
    // Limpar campo de busca se houver
    const searchInput = document.getElementById('logsSearch');
    if (searchInput) {
      searchInput.value = '';
      const btnClearSearch = document.getElementById('btnClearSearch');
      if (btnClearSearch) {
        btnClearSearch.style.display = 'none';
      }
    }
    
    // Feedback visual
    const btn = document.getElementById('btnClearLogs');
    const originalText = btn.textContent;
    btn.textContent = '✅ Limpo!';
    btn.disabled = true;
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Erro ao limpar logs:', error);
    alert(`Erro ao limpar logs: ${error.message || 'Erro desconhecido'}`);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

