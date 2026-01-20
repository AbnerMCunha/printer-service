import { Socket } from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import config from '../config/config';
import logger from '../utils/logger';
import { Order } from '../types';
import { formatReceipt } from '../utils/receiptFormatter';

const execAsync = promisify(exec);

// Comandos ESC/POS
const ESC = '\x1B';
const GS = '\x1D';

const ESCPOS_COMMANDS = {
  INIT: ESC + '@',
  CUT: GS + 'V' + '\x41' + '\x03',
  LINE_FEED: '\n',
  DRAW_LINE: '-'.repeat(32) + '\n',
  // Modo silencioso - desabilita buzzer/alertas sonoros
  SILENT_MODE: ESC + '\x35' + '\x01', // ESC 5 n (onde n=1 desabilita buzzer)
};

export class PrinterService {
  private socket: Socket | null = null;
  private isConnected = false;
  private connectionAttempts = 0;
  private maxConnectionAttempts = 3;

  /**
   * Conectar à impressora via TCP/IP ou verificar USB/COM
   */
  async connect(): Promise<boolean> {
    // Se for térmica USB/COM (sem IP), não precisa conectar via socket
    if (config.printerType === 'thermal' && !config.printerIp && config.printerName) {
      this.isConnected = true;
      logger.info(`Impressora térmica USB/COM configurada: ${config.printerName}`);
      return true;
    }

    // Se for impressora do sistema, não precisa conectar via socket
    if (config.printerType === 'system') {
      this.isConnected = true;
      return true;
    }

    if (this.isConnected && this.socket && !this.socket.destroyed) {
      return true;
    }

    return new Promise((resolve) => {
      this.connectionAttempts++;

      logger.info(`Conectando à impressora ${config.printerIp}:${config.printerPort}...`, {
        attempt: this.connectionAttempts,
      });

      this.socket = new Socket();

      // Timeout de conexão
      const connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          this.socket?.destroy();
          logger.error('Timeout ao conectar à impressora');
          resolve(false);
        }
      }, 5000); // 5 segundos

