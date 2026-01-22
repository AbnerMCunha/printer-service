import express, { Request, Response } from 'express';
import config from './config/config';
import logger from './utils/logger';
import ApiService from './services/ApiService';
import PrinterService from './services/PrinterService';
import PollingService from './services/PollingService';
import { Order } from './types';

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
    } else if (config.printerIp) {
      logger.info(`Impressora: Térmica Rede ${config.printerIp}:${config.printerPort}`);
    } else {
      logger.info(`Impressora: Térmica USB/COM (${config.printerName || 'N/A'})`);
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

    // Endpoint de teste de impressão
    app.post('/test-print', async (req: Request, res: Response) => {
      try {
        logger.info('🧪 ========================================');
        logger.info('🧪 INICIANDO TESTE DE IMPRESSÃO');
        logger.info('🧪 ========================================');

        // Criar pedido fictício completo para teste
        const testOrder: Order = {
          id: `test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          total: 45.50,
          customerName: 'Cliente Teste',
          customerPhone: '11987654321',
          orderType: 'DELIVERY',
          paymentMethod: 'Dinheiro',
          changeFor: 50.00,
          notes: 'Este é um pedido de teste para verificar a comunicação com a impressora',
          deliveryFee: 5.00,
          discountAmount: 0,
          customerId: 'customer-test-123',
          kitchenReceiptAutoPrintedAt: null,
          address: {
            street: 'Rua das Flores',
            number: '123',
            complement: 'Apto 45',
            neighborhood: 'Centro',
            city: 'São Paulo',
            state: 'SP',
            cep: '01234-567',
          },
          items: [
            {
              id: 'item-1',
              quantity: 2,
              price: 15.00,
              productId: 'prod-1',
              product: {
                id: 'prod-1',
                name: 'Hambúrguer Artesanal',
                price: 15.00,
              },
              notes: 'Sem cebola',
            },
            {
              id: 'item-2',
              quantity: 1,
              price: 12.50,
              productId: 'prod-2',
              product: {
                id: 'prod-2',
                name: 'Batata Frita Grande',
                price: 12.50,
              },
            },
            {
              id: 'item-3',
              quantity: 1,
              price: 3.00,
              productId: 'prod-3',
              product: {
                id: 'prod-3',
                name: 'Refrigerante Lata',
                price: 3.00,
              },
            },
          ],
        };

        logger.info(`📋 Pedido de teste criado: ${testOrder.id.slice(-8)}`);
        logger.info(`   Cliente: ${testOrder.customerName}`);
        logger.info(`   Total: R$ ${testOrder.total.toFixed(2)}`);
        logger.info(`   Itens: ${testOrder.items.length}`);
        logger.info(`   Tipo: ${testOrder.orderType}`);

        // Verificar status da impressora
        const printerConnected = printerService!.getConnected();
        logger.info(`🖨️  Status da impressora: ${printerConnected ? 'CONECTADA' : 'DESCONECTADA'}`);

        if (!printerConnected) {
          logger.warn('⚠️  Impressora não está conectada, tentando conectar...');
          const connected = await printerService!.connect();
          if (!connected) {
            logger.error('❌ Não foi possível conectar à impressora');
            return res.status(500).json({
              success: false,
              error: 'Impressora não conectada',
              printerConnected: false,
            });
          }
          logger.info('✅ Impressora conectada com sucesso');
        }

        // Buscar nome do restaurante (ou usar padrão)
        let restaurantName = 'Restaurante Teste';
        try {
          const restaurantInfo = await apiService!.getRestaurantInfo();
          restaurantName = restaurantInfo?.name || restaurantName;
          logger.info(`🏪 Nome do restaurante: ${restaurantName}`);
        } catch (error: any) {
          logger.warn(`⚠️  Não foi possível buscar nome do restaurante: ${error.message}`);
          logger.info(`🏪 Usando nome padrão: ${restaurantName}`);
        }

        // Tentar imprimir
        logger.info('🖨️  Iniciando processo de impressão...');
        const startTime = Date.now();
        
        const printed = await printerService!.printReceipt(testOrder, restaurantName);
        
        const duration = Date.now() - startTime;
        logger.info(`⏱️  Tempo de processamento: ${duration}ms`);

        if (printed) {
          logger.info('✅ ========================================');
          logger.info('✅ TESTE DE IMPRESSÃO CONCLUÍDO COM SUCESSO');
          logger.info('✅ ========================================');
          logger.info(`✅ Pedido ${testOrder.id.slice(-8)} enviado para fila de impressão`);
          logger.info(`✅ Verifique se o recibo foi impresso na impressora`);

          return res.json({
            success: true,
            message: 'Teste de impressão realizado com sucesso',
            orderId: testOrder.id.slice(-8),
            printerConnected: true,
            duration: `${duration}ms`,
            details: {
              customerName: testOrder.customerName,
              total: testOrder.total,
              itemsCount: testOrder.items.length,
              restaurantName,
            },
          });
        } else {
          logger.error('❌ ========================================');
          logger.error('❌ TESTE DE IMPRESSÃO FALHOU');
          logger.error('❌ ========================================');
          logger.error(`❌ Não foi possível enviar para a impressora`);

          return res.status(500).json({
            success: false,
            error: 'Falha ao enviar para impressora',
            printerConnected: printerConnected,
            duration: `${duration}ms`,
          });
        }
      } catch (error: any) {
        logger.error('❌ ========================================');
        logger.error('❌ ERRO NO TESTE DE IMPRESSÃO');
        logger.error('❌ ========================================');
        logger.error('Erro ao processar teste de impressão', {
          error: error.message,
          stack: error.stack,
        });

        return res.status(500).json({
          success: false,
          error: error.message || 'Erro interno no teste de impressão',
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

