import ApiService from './ApiService';
import PrinterService from './PrinterService';
import config from '../config/config';
import logger from '../utils/logger';
import { Order } from '../types';

export class PollingService {
  private apiService: ApiService;
  private printerService: PrinterService;
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastCheckAt: string | null = null;
  private processedOrderIds = new Set<string>();
  private restaurantInfo: any = null;
  private restaurantName = 'Restaurante';

  constructor(apiService: ApiService, printerService: PrinterService) {
    this.apiService = apiService;
    this.printerService = printerService;
  }

  /**
   * Inicializar serviço de polling
   */
  async initialize(): Promise<boolean> {
    logger.info('Inicializando serviço de polling...');

    // Buscar informações do restaurante
    try {
      this.restaurantInfo = await this.apiService.getRestaurantInfo();
      if (this.restaurantInfo && this.restaurantInfo.name) {
        this.restaurantName = this.restaurantInfo.name;
        logger.info(`Restaurante: ${this.restaurantName}`);

        // Validação rigorosa de Device ID e autoPrintKitchenReceiptEnabled
        const autoPrintEnabled = this.restaurantInfo.autoPrintKitchenReceiptEnabled;
        const configuredDeviceId = this.restaurantInfo.autoPrintKitchenReceiptDeviceId;

        if (!autoPrintEnabled) {
          logger.warn('⚠️ Impressão automática não está habilitada no restaurante');
          logger.warn('💡 Habilite a impressão automática no painel admin');
          return false; // Não inicializar se desabilitado
        }

        if (configuredDeviceId && configuredDeviceId !== config.deviceId) {
          logger.error('❌ Device ID não corresponde!');
          logger.error(`Configurado no backend: ${configuredDeviceId.slice(-8)}`);
          logger.error(`Device ID local: ${config.deviceId.slice(-8)}`);
          logger.error('💡 Configure o Device ID correto no painel admin ou ajuste o .device-id');
          return false; // Não inicializar se Device ID não corresponde
        } else if (configuredDeviceId) {
          logger.info('✅ Device ID configurado corretamente');
        } else {
          logger.warn('⚠️ Device ID não configurado no restaurante');
          logger.warn('💡 Configure o Device ID no painel admin para maior segurança');
        }
      }
    } catch (error: any) {
      logger.error('❌ Erro ao buscar informações do restaurante', {
        error: error.message,
      });
      return false; // Não inicializar se não conseguir validar
    }

    // Testar conexão com impressora
    logger.info('Testando conexão com impressora...');
    const printerConnected = await this.printerService.testConnection();
    if (!printerConnected) {
      if (config.printerType === 'system') {
        logger.warn('Não foi possível verificar impressora do sistema');
        logger.warn('O serviço continuará, mas verifique se a impressora está configurada corretamente');
      } else {
        logger.error('Não foi possível conectar à impressora térmica');
        logger.error('Verifique se o IP e porta estão corretos no arquivo .env');
        return false;
      }
    } else {
      if (config.printerType === 'system') {
        logger.info('Impressora do sistema configurada');
      } else {
        logger.info('Conexão com impressora térmica OK');
      }
    }

    logger.info('Serviço de polling inicializado com sucesso');
    return true;
  }

  /**
   * Verificar se pedido deve ser impresso
   */
  private shouldPrintOrder(order: Order): boolean {
    // Verificar se já foi impresso
    if (order.kitchenReceiptAutoPrintedAt) {
      return false;
    }

    // Verificar status válido
    const validStatuses = ['PENDING', 'CONFIRMED', 'AWAITING_CASH_PAYMENT'];
    if (!validStatuses.includes(order.status)) {
      return false;
    }

    // Verificar se já foi processado nesta sessão
    if (this.processedOrderIds.has(order.id)) {
      return false;
    }

    return true;
  }

