// src/backend/services/sankhya.service.js
const axios = require('axios');
const logger = require('../../../logger');

const SANKHYA_API_URL = process.env.SANKHYA_API_URL;
let systemBearerToken = null;

async function getSystemBearerToken(forceRefresh = false) {
    if (systemBearerToken && !forceRefresh) return systemBearerToken;
    try {
        logger.http('Autenticando o sistema para obter/renovar Bearer Token...');
        const response = await axios.post(
            `${SANKHYA_API_URL}/login`, {},
            { headers: {
                appkey: process.env.SANKHYA_APPKEY,
                username: process.env.SANKHYA_USERNAME,
                password: process.env.SANKHYA_PASSWORD,
                token: process.env.SANKHYA_TOKEN,
            }}
        );
        systemBearerToken = response.data.bearerToken;
        if (!systemBearerToken) throw new Error('Falha ao obter Bearer Token do sistema.');
        logger.info('Token de sistema obtido/renovado com sucesso.');
        return systemBearerToken;
    } catch (error) {
        logger.error(`ERRO CRÍTICO ao obter Bearer Token: ${error.message}`);
        systemBearerToken = null;
        throw new Error('Falha na autenticação do servidor proxy.');
    }
}

/**
 * Método "call" - Para TRANSAÇÕES (salvar, validar senha, etc.).
 * Usa o token em cache e o método POST.
 */
async function call(serviceName, requestBody) {
    let token = await getSystemBearerToken();
    const url = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
    try {
        const response = await axios.post(url, { requestBody }, { headers: { Authorization: `Bearer ${token}` } });
        const responseData = response.data;
        const isTokenError = responseData.error?.descricao?.includes("Bearer Token inválido ou Expirado") || (responseData.status === '0' && responseData.statusMessage?.includes("Usuário não logado"));
        if (isTokenError) {
             throw { isTokenError: true };
        }
        return responseData;
    } catch (error) {
        const isAuthError = error.isTokenError || error.response?.status === 401 || error.response?.status === 403;
        if (isAuthError) {
            logger.warn(`Token de sistema inválido para '${serviceName}'. Forçando renovação...`);
            token = await getSystemBearerToken(true);
            const retryResponse = await axios.post(url, { requestBody }, { headers: { Authorization: `Bearer ${token}` } });
            logger.info('Requisição reenviada com sucesso após renovação do token.');
            return retryResponse.data;
        }
        const errorMessage = error.response?.data?.statusMessage || error.message;
        throw new Error(errorMessage);
    }
}

/**
 * Método "callAsSystem" - Para CONSULTAS (SELECT / DbExplorerSP.executeQuery).
 * Sempre faz um novo login e usa o método GET, alinhado com o teste do Postman.
 */
async function callAsSystem(serviceName, requestBody) {
    logger.http(`Executando '${serviceName}' com um token de sistema novo (via GET)...`);
    try {
        const loginResponse = await axios.post(
            `${SANKHYA_API_URL}/login`, {},
            { headers: {
                appkey: process.env.SANKHYA_APPKEY,
                username: process.env.SANKHYA_USERNAME,
                password: process.env.SANKHYA_PASSWORD,
                token: process.env.SANKHYA_TOKEN,
            }}
        );
        const freshSystemToken = loginResponse.data.bearerToken;
        if (!freshSystemToken) throw new Error('Falha ao obter token de sistema para a consulta.');

        const url = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
        
        // MUDANÇA PRINCIPAL: Usando GET para alinhar com o teste do Postman
        const serviceResponse = await axios.get(url, {
            headers: { Authorization: `Bearer ${freshSystemToken}` },
            data: { requestBody }
        });

        return serviceResponse.data;
    } catch (error) {
        const errorMessage = error.response?.data?.statusMessage || `Falha ao executar ${serviceName} como sistema.`;
        logger.error(`Erro em callAsSystem: ${errorMessage}`);
        throw new Error(errorMessage);
    }
}

module.exports = {
    initializeSankhyaService: getSystemBearerToken,
    call,
    callAsSystem,
};