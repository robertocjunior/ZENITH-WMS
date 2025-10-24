/**
 * Copyright (c) 2025 Roberto Casali Junior. Todos os Direitos Reservados.
 *
 * AVISO DE PROPRIEDADE E CONFIDENCIALIDADE
 *
 * Este código-fonte é propriedade intelectual confidencial e proprietária de
 * Roberto Casali Junior. Seu uso, cópia, modificação, distribuição ou execução
 * são estritamente proibidos sem a autorização prévia, expressa e por escrito
 * do autor.
 *
 * Este software é regido pelos termos e condições estabelecidos no Contrato de
 * Licença de Usuário Final (EULA) que o acompanha. A violação destes termos
 * constitui uma infração à lei de direitos autorais (Lei nº 9.610/98) e
 * sujeitará o infrator às sanções aplicáveis.
 */

// src/backend/services/sankhya.service.js
const axios = require('axios');
const http = require('http'); // Adicionado para Keep-Alive
const https = require('https'); // Adicionado para Keep-Alive
const logger = require('../../../logger');

// --- Início: Configuração do Agente Keep-Alive ---
// Define agentes HTTP e HTTPS com Keep-Alive habilitado
const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 50, // Número máximo de sockets simultâneos (ajuste conforme necessário)
    keepAliveMsecs: 3000 // Tempo em ms para manter um socket inativo aberto (ajuste conforme necessário)
});
const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 3000
});

// Cria uma instância do Axios configurada com os agentes e baseURL
const sankhyaApi = axios.create({
    baseURL: process.env.SANKHYA_API_URL, // Define a URL base
    httpAgent: httpAgent, // Usa o agente HTTP
    httpsAgent: httpsAgent, // Usa o agente HTTPS (caso a API use HTTPS)
});
// --- Fim: Configuração do Agente Keep-Alive ---

const SANKHYA_API_URL = process.env.SANKHYA_API_URL; // Mantido para referência, mas baseURL é usado agora
let systemBearerToken = null;

// Modificado para usar sankhyaApi
async function getSystemBearerToken(forceRefresh = false) {
    if (systemBearerToken && !forceRefresh) return systemBearerToken;
    try {
        logger.http('Autenticando o sistema para obter Bearer Token...');
        // Usa a instância sankhyaApi e URL relativa '/login'
        const response = await sankhyaApi.post(
            `/login`, // URL relativa ao baseURL
            {},
            {
                headers: {
                    appkey: process.env.SANKHYA_APPKEY,
                    username: process.env.SANKHYA_USERNAME,
                    password: process.env.SANKHYA_PASSWORD,
                    token: process.env.SANKHYA_TOKEN,
                },
            }
        );
        systemBearerToken = response.data.bearerToken;
        if (!systemBearerToken)
            throw new Error('Falha ao obter Bearer Token do sistema.');
        logger.info('Token de sistema obtido com sucesso.');
        return systemBearerToken;
    } catch (error) {
        logger.error(`ERRO CRÍTICO ao obter Bearer Token: ${error.message}`);
        systemBearerToken = null;
        // Lança o erro para que chamadas subsequentes falhem se a autenticação inicial falhar
        throw new Error('Falha na autenticação do servidor proxy.');
    }
}