  /**
   * Processar um pedido (buscar completo e imprimir)
   */
  private async processOrder(order: Order): Promise<boolean> {
    try {
      logger.info(`Processando pedido ${order.id.slice(-8)}...`);

      // Buscar pedido completo
      const fullOrder = await this.apiService.getOrderById(order.id);

      // Verificar novamente se deve imprimir (com dados completos)
      if (!this.shouldPrintOrder(fullOrder)) {
        logger.info(`Pedido ${order.id.slice(-8)} não deve ser impresso (já impresso ou status inválido)`);
        return false;
      }

      // Verificar se tem itens
      if (!fullOrder.items || fullOrder.items.length === 0) {
        logger.warn(`Pedido ${order.id.slice(-8)} não tem itens, pulando...`);
        return false;
      }

      // Verificar se impressora está conectada
      if (!this.printerService.getConnected()) {
        logger.error(`Impressora não conectada, não é possível imprimir pedido ${order.id.slice(-8)}`);
        return false;
      }

      // Imprimir recibo
      logger.info(`Imprimindo pedido ${order.id.slice(-8)}...`);
      const printed = await this.printerService.printReceipt(fullOrder, this.restaurantName);

      if (!printed) {
        logger.error(`Falha ao imprimir pedido ${order.id.slice(-8)}`);
        return false;
      }

      // Marcar como impresso no backend
      await this.apiService.markAsPrinted(order.id);

      // Marcar como processado
      this.processedOrderIds.add(order.id);

      logger.info(`Pedido ${order.id.slice(-8)} processado e impresso com sucesso`);
      return true;
    } catch (error: any) {
      logger.error(`Erro ao processar pedido ${order.id.slice(-8)}`, {
        error: error.message,
        stack: error.stack,
      });
      return false;
    }
  }

  /**
   * Executar uma verificação de novos pedidos
   */
  private async checkNewOrders(): Promise<void> {
    try {
      logger.debug('Verificando novos pedidos...', {
        lastCheckAt: this.lastCheckAt || 'primeira verificação',
      });

      const response = await this.apiService.pollOrders(this.lastCheckAt || undefined);

      if (!response.success || !response.data) {
        logger.warn('Resposta de polling inválida', { response });
        return;
      }

      const orders = response.data.orders || [];
      const count = response.data.count || 0;

      logger.info(`📦 Encontrados ${count} pedido(s) pendente(s)`);

      if (orders.length === 0) {
        // Atualizar lastCheckAt mesmo sem novos pedidos
        this.lastCheckAt = response.data.timestamp;
        logger.debug('Nenhum pedido novo encontrado');
        return;
      }

      logger.info(`🔄 Processando ${orders.length} pedido(s)...`);

      // Processar cada pedido
      for (const order of orders) {
        logger.info(`📋 Verificando pedido ${order.id.slice(-8)} (status: ${order.status})...`);
        
        if (this.shouldPrintOrder(order)) {
          logger.info(`✅ Pedido ${order.id.slice(-8)} será impresso`);
          await this.processOrder(order);
        } else {
          const reason = order.kitchenReceiptAutoPrintedAt 
            ? 'já foi impresso anteriormente'
            : !['PENDING', 'CONFIRMED', 'AWAITING_CASH_PAYMENT'].includes(order.status)
            ? `status inválido: ${order.status}`
            : this.processedOrderIds.has(order.id)
            ? 'já foi processado nesta sessão'
            : 'razão desconhecida';
          logger.info(`⏭️  Pedido ${order.id.slice(-8)} ignorado: ${reason}`);
        }
      }

      // Atualizar timestamp da última verificação
      this.lastCheckAt = response.data.timestamp;

      // Limpar cache de IDs processados (manter apenas últimos 100)
      if (this.processedOrderIds.size > 100) {
        const idsArray = Array.from(this.processedOrderIds);
        this.processedOrderIds.clear();
        idsArray.slice(-50).forEach((id) => this.processedOrderIds.add(id));
      }
    } catch (error: any) {
      // Tratamento especial para erros de autenticação
      if (error.response?.status === 401 || error.response?.status === 403) {
        logger.error('❌ Erro de autenticação ao verificar novos pedidos');
        logger.error('O token JWT está inválido ou expirado. Atualize o API_TOKEN no arquivo .env');
        logger.error('O serviço continuará tentando, mas não funcionará até o token ser corrigido');
        // Não logar stack trace para erros de autenticação conhecidos
        return;
      }
      
      logger.error('Erro ao verificar novos pedidos', {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Iniciar loop de polling
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Polling já está em execução');
      return;
    }

    this.isRunning = true;
    logger.info(`Iniciando loop de polling (intervalo: ${config.pollingInterval}ms)`);

    // Executar primeira verificação imediatamente
    this.checkNewOrders().catch((error) => {
      logger.error('Erro na primeira verificação', { error: error.message });
    });

    // Configurar intervalo
    this.pollingInterval = setInterval(() => {
      if (this.isRunning) {
        this.checkNewOrders().catch((error) => {
          logger.error('Erro no polling', { error: error.message });
        });
      }
    }, config.pollingInterval);
  }

  /**
   * Parar loop de polling
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Parando serviço de polling...');
    this.isRunning = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Desconectar impressora
    this.printerService.disconnect();

    logger.info('Serviço de polling parado');
  }

  /**
   * Verificar se está rodando
   */
  getRunning(): boolean {
    return this.isRunning;
  }
}

export default PollingService;

