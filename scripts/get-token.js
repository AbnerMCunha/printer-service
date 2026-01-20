#!/usr/bin/env node

/**
 * Script helper para obter token JWT do admin
 * 
 * Uso:
 *   node scripts/get-token.js <email> <senha>
 * 
 * Exemplo:
 *   node scripts/get-token.js admin@restaurant.com admin123
 */

const axios = require('axios');
const readline = require('readline');

const API_URL = process.env.API_URL || 'http://localhost:3001';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function getToken() {
  try {
    let email, password;

    // Se argumentos foram fornecidos via linha de comando
    if (process.argv.length >= 4) {
      email = process.argv[2];
      password = process.argv[3];
    } else {
      // Solicitar interativamente
      console.log('\n🔐 Obter Token JWT para Printer Service\n');
      console.log(`API URL: ${API_URL}\n`);
      
      email = await question('Email do admin: ');
      password = await question('Senha: ');
    }

    console.log('\n⏳ Fazendo login...\n');

    const response = await axios.post(`${API_URL}/api/admin/login`, {
      email: email.trim(),
      password: password
    });

    if (response.data.success && response.data.data) {
      const { accessToken, refreshToken } = response.data.data;
      
      console.log('✅ Login realizado com sucesso!\n');
      console.log('📋 Tokens obtidos:\n');
      console.log('─'.repeat(80));
      console.log('ACCESS TOKEN:');
      console.log(accessToken);
      console.log('─'.repeat(80));
      console.log('\nREFRESH TOKEN:');
      console.log(refreshToken);
      console.log('─'.repeat(80));
      console.log('\n📝 Adicione ao arquivo .env:\n');
      console.log(`API_TOKEN=${accessToken}`);
      if (refreshToken) {
        console.log(`REFRESH_TOKEN=${refreshToken}\n`);
        console.log('💡 Com o REFRESH_TOKEN configurado, o serviço renovará o token automaticamente!');
        console.log('💡 Você não precisará atualizar manualmente quando o token expirar.\n');
      } else {
        console.log('\n⚠️  REFRESH_TOKEN não encontrado na resposta.');
        console.log('💡 O token expirará após 15 minutos. Configure o REFRESH_TOKEN para renovação automática.\n');
      }
    } else {
      console.error('❌ Erro: Resposta inesperada do servidor');
      console.error(response.data);
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ Erro ao fazer login:');
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Mensagem: ${error.response.data?.error || 'Erro desconhecido'}`);
      
      if (error.response.status === 401) {
        console.error('\n💡 Verifique se o email e senha estão corretos.');
      }
    } else if (error.request) {
      console.error('❌ Erro: Não foi possível conectar ao servidor');
      console.error(`   URL: ${API_URL}`);
      console.error('\n💡 Verifique se o backend está rodando e a URL está correta.');
    } else {
      console.error('❌ Erro:', error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

getToken();

