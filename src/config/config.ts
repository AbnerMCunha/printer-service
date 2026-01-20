import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

// Carregar variáveis de ambiente
dotenv.config();

interface Config {
  apiUrl: string;
  apiToken: string;
  refreshToken?: string;
  adminEmail?: string;
  adminPassword?: string;
  restaurantId?: string;
  printerType: 'thermal' | 'system';
  printerIp: string;
  printerPort: number;
  printerName?: string;
  httpPort: number;
  pollingInterval: number;
  enablePolling: boolean;
  deviceId: string;
  logLevel: string;
  devMode: boolean;
}

// Gerar ou carregar Device ID
function getOrCreateDeviceId(): string {
  const deviceIdFile = path.join(process.cwd(), '.device-id');
  
  try {
    if (fs.existsSync(deviceIdFile)) {
      const deviceId = fs.readFileSync(deviceIdFile, 'utf-8').trim();
      if (deviceId) {
        return deviceId;
      }
    }
    
    // Gerar novo Device ID usando crypto nativo
    const newDeviceId = randomUUID();
    fs.writeFileSync(deviceIdFile, newDeviceId, 'utf-8');
    logger.info(`Novo Device ID gerado: ${newDeviceId}`);
    return newDeviceId;
  } catch (error) {
    logger.warn('Erro ao ler/criar Device ID, usando UUID temporário', { error });
    return randomUUID();
  }
}

// Validar configurações obrigatórias
function validateConfig(config: Partial<Config>): void {
  const missing: string[] = [];

  // API_URL é sempre obrigatório
  if (!config.apiUrl) {
    missing.push('apiUrl');
  }

  // API_TOKEN é obrigatório APENAS se não houver credenciais para login automático
  if (!config.apiToken && (!config.adminEmail || !config.adminPassword)) {
    missing.push('apiToken (ou configure ADMIN_EMAIL e ADMIN_PASSWORD para login automático)');
  }

  // Validação condicional baseada no tipo de impressora
  if (config.printerType === 'thermal') {
    // Para térmicas: precisa de IP (rede) OU printerName (USB/COM)
    // Verificar se ambos estão vazios ou undefined
    const hasIp = config.printerIp && typeof config.printerIp === 'string' && config.printerIp.trim() !== '';
    const hasName = config.printerName && typeof config.printerName === 'string' && config.printerName.trim() !== '';
    
    // Log de debug para ajudar a identificar problemas (só se não passar na validação)
    if (!hasIp && !hasName) {
      logger.warn('Validação de impressora térmica falhou', {
        printerType: config.printerType,
        printerIp: config.printerIp || '(vazio/undefined)',
        printerIpType: typeof config.printerIp,
        printerIpLength: config.printerIp ? config.printerIp.length : 0,
        printerName: config.printerName || '(vazio/undefined)',
        printerNameType: typeof config.printerName,
        printerNameLength: config.printerName ? config.printerName.length : 0,
        hasIp,
        hasName,
      });
    }
    
    if (!hasIp && !hasName) {
      missing.push('printerIp (para rede) ou printerName (para USB/COM)');
    }
  } else if (config.printerType === 'system') {
    // Para impressoras do sistema, printerName é opcional (usa padrão)
    // Mas recomendamos que seja configurado
  }

  if (missing.length > 0) {
    throw new Error(
      `Configurações obrigatórias faltando: ${missing.join(', ')}\n` +
      'Verifique o arquivo .env\n' +
      '💡 Dica: Configure ADMIN_EMAIL e ADMIN_PASSWORD para login automático (não precisa de API_TOKEN)'
    );
  }
}

// Carregar configurações
function loadConfig(): Config {
  const deviceId = process.env.DEVICE_ID || getOrCreateDeviceId();
  
  const config: Config = {
    apiUrl: process.env.API_URL || '',
    apiToken: process.env.API_TOKEN || '',
    refreshToken: process.env.REFRESH_TOKEN,
    adminEmail: process.env.ADMIN_EMAIL,
    adminPassword: process.env.ADMIN_PASSWORD,
    restaurantId: process.env.RESTAURANT_ID,
    printerType: (process.env.PRINTER_TYPE || 'thermal') as 'thermal' | 'system',
    printerIp: (process.env.PRINTER_IP || '').trim(),
    printerPort: parseInt(process.env.PRINTER_PORT || '9100', 10),
    printerName: process.env.PRINTER_NAME && process.env.PRINTER_NAME.trim() !== '' 
      ? process.env.PRINTER_NAME.trim() 
      : undefined,
    httpPort: parseInt(process.env.HTTP_PORT || '3002', 10),
    pollingInterval: parseInt(process.env.POLLING_INTERVAL || '30000', 10),
    enablePolling: process.env.ENABLE_POLLING !== 'false', // Padrão: true
    deviceId,
    logLevel: process.env.LOG_LEVEL || 'info',
    devMode: process.env.DEV_MODE === 'true',
  };

  // Validar configurações
  validateConfig(config);

  // Log de configurações (sem expor token completo)
  logger.info('Configurações carregadas', {
    apiUrl: config.apiUrl,
    printerType: config.printerType,
    printerIp: config.printerType === 'thermal' && config.printerIp ? config.printerIp : 'N/A',
    printerPort: config.printerType === 'thermal' && config.printerIp ? config.printerPort : 'N/A',
    printerName: config.printerType === 'thermal' && !config.printerIp ? (config.printerName || 'N/A') : 
                 config.printerType === 'system' ? (config.printerName || 'padrão') : 'N/A',
    connectionType: config.printerType === 'thermal' ? (config.printerIp ? 'Rede (TCP/IP)' : 'USB/COM') : 'Sistema',
    httpPort: config.httpPort,
    pollingInterval: config.pollingInterval,
    enablePolling: config.enablePolling,
    deviceId: config.deviceId.slice(-8),
    hasToken: !!config.apiToken,
    hasRefreshToken: !!config.refreshToken,
    hasCredentials: !!(config.adminEmail && config.adminPassword),
    restaurantId: config.restaurantId || 'não configurado',
    devMode: config.devMode,
  });

  return config;
}

export const config = loadConfig();
export default config;

