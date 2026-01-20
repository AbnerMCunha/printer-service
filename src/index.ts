import express, { Request, Response } from 'express';
import config from './config/config';
import logger from './utils/logger';
import ApiService from './services/ApiService';
import PrinterService from './services/PrinterService';
import PollingService from './services/PollingService';

let pollingService: PollingService | null = null;
let apiService: ApiService | null = null;
let printerService: PrinterService | null = null;
let httpServer: any = null;

/**
 * Shutdown graceful
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`Recebido sinal ${signal}, encerrando...`);

  if (httpServer) {
    httpServer.close(() => {
      logger.info('Servidor HTTP fechado');
    });
  }

  if (pollingService) {
    pollingService.stop();
  }

  logger.info('Encerrado com sucesso');
  process.exit(0);
}

/**
 * Tratamento de erros não capturados
 */
process.on('uncaughtException', (error: Error) => {
  logger.error('Erro não capturado', {
    error: error.message,
    stack: error.stack,
  });
  shutdown('uncaughtException').catch(() => {
    process.exit(1);
  });
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Promise rejeitada não tratada', {
    reason: reason?.message || reason,
    promise,
  });
});

/**
 * Tratamento de sinais
 */
process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch(() => {
    process.exit(1);
  });
});

process.on('SIGINT', () => {
  shutdown('SIGINT').catch(() => {
    process.exit(1);
  });
});

/**
 * Função principal
 */
async function main(): Promise<void> {
  try {
    logger.info('========================================');
    logger.info('Serviço de Impressão Automática');
    logger.info('========================================');
    logger.info(`Device ID: ${config.deviceId.slice(-8)}`);
    logger.info(`API URL: ${config.apiUrl}`);
    if (config.printerType === 'system') {
      logger.info(`Impressora: Sistema (${config.printerName || 'padrão'})`);
    } else {
      logger.info(`Impressora: Térmica ${config.printerIp}:${config.printerPort}`);
    }
    logger.info(`Intervalo de polling: ${config.pollingInterval}ms`);
    logger.info('========================================');

    // Inicializar serviços
    logger.info('Inicializando serviços...');

    apiService = new ApiService();
    printerService = new PrinterService();
    pollingService = new PollingService(apiService, printerService);

    // Testar conexão com API
    logger.info('Testando conexão com API...');
    const apiConnected = await apiService.testConnection();
    if (!apiConnected) {
      logger.error('Não foi possível conectar à API. Verifique a URL e o token.');
      process.exit(1);
    }
    logger.info('Conexão com API OK');

    // Inicializar polling service
    const initialized = await pollingService.initialize();
    if (!initialized) {
      logger.error('Falha ao inicializar serviço de polling');
      process.exit(1);
    }

    // Iniciar servidor HTTP para receber requisições do frontend
    const app = express();
    app.use(express.json());

    // Endpoint para impressão direta (chamado pelo frontend)
    app.post('/print', async (req: Request, res: Response) => {
      try {
        const { orderId } = req.body;

        if (!orderId) {
          return res.status(400).json({
            success: false,
            error: 'orderId é obrigatório',
          });
        }

        logger.info(`📥 Requisição de impressão recebida do frontend: ${orderId.slice(-8)}`);

        // Buscar pedido completo
        const order = await apiService!.getOrderById(orderId);

        // Verificar se deve imprimir
        if (order.kitchenReceiptAutoPrintedAt) {
          logger.info(`Pedido ${orderId.slice(-8)} já foi impresso anteriormente`);
          return res.json({
            success: true,
            message: 'Pedido já foi impresso',
            alreadyPrinted: true,
          });
        }

        // Verificar status válido
        const validStatuses = ['PENDING', 'CONFIRMED', 'AWAITING_CASH_PAYMENT'];
        if (!validStatuses.includes(order.status)) {
          logger.warn(`Pedido ${orderId.slice(-8)} tem status inválido: ${order.status}`);
          return res.json({
            success: false,
            error: `Status inválido: ${order.status}`,
          });
        }

        // Buscar nome do restaurante
        const restaurantInfo = await apiService!.getRestaurantInfo();
        const restaurantName = restaurantInfo?.name || 'Restaurante';

        // Imprimir
        const printed = await printerService!.printReceipt(order, restaurantName);

        if (printed) {
          // Marcar como impresso
          await apiService!.markAsPrinted(orderId);
          logger.info(`✅ Pedido ${orderId.slice(-8)} impresso via requisição HTTP`);

          return res.json({
            success: true,
            message: 'Pedido impresso com sucesso',
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Falha ao imprimir pedido',
          });
        }
      } catch (error: any) {
        logger.error('Erro ao processar requisição de impressão', {
          error: error.message,
          stack: error.stack,
        });

        return res.status(500).json({
          success: false,
          error: error.message || 'Erro interno',
        });
      }
    });

    // Endpoint de health check
    app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        service: 'printer-service',
        deviceId: config.deviceId.slice(-8),
        printerConnected: printerService!.getConnected(),
      });
    });

    // Iniciar servidor HTTP
    httpServer = app.listen(config.httpPort, () => {
      logger.info(`🌐 Servidor HTTP iniciado na porta ${config.httpPort}`);
      logger.info(`📡 Endpoint de impressão: http://localhost:${config.httpPort}/print`);
    });

    // Iniciar polling (opcional, como fallback)
    if (config.enablePolling) {
      pollingService.start();
      logger.info('🔄 Polling habilitado (fallback quando frontend não está aberto)');
    } else {
      logger.info('⏸️  Polling desabilitado (apenas requisições HTTP)');
    }

    logger.info('Serviço iniciado com sucesso! Aguardando novos pedidos...');
  } catch (error: any) {
    logger.error('Erro fatal ao iniciar serviço', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Executar
main().catch((error) => {
  logger.error('Erro fatal', { error: error.message });
  process.exit(1);
});