      this.socket.on('connect', () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.connectionAttempts = 0;
        logger.info('Conectado à impressora com sucesso');
        resolve(true);
      });

      this.socket.on('error', (error) => {
        clearTimeout(connectionTimeout);
        this.isConnected = false;
        logger.error('Erro ao conectar à impressora', { error: error.message });

        if (this.connectionAttempts < this.maxConnectionAttempts) {
          logger.info(`Tentando reconectar em 3 segundos... (${this.connectionAttempts}/${this.maxConnectionAttempts})`);
          setTimeout(() => {
            this.connect().then(resolve);
          }, 3000);
        } else {
          logger.error('Número máximo de tentativas de conexão atingido');
          resolve(false);
        }
      });

      this.socket.on('close', () => {
        this.isConnected = false;
        logger.warn('Conexão com impressora fechada');
      });

      // Tentar conectar
      try {
        this.socket.connect(config.printerPort, config.printerIp);
      } catch (error: any) {
        clearTimeout(connectionTimeout);
        logger.error('Erro ao iniciar conexão', { error: error.message });
        resolve(false);
      }
    });
  }

  /**
   * Desconectar da impressora
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
    logger.info('Desconectado da impressora');
  }

  /**
   * Enviar dados para impressora
   */
  private async sendData(data: string | Buffer): Promise<boolean> {
    if (!this.socket || !this.isConnected) {
      throw new Error('Impressora não conectada');
    }

    return new Promise((resolve, reject) => {
      const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

      this.socket!.write(buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Imprimir diretamente em porta COM (Windows)
   */
  private async printViaComPort(receiptText: string, comPort: string): Promise<boolean> {
    const platform = os.platform();
    
    if (platform !== 'win32') {
      logger.error('Impressão via porta COM só está disponível no Windows');
      return false;
    }

    const tempFile = path.join(os.tmpdir(), `receipt-com-${Date.now()}.txt`);

    try {
      // Criar arquivo temporário com encoding correto
      fs.writeFileSync(tempFile, receiptText, 'utf-8');
      
      logger.info(`Enviando para porta COM: ${comPort}`);
      logger.debug(`Arquivo temporário: ${tempFile}`);

      // Usar comando COPY do Windows para enviar diretamente para a porta COM
      // COPY /B garante modo binário (importante para comandos ESC/POS)
      const command = `copy /B "${tempFile}" "${comPort}"`;

      logger.debug(`Comando: ${command}`);

      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024,
        timeout: 30000,
      });

      // COPY geralmente não retorna nada em stdout quando bem-sucedido
      if (stderr) {
        const stderrLower = stderr.toLowerCase();
        const hasError = 
          stderrLower.includes('error') ||
          stderrLower.includes('erro') ||
          stderrLower.includes('não encontrado') ||
          stderrLower.includes('not found') ||
          stderrLower.includes('acesso negado') ||
          stderrLower.includes('access denied') ||
          stderrLower.includes('não é possível') ||
          stderrLower.includes('cannot');

        if (hasError) {
          logger.error(`Erro ao imprimir na porta COM ${comPort}: ${stderr}`);
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e: any) {
            logger.debug(`Erro ao remover arquivo temporário: ${e.message}`);
          }
          return false;
        } else {
          // Avisos que não são erros
          logger.debug(`Aviso do COPY: ${stderr.substring(0, 100)}`);
        }
      }

      // Limpar arquivo temporário após sucesso
      setTimeout(() => {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            logger.debug(`Arquivo temporário removido: ${tempFile}`);
          }
        } catch (e: any) {
          logger.warn(`Não foi possível remover arquivo temporário: ${e.message}`);
        }
      }, 5000);

      logger.info(`✅ Dados enviados para porta COM ${comPort}`);
      return true;
    } catch (error: any) {
      logger.error('Erro ao imprimir via porta COM', {
        error: error.message,
        stderr: error.stderr,
        stdout: error.stdout,
        comPort,
      });

      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (e: any) {
        logger.debug(`Erro ao limpar arquivo temporário: ${e.message}`);
      }

      return false;
    }
  }

  /**
   * Imprimir usando spooler do sistema (impressoras normais)
   */
  private async printViaSystemPrinter(receiptText: string): Promise<boolean> {
    const platform = os.platform();
    const printerName = config.printerName || '';
    
    // Declarar tempFile fora do try para acessibilidade no catch
    const tempFile = path.join(os.tmpdir(), `receipt-${Date.now()}.txt`);

    try {
      // Criar arquivo temporário
      fs.writeFileSync(tempFile, receiptText, 'utf-8');
      
      logger.info(`Arquivo temporário criado: ${tempFile}`);
      logger.debug(`Tamanho do conteúdo: ${receiptText.length} caracteres`);

      let command: string;

      if (platform === 'win32') {
        // Windows: usar PowerShell Out-Printer (enfileira automaticamente quando impressora ocupada)
        if (printerName) {
          // Verificar se a impressora existe antes de imprimir (opcional)
          const checkPrinter = `powershell -Command "Get-Printer -Name '${printerName.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"`;
          try {
            const { stdout: printerCheck } = await execAsync(checkPrinter, { timeout: 3000 });
            if (printerCheck && printerCheck.trim()) {
              logger.debug(`Impressora '${printerName}' encontrada e disponível`);
            }
          } catch (e: any) {
            // Ignorar erro de verificação, tentar imprimir mesmo assim
            logger.debug(`Não foi possível verificar impressora: ${e.message}`);
          }
          
          // Usar PowerShell Out-Printer (enfileira automaticamente quando impressora ocupada)
          // Escapar aspas simples no caminho do arquivo e nome da impressora
          const escapedFile = tempFile.replace(/'/g, "''");
          const escapedPrinterName = printerName.replace(/'/g, "''");
          command = `powershell -Command "Get-Content -Path '${escapedFile}' -Raw -Encoding UTF8 | Out-Printer -Name '${escapedPrinterName}'"`;
        } else {
          // Usar impressora padrão
          const escapedFile = tempFile.replace(/'/g, "''");
          command = `powershell -Command "Get-Content -Path '${escapedFile}' -Raw -Encoding UTF8 | Out-Printer"`;
        }
      } else {
        // Linux/macOS: usar lp ou lpr
        if (printerName) {
          command = `lp -d "${printerName}" "${tempFile}"`;
        } else {
          command = `lp "${tempFile}"`;
        }
      }

      logger.info(`Enviando para impressora do sistema: ${printerName || 'padrão'}`);
      logger.debug(`Comando: ${command.substring(0, 150)}...`);
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024, // 1MB buffer
        timeout: 30000, // 30 segundos timeout
      });

      // PowerShell Out-Printer geralmente não retorna nada em stdout quando bem-sucedido
      // Apenas verificar erros reais em stdout e stderr
      if (stdout) {
        const outputLower = (stdout || '').toLowerCase();
        
        // Log de debug para verificar o que está sendo analisado
        logger.debug(`Analisando saída do comando (${outputLower.length} chars): ${outputLower.substring(0, 100)}`);
        
        // Padrões de erro no PowerShell
        const hasErrorKeywords = 
          outputLower.includes('erro') ||
          outputLower.includes('error') ||
          outputLower.includes('exception') ||
          outputLower.includes('cannot') ||
          outputLower.includes('unable') ||
          outputLower.includes('failed') ||
          outputLower.includes('falha') ||
          outputLower.includes('nao encontrado') ||
          outputLower.includes('not found') ||
          outputLower.includes('access denied') ||
          outputLower.includes('permission denied') ||
          outputLower.includes('not recognized') ||
          outputLower.includes('não reconhecido');
        
        if (hasErrorKeywords) {
          logger.error(`❌ Erro detectado na saída do comando: ${stdout}`);
          logger.error(`Pedido NÃO será marcado como impresso devido ao erro da impressora`);
          // Limpar arquivo temporário imediatamente em caso de erro
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e: any) {
            logger.debug(`Erro ao remover arquivo temporário: ${e.message}`);
          }
          return false;
        } else if (outputLower.trim().length > 0) {
          // Se tem output mas não é erro, logar como debug
          logger.debug(`Output do PowerShell: ${stdout.substring(0, 200)}`);
        }
      }

      // Verificar stderr por erros
      if (stderr) {
        const stderrLower = stderr.toLowerCase();
        
        // Padrões de erro no PowerShell stderr
        const hasErrorInStderr = 
          stderrLower.includes('error') ||
          stderrLower.includes('exception') ||
          stderrLower.includes('erro') ||
          stderrLower.includes('não encontrado') ||
          stderrLower.includes('not found') ||
          stderrLower.includes('cannot') ||
          stderrLower.includes('unable') ||
          stderrLower.includes('failed') ||
          stderrLower.includes('access denied') ||
          stderrLower.includes('permission denied');
        
        if (hasErrorInStderr) {
          logger.error(`❌ Erro detectado no stderr: ${stderr}`);
          logger.error(`Pedido NÃO será marcado como impresso devido ao erro da impressora`);
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e: any) {
            logger.debug(`Erro ao remover arquivo temporário: ${e.message}`);
          }
          return false;
        } else {
          // Avisos comuns do PowerShell que não são erros (como Write-Progress)
          if (!stderrLower.includes('write-progress') && !stderrLower.includes('progress')) {
            logger.debug(`Aviso do PowerShell: ${stderr.substring(0, 100)}`);
          }
        }
      }

      // Se stdout e stderr estão vazios ou não contêm erros, consideramos sucesso
      // PowerShell Out-Printer não retorna mensagens de sucesso quando bem-sucedido
      if (!stdout || stdout.trim().length === 0) {
        logger.debug('PowerShell Out-Printer executado - impressão enfileirada com sucesso');
      }

      // Verificar se o arquivo foi processado (aguardar antes de limpar)
      setTimeout(() => {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            logger.debug(`Arquivo temporário removido: ${tempFile}`);
          }
        } catch (e: any) {
          logger.warn(`Não foi possível remover arquivo temporário: ${e.message}`);
        }
      }, 10000); // 10 segundos para dar tempo da impressora processar

      return true;
    } catch (error: any) {
      // Se PowerShell Out-Printer falhou com "Identificador inválido" no Windows, tentar comando print como fallback
      const errorMessage = (error.message || '').toLowerCase();
      const errorStderr = (error.stderr || '').toLowerCase();
      const hasInvalidHandleError = 
        errorMessage.includes('identificador') ||
        errorMessage.includes('invalid') ||
        errorStderr.includes('identificador') ||
        errorStderr.includes('win32exception') ||
        errorStderr.includes('invalid handle');

      if (platform === 'win32' && printerName && hasInvalidHandleError) {
        logger.warn('PowerShell Out-Printer falhou com "Identificador inválido", tentando comando print como fallback...');
        
        try {
          // Tentar comando print do Windows como fallback
          const escapedFile = tempFile.replace(/"/g, '""');
          const fallbackCommand = `print /D:"${printerName}" "${escapedFile}"`;
          
          logger.debug(`Executando fallback com comando: ${fallbackCommand.substring(0, 100)}...`);
          
          const { stdout: printStdout, stderr: printStderr } = await execAsync(fallbackCommand, {
            maxBuffer: 1024 * 1024,
            timeout: 30000,
          });
          
          // Verificar se o print funcionou
          const outputLower = (printStdout || '').toLowerCase();
          const hasSuccessMessage = 
            outputLower.includes('esta sendo impresso') || 
            outputLower.includes('está sendo impresso') ||
            outputLower.includes('being printed');
          
          const hasErrorMessage = 
            outputLower.includes('inicializar') ||
            outputLower.includes('dispositivo') ||
            outputLower.includes('não é possível') ||
            outputLower.includes('não encontrado') ||
            outputLower.includes('not found');
          
          if (hasSuccessMessage || (!hasErrorMessage && !printStderr)) {
            logger.info('✅ Comando print (fallback) funcionou com sucesso');
            
            // Limpar arquivo temporário após sucesso
            setTimeout(() => {
              try {
                if (fs.existsSync(tempFile)) {
                  fs.unlinkSync(tempFile);
                  logger.debug(`Arquivo temporário removido: ${tempFile}`);
                }
              } catch (e: any) {
                logger.warn(`Não foi possível remover arquivo temporário: ${e.message}`);
              }
            }, 10000);
            
            return true;
          } else {
            // Print também falhou
            logger.error('❌ Comando print (fallback) também falhou', {
              stdout: printStdout,
              stderr: printStderr,
            });
            throw error; // Lançar erro original para processar como falha total
          }
        } catch (fallbackError: any) {
          logger.error('❌ Ambos os métodos (Out-Printer e print) falharam', {
            originalError: error.message,
            fallbackError: fallbackError.message,
            originalStderr: error.stderr,
            fallbackStderr: fallbackError.stderr,
          });
          
          // Limpar arquivo temporário em caso de erro total
          try {
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          } catch (e: any) {
            logger.debug(`Erro ao limpar arquivo temporário: ${e.message}`);
          }
          
          return false;
        }
      }
      
      // Se não for erro de "Identificador inválido" ou não for Windows, processar erro normalmente
      logger.error('Erro ao imprimir via sistema', { 
        error: error.message,
        stderr: error.stderr,
        stdout: error.stdout,
        printerName: printerName || 'padrão',
        platform,
      });
      
      // Limpar arquivo temporário em caso de erro
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (e: any) {
        logger.debug(`Erro ao limpar arquivo temporário: ${e.message}`);
      }
      
      return false;
    }
  }

  /**
   * Testar conexão com impressora
   */
  async testConnection(): Promise<boolean> {
    // Para impressoras do sistema, não precisa testar conexão TCP
    if (config.printerType === 'system') {
      logger.info('Impressora do sistema configurada - teste de conexão não necessário');
      return true;
    }

    // Para impressoras térmicas USB/COM, não precisa testar conexão TCP
    if (config.printerType === 'thermal' && !config.printerIp && config.printerName) {
      logger.info(`Impressora térmica USB/COM configurada: ${config.printerName} - teste de conexão não necessário`);
      return true;
    }

    // Para impressoras térmicas via rede, testar conexão TCP
    const connected = await this.connect();
    if (connected) {
      try {
        // Enviar comando de inicialização
        await this.sendData(ESCPOS_COMMANDS.INIT);
        // Ativar modo silencioso (sem bipes/alertas)
        await this.sendData(ESCPOS_COMMANDS.SILENT_MODE);
        await this.sendData('TESTE DE CONEXAO\n');
        await this.sendData(ESCPOS_COMMANDS.DRAW_LINE);
        await this.sendData(ESCPOS_COMMANDS.CUT);
        logger.info('Teste de impressão enviado com sucesso');
      } catch (error: any) {
        logger.error('Erro ao testar impressão', { error: error.message });
        return false;
      }
    }
    return connected;
  }

  /**
   * Imprimir recibo de pedido
   */
  async printReceipt(order: Order, restaurantName: string, retries = 2): Promise<boolean> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        logger.info(`Iniciando impressão do pedido ${order.id.slice(-8)} (tentativa ${attempt + 1}/${retries + 1})`);

        // Formatar recibo em texto
        const receiptText = formatReceipt(order, restaurantName);

        // Escolher método baseado no tipo de impressora
        if (config.printerType === 'system') {
          const printed = await this.printViaSystemPrinter(receiptText);
          if (printed) {
            logger.info(`✅ Pedido ${order.id.slice(-8)} enviado para impressora do sistema`);
            return true;
          }
        } else if (config.printerType === 'thermal' && !config.printerIp && config.printerName) {
          // Impressora térmica USB/COM: verificar se é porta COM ou nome de impressora
          const printerName = config.printerName.trim().toUpperCase();
          const isComPort = printerName.startsWith('COM') && /^COM\d+$/.test(printerName);
          
          const receiptWithEscPos = ESCPOS_COMMANDS.INIT + 
                                    ESCPOS_COMMANDS.SILENT_MODE + 
                                    receiptText + 
                                    ESCPOS_COMMANDS.CUT;
          
          let printed: boolean;
          
          if (isComPort) {
            // Porta COM: usar método direto de escrita na porta
            logger.info(`Imprimindo via porta COM: ${printerName}`);
            printed = await this.printViaComPort(receiptWithEscPos, printerName);
          } else {
            // Nome de impressora: usar método do sistema
            logger.info(`Imprimindo via impressora do sistema: ${config.printerName}`);
            printed = await this.printViaSystemPrinter(receiptWithEscPos);
          }
          
          if (printed) {
            logger.info(`✅ Pedido ${order.id.slice(-8)} enviado para impressora térmica USB/COM: ${config.printerName}`);
            return true;
          }
        } else {
          // Impressora térmica via rede (TCP/IP): usar conexão direta
          if (!this.isConnected || !this.socket) {
            logger.warn('Impressora não conectada, tentando conectar...');
            const connected = await this.connect();
            if (!connected) {
              if (attempt < retries) {
                logger.warn(`Tentativa ${attempt + 1} falhou, tentando novamente...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
              }
              logger.error('Não foi possível conectar à impressora');
              return false;
            }
          }

          // Inicializar impressora
          await this.sendData(ESCPOS_COMMANDS.INIT);
          await this.sendData(ESCPOS_COMMANDS.SILENT_MODE);

          // Enviar texto do recibo
          await this.sendData(receiptText);

          // Cortar papel
          await this.sendData(ESCPOS_COMMANDS.CUT);

          logger.info(`✅ Pedido ${order.id.slice(-8)} impresso com sucesso`);
          return true;
        }

        // Se chegou aqui e não retornou true, houve falha
        if (attempt < retries) {
          logger.warn(`Tentativa ${attempt + 1} falhou, tentando novamente em ${1000 * (attempt + 1)}ms...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Backoff exponencial
          continue;
        }

        return false;
      } catch (error: any) {
        logger.error(`Erro ao imprimir recibo (tentativa ${attempt + 1})`, {
          orderId: order.id.slice(-8),
          error: error.message,
          stack: error.stack,
        });

        // Tentar reconectar se houver erro de conexão (apenas para térmicas)
        if (config.printerType === 'thermal') {
          if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout') || error.message.includes('não conectada')) {
            this.isConnected = false;
            logger.warn('Conexão perdida, tentando reconectar...');
            await this.connect();
          }
        }

        // Se ainda há tentativas, continuar
        if (attempt < retries) {
          logger.warn(`Tentativa ${attempt + 1} falhou, tentando novamente em ${1000 * (attempt + 1)}ms...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }

        // Última tentativa falhou
        return false;
      }
    }

    return false;
  }

  /**
   * Verificar se está conectado
   */
  getConnected(): boolean {
    // Para impressoras do sistema, sempre considerar conectado
    if (config.printerType === 'system') {
      return true;
    }
    // Para térmicas USB/COM, sempre considerar conectado
    if (config.printerType === 'thermal' && !config.printerIp && config.printerName) {
      return true;
    }
    // Para térmicas via rede, verificar conexão TCP
    return this.isConnected && this.socket !== null && !this.socket.destroyed;
  }
}

export default PrinterService;

