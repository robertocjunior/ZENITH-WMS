// src/backend/services/sankhya.service.js
const axios = require('axios');
const logger = require('../../../logger');

const SANKHYA_API_URL = process.env.SANKHYA_API_URL;

/**
 * Esta é a função principal para fazer chamadas à API Sankhya
 * usando as credenciais de sistema do arquivo .env.
 *
 * ELA AGORA REPLICA A LÓGICA DO SEU server.js ORIGINAL:
 * 1. Faz um novo login de sistema a CADA chamada.
 * 2. Pega um bearer token novo.
 * 3. Executa o serviço solicitado com o token novo.
 * 4. Não usa cache de token.
 */
const callAsSystem = async (serviceName, requestBody) => {
    logger.http(`Executando '${serviceName}' como usuário de sistema...`);
    try {
        // Passo 1: Fazer um novo login de sistema para obter um token fresco.
        const loginResponse = await axios.post(
            `${SANKHYA_API_URL}/login`,
            {}, // Corpo vazio
            {
                headers: {
                    appkey: process.env.SANKHYA_APPKEY,
                    username: process.env.SANKHYA_USERNAME,
                    password: process.env.SANKHYA_PASSWORD,
                    token: process.env.SANKHYA_TOKEN,
                },
            }
        );

        const freshSystemToken = loginResponse.data.bearerToken;
        if (!freshSystemToken) {
            throw new Error('Falha ao obter token de sistema para a consulta na API Sankhya.');
        }

        // Passo 2: Usar o token fresco para fazer a chamada ao serviço desejado.
        const url = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
        
        // Usando POST, que é o método mais comum e robusto para o gateway de serviços Sankhya.
        const serviceResponse = await axios.post(
            url,
            { requestBody }, // O corpo da requisição do serviço vai aqui
            { headers: { Authorization: `Bearer ${freshSystemToken}` } }
        );

        return serviceResponse.data;

    } catch (error) {
        // Captura e formata o erro para ser mais claro
        const errorMessage = error.response?.data?.statusMessage || error.message || `Falha ao executar ${serviceName} como sistema.`;
        logger.error(`Erro em callAsSystem: ${errorMessage}`);
        throw new Error(errorMessage);
    }
};


// Esta função agora será apenas um "apelido" para callAsSystem, mantendo a consistência.
const call = async (serviceName, requestBody) => {
    return callAsSystem(serviceName, requestBody);
};


// Função chamada apenas uma vez no início do servidor para garantir que as credenciais do .env são válidas.
const initializeSankhyaService = async () => {
    try {
        logger.http('Verificando a conexão inicial com a API Sankhya...');
        // Tenta fazer uma chamada simples para validar a conexão.
        await callAsSystem('MobileLoginSP.login', { NOMUSU: { $: 'TESTE_CONEXAO' } });
        logger.info('Conexão inicial com Sankhya verificada com sucesso.');
    } catch (error) {
        // Ignora erros específicos de "usuário não encontrado", pois o objetivo é apenas validar a comunicação.
        if (!error.message.includes('Usuário não encontrado')) {
            throw error; // Lança outros erros (ex: de conexão, credenciais inválidas)
        }
        logger.info('Conexão inicial com Sankhya verificada com sucesso (ignorando erro de usuário de teste).');
    }
};

module.exports = {
    initializeSankhyaService,
    call,
    callAsSystem,
};