import axios, { AxiosInstance, AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import config from '../config/config';
import logger from '../utils/logger';
import { Order, PollingResponse, ApiResponse } from '../types';

export class ApiService {
  private client: AxiosInstance;
  private retryAttempts = 3;
  private retryDelay = 1000; // 1 segundo
  private currentAccessToken: string;
  private refreshToken: string | undefined;
  private isRefreshing = false;
  private refreshPromise: Promise<string | null> | null = null;
  
  // Cache de informações do restaurante
  private restaurantInfoCache: { data: any; timestamp: number } | null = null;
  private RESTAURANT_INFO_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor() {
    this.currentAccessToken = config.apiToken || '';
    this.refreshToken = config.refreshToken;

    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 10000, // 10 segundos
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Adicionar token apenas se existir
    if (this.currentAccessToken) {
      this.client.defaults.headers.Authorization = `Bearer ${this.currentAccessToken}`;
    }

    // Interceptor para logging de requisições
    this.client.interceptors.request.use(
      (request) => {
        logger.debug(`Requisição: ${request.method?.toUpperCase()} ${request.url}`);
        return request;
      },
      (error) => {
        logger.error('Erro na requisição', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Interceptor para renovação automática de tokens e logging de respostas
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Resposta: ${response.status} ${response.config.url}`);
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // Tentar renovar token se receber 401/403
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          const errorData = error.response.data as any;
          const errorCode = errorData?.code;

          // Se for erro de autenticação e tiver refresh token, tentar renovar
          if (
            (errorCode === 'TOKEN_EXPIRED' || errorCode === 'INVALID_TOKEN' || errorCode === 'AUTH_ERROR') &&
            this.refreshToken &&
            !originalRequest._retry
          ) {
            originalRequest._retry = true;

            try {
              logger.info('🔄 Token expirado, tentando renovar automaticamente...');
              const newAccessToken = await this.refreshAccessToken();

              if (newAccessToken) {
                // Atualizar header da requisição original
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                
                // Retentar a requisição original com novo token
                return this.client(originalRequest);
              }
            } catch (refreshError: any) {
              logger.error('❌ Falha ao renovar token automaticamente', {
                error: refreshError.message,
              });
              logger.error('💡 Configure um novo REFRESH_TOKEN no arquivo .env');
            }
          }

          // Se não conseguiu renovar ou não tem refresh token
          if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'INVALID_TOKEN' || errorCode === 'AUTH_ERROR') {
            logger.error('❌ Erro de autenticação - Token JWT inválido ou expirado');
            if (!this.refreshToken) {
              logger.error('💡 Configure REFRESH_TOKEN no arquivo .env para renovação automática');
              logger.error('Para obter tokens:');
              logger.error('1. Execute: npm run get-token');
              logger.error('2. Ou faça login no painel admin e copie os tokens');
            } else {
              logger.error('💡 Refresh token também expirou. Configure novos tokens no .env');
            }
          } else {
            logger.warn(`Erro na resposta: ${error.response.status} ${error.config?.url}`, {
              status: error.response.status,
              data: error.response.data,
            });
          }
        } else if (error.request) {
          logger.error('Sem resposta do servidor', { url: error.config?.url });
        } else {
          logger.error('Erro ao configurar requisição', { error: error.message });
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Retry com backoff exponencial
   */
  private async retry<T>(
    fn: () => Promise<T>,
    attempts = this.retryAttempts,
    delay = this.retryDelay
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      // Não fazer retry para erros de autenticação (401/403)
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw error;
      }
      
      if (attempts <= 1) {
        throw error;
      }

      logger.warn(`Tentativa falhou, tentando novamente em ${delay}ms...`, {
        attemptsLeft: attempts - 1,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retry(fn, attempts - 1, delay * 2);
    }
  }

  /**
   * Buscar novos pedidos via polling (com Device ID)
   */
  async pollOrders(lastCheckAt?: string): Promise<PollingResponse> {
    return this.retry(async () => {
      const params: any = {
        deviceId: config.deviceId, // Enviar Device ID
      };
      if (lastCheckAt) {
        params.lastCheckAt = lastCheckAt;
      }

      const response = await this.client.get<PollingResponse>('/api/orders/polling', { params });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao buscar pedidos');
      }

      return response.data;
    });
  }

  /**
   * Buscar pedido completo por ID
   */
  async getOrderById(orderId: string): Promise<Order> {
    return this.retry(async () => {
      const response = await this.client.get<ApiResponse<Order>>(`/api/orders/${orderId}`);

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.error || 'Pedido não encontrado');
      }

      return response.data.data;
    });
  }

  /**
   * Marcar pedido como impresso
   */
  async markAsPrinted(orderId: string): Promise<void> {
    return this.retry(async () => {
      const response = await this.client.patch<ApiResponse<any>>(
        `/api/orders/${orderId}/mark-kitchen-receipt-printed`
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Erro ao marcar como impresso');
      }

      logger.info(`Pedido ${orderId.slice(-8)} marcado como impresso`);
    });
  }

  /**
   * Buscar informações do restaurante (com cache)
   */
  async getRestaurantInfo(forceRefresh = false): Promise<any> {
    const now = Date.now();
    
    // Usar cache se válido
    if (!forceRefresh && this.restaurantInfoCache && (now - this.restaurantInfoCache.timestamp) < this.RESTAURANT_INFO_CACHE_TTL) {
      logger.debug('Usando cache de informações do restaurante');
      return this.restaurantInfoCache.data;
    }

    // Buscar do servidor
    const info = await this.retry(async () => {
      // Se restaurantId estiver configurado, usar endpoint específico
      if (config.restaurantId) {
        const response = await this.client.get<ApiResponse<any>>(
          `/api/restaurants/${config.restaurantId}`
        );
        if (response.data.success && response.data.data) {
          return response.data.data;
        }
      }

      // Tentar buscar via endpoint de admin/profile que retorna informações do restaurante
      try {
        const response = await this.client.get<ApiResponse<any>>('/api/admin/profile');
        if (response.data.success && response.data.data && response.data.data.restaurant) {
          return response.data.data.restaurant;
        }
      } catch (error) {
        // Ignorar erro
      }

      // Se não conseguir buscar, retornar null (não é crítico)
      return null;
    });

    // Atualizar cache
    this.restaurantInfoCache = {
      data: info,
      timestamp: now,
    };

    return info;
  }

  /**
   * Fazer login automático usando credenciais
   */
  private async autoLogin(): Promise<string | null> {
    if (!config.adminEmail || !config.adminPassword) {
      logger.warn('💡 Credenciais não configuradas. Configure ADMIN_EMAIL e ADMIN_PASSWORD no .env para login automático');
      return null;
    }

    try {
      logger.info('🔐 Tentando login automático...');

      const loginClient = axios.create({
        baseURL: config.apiUrl,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await loginClient.post<ApiResponse<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>>('/api/admin/login', {
        email: config.adminEmail,
        password: config.adminPassword,
      });

      if (response.data.success && response.data.data) {
        const { accessToken, refreshToken: newRefreshToken } = response.data.data;

        // Atualizar tokens
        this.currentAccessToken = accessToken;
        this.refreshToken = newRefreshToken;

        // Atualizar header padrão do cliente
        this.client.defaults.headers.Authorization = `Bearer ${accessToken}`;

        logger.info('✅ Login automático realizado com sucesso');

        // Salvar novo refresh token no .env
        await this.saveRefreshTokenToEnv(newRefreshToken);

        return accessToken;
      }

      logger.error('❌ Resposta inválida no login automático');
      return null;
    } catch (error: any) {
      if (error.response) {
        logger.error('❌ Erro no login automático', {
          status: error.response.status,
          error: error.response.data?.error || 'Erro desconhecido',
        });
      } else {
        logger.error('❌ Erro no login automático', { error: error.message });
      }
      return null;
    }
  }

  /**
   * Salvar refresh token no arquivo .env
   */
  private async saveRefreshTokenToEnv(newRefreshToken: string): Promise<void> {
    try {
      const envPath = path.join(process.cwd(), '.env');
      if (!fs.existsSync(envPath)) {
        logger.warn('Arquivo .env não encontrado, não é possível salvar refresh token');
        return;
      }

      let envContent = fs.readFileSync(envPath, 'utf-8');
      
      // Atualizar ou adicionar REFRESH_TOKEN
      if (envContent.includes('REFRESH_TOKEN=')) {
        envContent = envContent.replace(
          /REFRESH_TOKEN=.*/,
          `REFRESH_TOKEN=${newRefreshToken}`
        );
      } else {
        envContent += `\nREFRESH_TOKEN=${newRefreshToken}\n`;
      }

      fs.writeFileSync(envPath, envContent, 'utf-8');
      logger.info('💾 Refresh token salvo no arquivo .env');
    } catch (error: any) {
      logger.warn('⚠️ Não foi possível salvar refresh token no .env', { error: error.message });
    }
  }

  /**
   * Renovar access token usando refresh token
   */
  private async refreshAccessToken(): Promise<string | null> {
    if (!this.refreshToken) {
      // Se não tem refresh token, tentar login automático
      logger.info('🔄 Refresh token não disponível, tentando login automático...');
      return await this.autoLogin();
    }

    // Evitar múltiplas tentativas simultâneas de renovação
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        logger.info('🔄 Renovando access token...');
        
        // Criar cliente temporário sem autenticação para fazer a renovação
        const refreshClient = axios.create({
          baseURL: config.apiUrl,
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const response = await refreshClient.post<ApiResponse<{
          accessToken: string;
          refreshToken: string;
          expiresIn: number;
        }>>('/api/auth/refresh', {
          refreshToken: this.refreshToken,
        });

        if (response.data.success && response.data.data) {
          const { accessToken, refreshToken: newRefreshToken } = response.data.data;

          // Atualizar tokens
          this.currentAccessToken = accessToken;
          this.refreshToken = newRefreshToken;

          // Atualizar header padrão do cliente
          this.client.defaults.headers.Authorization = `Bearer ${accessToken}`;

          logger.info('✅ Token renovado com sucesso');

          // Salvar novo refresh token no .env
          await this.saveRefreshTokenToEnv(newRefreshToken);

          return accessToken;
        }

        logger.error('❌ Resposta inválida ao renovar token');
        // Se refresh token falhou, tentar login automático
        logger.info('🔄 Tentando login automático como fallback...');
        return await this.autoLogin();
      } catch (error: any) {
        if (error.response) {
          logger.error('❌ Erro ao renovar token', {
            status: error.response.status,
            error: error.response.data?.error || 'Erro desconhecido',
          });
        } else {
          logger.error('❌ Erro ao renovar token', { error: error.message });
        }
        
        // Se refresh token falhou, tentar login automático
        logger.info('🔄 Tentando login automático como fallback...');
        return await this.autoLogin();
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Testar conexão com a API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Se não há token mas há credenciais, tentar login automático primeiro
      if (!this.currentAccessToken && config.adminEmail && config.adminPassword) {
        logger.info('🔑 Não há token configurado, tentando login automático...');
        const loggedIn = await this.autoLogin();
        if (!loggedIn) {
          logger.error('❌ Falha no login automático. Verifique ADMIN_EMAIL e ADMIN_PASSWORD no .env');
          return false;
        }
        logger.info('✅ Login automático realizado com sucesso');
      }

      // Se ainda não há token após tentar login, retornar erro
      if (!this.currentAccessToken) {
        logger.error('❌ Token não disponível. Configure API_TOKEN ou ADMIN_EMAIL/ADMIN_PASSWORD no .env');
        return false;
      }

      // Testar conexão com a API
      const response = await this.client.get('/api/health');
      return response.status === 200;
    } catch (error: any) {
      if (error.code === 'ENOTFOUND') {
        logger.error('Não foi possível resolver o domínio da API. Verifique se a URL está correta no .env');
        logger.error(`URL configurada: ${config.apiUrl}`);
        logger.info('Para desenvolvimento local, use: http://localhost:3001');
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        // Se for erro de autenticação e tiver credenciais, tentar login automático
        if (config.adminEmail && config.adminPassword) {
          logger.info('🔑 Token inválido, tentando login automático...');
          const loggedIn = await this.autoLogin();
          if (loggedIn) {
            // Tentar novamente após login
            try {
              const retryResponse = await this.client.get('/api/health');
              return retryResponse.status === 200;
            } catch (retryError: any) {
              logger.error('Erro ao testar conexão após login automático', { error: retryError.message });
              return false;
            }
          }
        }
        logger.error('Erro de autenticação. Verifique API_TOKEN ou ADMIN_EMAIL/ADMIN_PASSWORD no .env');
      } else {
        logger.error('Erro ao testar conexão com API', { error: error.message });
      }
      return false;
    }
  }
}

export default ApiService;