// Modificado para usar sankhyaApi
async function callSankhyaAsSystem(serviceName, requestBody) {
    logger.http(`Executando consulta como usuário de sistema: ${serviceName}`);
    let freshSystemToken = null;
    try {
        // Obter um token fresco para cada chamada 'AsSystem' ainda é uma boa prática
        const loginResponse = await sankhyaApi.post(
            `/login`, // URL relativa
            {},
            {
                headers: {
                    appkey: process.env.SANKHYA_APPKEY,
                    username: process.env.SANKHYA_USERNAME,
                    password: process.env.SANKHYA_PASSWORD,
                    token: process.env.SANKHYA_TOKEN,
                },
            }
        );
        freshSystemToken = loginResponse.data.bearerToken;
        if (!freshSystemToken) {
            throw new Error('Falha ao obter token de sistema para a consulta.');
        }

        // Usa a instância sankhyaApi e URL relativa
        const url = `/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
        const serviceResponse = await sankhyaApi.post(
            url,
            { requestBody },
            { headers: { Authorization: `Bearer ${freshSystemToken}` } }
        );
        return serviceResponse.data;
    } catch (error) {
        const errorMessage = error.response?.data?.statusMessage || `Falha ao executar ${serviceName} como sistema.`;
        logger.error(`Erro em callSankhyaAsSystem (${serviceName}): ${errorMessage}`, { errorData: error.response?.data });
        const serviceError = new Error(errorMessage);
        serviceError.sankhyaResponse = error.response?.data; // Anexa resposta para errorHandler
        throw serviceError;
    }
}

// --- INÍCIO DA MODIFICAÇÃO (JSESSIONID) ---
// Modificado para usar sankhyaApi e adicionar jsessionid
async function callSankhyaService(serviceName, requestBody, userJSessionId = null) {
    const url = `/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
    let headers = {};

    // 1. SEMPRE obter e definir o Bearer Token do sistema
    let token = await getSystemBearerToken(); // Obtem o token (cacheado ou novo)
    headers['Authorization'] = `Bearer ${token}`;
    logger.http(`Executando ${serviceName} com Bearer Token do sistema.`);

    // 2. SE userJSessionId for fornecido, ADICIONAR o Cookie
    if (userJSessionId) {
        headers['Cookie'] = `JSESSIONID=${userJSessionId}`;
        logger.http(`ADICIONANDO Cookie JSESSIONID do usuário para ${serviceName}.`);
    }

    try {
        const response = await sankhyaApi.post(
            url,
            { requestBody },
            { headers: headers } // Passa os headers (com Bearer e talvez Cookie)
        );
        const responseData = response.data;

        // --- LÓGICA DE RETENTATIVA (mantida, mas usa sankhyaApi e headers corretos) ---
        const isTokenExpiredError = responseData.error?.descricao?.includes("Bearer Token inválido ou Expirado");
        const isNotLoggedInError = responseData.status === '0' && responseData.statusMessage?.includes("Usuário não logado");
        const isUnauthorizedError = responseData.status === '0' && responseData.statusMessage?.includes("Não autorizado");

        if (isTokenExpiredError || isNotLoggedInError || isUnauthorizedError) {
            logger.warn(`Token de sistema inválido ou não autorizado em ${serviceName}. Forçando renovação... (Mensagem: ${responseData.statusMessage || 'Token Expirado'})`);
            token = await getSystemBearerToken(true); // Força refresh
            headers['Authorization'] = `Bearer ${token}`; // Atualiza o token no header
            // O Cookie (se existir) já está em 'headers'
            const retryResponse = await sankhyaApi.post(url, { requestBody }, { headers: headers });
            logger.info(`Requisição ${serviceName} reenviada com sucesso após renovação do token.`);
            return retryResponse.data;
        }
        return responseData;
    } catch (error) {
        if (error.response && error.response.data) {
            const errorData = error.response.data;

            // --- LÓGICA DE RETENTATIVA NO CATCH (mantida, mas usa sankhyaApi e headers corretos) ---
            const isTokenExpiredError = errorData.error?.descricao?.includes("Bearer Token inválido ou Expirado");
            const isNotLoggedInError = errorData.status === '0' && errorData.statusMessage?.includes("Usuário não logado");
            const isUnauthorizedError = errorData.status === '0' && errorData.statusMessage?.includes("Não autorizado");

            if (isTokenExpiredError || isNotLoggedInError || isUnauthorizedError) {
                logger.warn(`Token de sistema inválido ou não autorizado (em erro HTTP ${error.response.status}) para ${serviceName}. Forçando renovação... (Mensagem: ${errorData.statusMessage || 'Token Expirado'})`);
                token = await getSystemBearerToken(true); // Força refresh
                headers['Authorization'] = `Bearer ${token}`; // Atualiza o token no header
                try {
                     // Retry com sankhyaApi
                    const retryResponse = await sankhyaApi.post(url, { requestBody }, { headers: headers });
                    logger.info(`Requisição ${serviceName} reenviada com sucesso após renovação do token.`);
                    return retryResponse.data;
                } catch (retryError) {
                    logger.error(`Falha ao reenviar a requisição ${serviceName} após renovar o token: ${retryError.message}`);
                    const finalError = new Error(`Falha ao reenviar ${serviceName}: ${retryError.message}`);
                    finalError.sankhyaResponse = retryError.response?.data; // Anexa resposta do retry
                    throw finalError; // Lança erro final
                }
            }
        }
        // Se não for erro de token ou falha no retry, lança o erro original
        const serviceError = new Error(error.response?.data?.statusMessage || error.message || `Erro desconhecido em ${serviceName}`);
        serviceError.sankhyaResponse = error.response?.data; // Anexa resposta original
        throw serviceError;
    }
}
// --- FIM DA MODIFICAÇÃO (JSESSIONID) ---

// Exportamos as funções para que os controllers possam usá-las
module.exports = {
    initializeSankhyaService: getSystemBearerToken, // Mantém para inicialização no server.js
    callSankhyaService,
    callSankhyaAsSystem,
};