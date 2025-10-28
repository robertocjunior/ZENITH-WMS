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
const http = require('http');
const https = require('https');
const logger = require('../../../logger');

const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 3000
});
const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 3000
});

const sankhyaApi = axios.create({
    baseURL: process.env.SANKHYA_API_URL, // URL base padrão para API Gateway (Bearer Token)
    httpAgent: httpAgent,
    httpsAgent: httpsAgent,
});

// Instância separada para chamadas diretas MGE (JSESSIONID)
const sankhyaMgeApi = axios.create({
    baseURL: process.env.SANKHYA_URL || process.env.SANKHYA_API_URL, // Usa SANKHYA_URL se definida, senão fallback
    httpAgent: httpAgent,
    httpsAgent: httpsAgent,
});


let systemBearerToken = null; // Cache do token de sistema

// Função para obter o token (cacheado ou novo) - Usa a URL base padrão (sankhyaApi)
async function getSystemBearerToken(forceRefresh = false) {
    if (systemBearerToken && !forceRefresh) {
        return systemBearerToken;
    }
    try {
        logger.http('Autenticando o sistema para obter Bearer Token...');
        const response = await sankhyaApi.post( // Usa sankhyaApi para login do sistema
            `/login`,
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
        if (!systemBearerToken) {
            throw new Error('Falha ao obter Bearer Token do sistema (resposta vazia).');
        }
        logger.info('Novo token de sistema obtido com sucesso.');
        return systemBearerToken;
    } catch (error) {
        const errMsg = error.response?.data?.statusMessage || error.message;
        logger.error(`ERRO CRÍTICO ao obter Bearer Token: ${errMsg}`);
        systemBearerToken = null; // Limpa o cache em caso de erro
        throw new Error(`Falha na autenticação do servidor proxy: ${errMsg}`);
    }
}

// Função para tentar fazer logout de um token específico - Usa sankhyaApi
async function tryLogoutToken(tokenToLogout) {
    if (!tokenToLogout) return;
    try {
        logger.warn(`Tentando fazer logout do token de sistema potencialmente inválido: ${tokenToLogout.substring(0, 10)}...`);
        const logoutUrl = `/gateway/v1/mge/service.sbr?serviceName=MobileLoginSP.logout&outputType=json`;
        await sankhyaApi.get(logoutUrl, { // Usa sankhyaApi para logout
            headers: { Authorization: `Bearer ${tokenToLogout}` }
        });
        logger.info(`Logout do token ${tokenToLogout.substring(0, 10)}... realizado (ou já estava inválido).`);
    } catch (logoutError) {
        const logoutErrMsg = logoutError.response?.data?.statusMessage || logoutError.message;
        logger.error(`Erro ao tentar fazer logout do token ${tokenToLogout.substring(0, 10)}... : ${logoutErrMsg}. Prosseguindo para obter novo token.`);
    }
}


// callSankhyaAsSystem - usa sempre sankhyaApi (Gateway com Bearer Token)
async function callSankhyaAsSystem(serviceName, requestBody) {
    logger.http(`Executando consulta como sistema: ${serviceName}`);
    let tokenAttempt1 = null;
    let attempt = 1;

    while (attempt <= 2) {
        try {
            tokenAttempt1 = await getSystemBearerToken(true); // Força refresh

            const relativePath = `/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
            const fullUrlForLog = `${sankhyaApi.defaults.baseURL}${relativePath}`;
            logger.debug(`Tentativa ${attempt}: Executando ${serviceName} com token ${tokenAttempt1.substring(0, 10)}... em ${fullUrlForLog}`);

            const serviceResponse = await sankhyaApi.post( // Usa sankhyaApi
                relativePath,
                { requestBody },
                { headers: { Authorization: `Bearer ${tokenAttempt1}` } }
            );

            if (serviceResponse.data.status !== '1') {
                 logger.warn(`Tentativa ${attempt}: Resposta da API Sankhya para ${serviceName} indicou erro (status ${serviceResponse.data.status}): ${serviceResponse.data.statusMessage}`);
                 throw new Error(serviceResponse.data.statusMessage || `Erro retornado pela API Sankhya (status ${serviceResponse.data.status})`);
            }

            logger.info(`Tentativa ${attempt}: ${serviceName} executado com sucesso.`);
            return serviceResponse.data;

        } catch (error) {
            const errorMessage = error.response?.data?.statusMessage || error.message || `Erro desconhecido ao executar ${serviceName}`;
            logger.error(`Erro na Tentativa ${attempt} de callSankhyaAsSystem (${serviceName}): ${errorMessage}`, { errorData: error.response?.data });

             // Verifica se o erro é de token inválido para tentar renovar
             const isTokenError = errorMessage.includes("Bearer Token inválido ou Expirado") ||
                                  (errorMessage.includes("Usuário não logado") && attempt === 1); // Considera "Não logado" na 1ª tentativa como erro de token

            if (attempt === 1 && isTokenError) {
                logger.warn(`Token de sistema inválido/expirado detectado em ${serviceName}. Iniciando procedimento de logout e nova tentativa.`);
                await tryLogoutToken(tokenAttempt1);
                systemBearerToken = null;
                attempt++;
            } else {
                 if (error.response?.status === 404) {
                     const calledUrl = `${sankhyaApi.defaults.baseURL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
                     logger.error(`Received 404 Not Found for URL: ${calledUrl}. Check SANKHYA_API_URL and the path.`);
                 }
                logger.error(`Falha ao executar ${serviceName} (Tentativa ${attempt}). Desistindo. Erro: ${errorMessage}`);
                const serviceError = new Error(`Falha ao executar ${serviceName}: ${errorMessage}`);
                serviceError.sankhyaResponse = error.response?.data;
                throw serviceError;
            }
        }
    }
}


// --- Função callSankhyaService MODIFICADA ---
// Decide qual API e qual PATH usar baseado no serviceName e presença de userJSessionId
async function callSankhyaService(serviceName, requestBody, userJSessionId = null, userCodUsu = null) {

    // --- INÍCIO DA MODIFICAÇÃO DE LÓGICA ---
    // Verifica se é DatasetSP.save E se temos uma sessão de usuário para usar a API MGE direta
    const useMgeApiAndJSessionIdOnly = (serviceName === 'DatasetSP.save' || serviceName === 'ActionButtonsSP.executeScript') && userJSessionId; // Adicionado ActionButtonsSP.executeScript para correção

    const apiInstance = useMgeApiAndJSessionIdOnly ? sankhyaMgeApi : sankhyaApi;
    const relativePath = useMgeApiAndJSessionIdOnly
        ? `/mge/service.sbr?serviceName=${serviceName}&outputType=json` // Caminho direto MGE
        : `/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`; // Caminho via Gateway API
    const baseURL = apiInstance.defaults.baseURL;
    const fullUrlForLog = `${baseURL}${relativePath}`;

    logger.debug(`Service call details: useMgeApiAndJSessionIdOnly=${useMgeApiAndJSessionIdOnly}, serviceName=${serviceName}, baseURL=${baseURL}, relativePath=${relativePath}`);
    // --- FIM DA MODIFICAÇÃO DE LÓGICA ---

    let headers = {};
    let systemTokenForCall = null;

    if (useMgeApiAndJSessionIdOnly) {
        // Usa SOMENTE JSESSIONID
        headers['Cookie'] = `JSESSIONID=${userJSessionId}`;
        if (userCodUsu) {
            headers['Cookie'] += `; userIDLogado=${userCodUsu}`;
            logger.http(`Executando ${serviceName} (URL MGE: ${fullUrlForLog}) SOMENTE com Cookies JSESSIONID e userIDLogado do usuário.`);
        } else {
            logger.http(`Executando ${serviceName} (URL MGE: ${fullUrlForLog}) SOMENTE com Cookie JSESSIONID do usuário (sem userIDLogado).`);
        }
    } else {
        // Usa Bearer Token (e opcionalmente JSESSIONID se presente)
        try {
            systemTokenForCall = await getSystemBearerToken();
            headers['Authorization'] = `Bearer ${systemTokenForCall}`;
            logger.http(`Executando ${serviceName} (URL Gateway: ${fullUrlForLog}) com Bearer Token do sistema.`);

            // Adiciona cookies se existirem, mesmo com Bearer (para serviços que podem precisar)
             if (userJSessionId && userCodUsu) {
                headers['Cookie'] = `JSESSIONID=${userJSessionId}; userIDLogado=${userCodUsu}`;
                logger.http(`ADICIONANDO Cookies JSESSIONID e userIDLogado para ${serviceName}.`);
            } else if (userJSessionId) {
                headers['Cookie'] = `JSESSIONID=${userJSessionId}`;
                 logger.http(`ADICIONANDO Cookie JSESSIONID para ${serviceName} (sem userIDLogado).`);
            }
        } catch (tokenError) {
            logger.error(`Falha crítica ao obter token de sistema antes de chamar ${serviceName}: ${tokenError.message}`);
            throw tokenError;
        }
    }

    try {
        logger.http(`Fazendo POST para: ${fullUrlForLog}`); // Log antes da chamada
        const response = await apiInstance.post(
            relativePath,
            { requestBody },
            { headers: headers }
        );
        const responseData = response.data;

        // Lógica de tratamento de erros e retentativas (mantida como antes)
        const isSystemTokenExpiredError = responseData.error?.descricao?.includes("Bearer Token inválido ou Expirado") && !useMgeApiAndJSessionIdOnly;
        const isNotLoggedInError = responseData.status === '0' && responseData.statusMessage?.includes("Usuário não logado");
        const isUnauthorizedError = responseData.status === '0' && responseData.statusMessage?.includes("Não autorizado");

        if (isSystemTokenExpiredError || (isNotLoggedInError && !userJSessionId && !useMgeApiAndJSessionIdOnly)) { // Só renova token do sistema se não for chamada JSESSIONID-only
            logger.warn(`Token de sistema inválido/expirado detectado em ${serviceName}. Forçando renovação...`);
            await tryLogoutToken(systemTokenForCall);
            systemTokenForCall = await getSystemBearerToken(true);
            headers['Authorization'] = `Bearer ${systemTokenForCall}`;

            logger.info(`Reenviando ${serviceName} com novo token de sistema...`);
             const retryResponse = await apiInstance.post(
                 relativePath,
                 { requestBody },
                 { headers: headers }
            );

            if (retryResponse.data.status !== '1') {
                 logger.error(`Falha na retentativa de ${serviceName} após renovar token: ${retryResponse.data.statusMessage}`);
                 const retryFailError = new Error(retryResponse.data.statusMessage || `Erro na retentativa de ${serviceName} (status ${retryResponse.data.status})`);
                 retryFailError.sankhyaResponse = retryResponse.data;
                 throw retryFailError;
             }
            logger.info(`Requisição ${serviceName} reenviada com sucesso após renovação do token.`);
            return retryResponse.data;

        } else if ((isNotLoggedInError || isUnauthorizedError) && userJSessionId) {
             logger.warn(`Erro "${responseData.statusMessage}" em ${serviceName} com sessão de usuário ativa (JSESSIONID). Pode ser sessão do usuário expirada. Status: ${responseData.status}`);
             const userSessionError = new Error(responseData.statusMessage || "Não autorizado/logado (sessão do usuário pode ter expirado)");
             userSessionError.sankhyaResponse = responseData;
             throw userSessionError;
        } else if (responseData.status !== '1') {
            if (serviceName === 'ActionButtonsSP.executeSTP' && responseData.status === '2') {
                 logger.info(`Procedure ${serviceName} executada com status 2 (Sucesso com aviso): ${responseData.statusMessage}`);
                 return responseData;
            }
            logger.error(`Erro retornado pela API Sankhya para ${serviceName} (status ${responseData.status}): ${responseData.statusMessage}`);
             const apiError = new Error(responseData.statusMessage || `Erro da API Sankhya (status ${responseData.status})`);
             apiError.sankhyaResponse = responseData;
             throw apiError;
        }

        return responseData;

    } catch (error) {
        // Log detalhado do erro 404
        if (error.response?.status === 404) {
            logger.error(`Recebido 404 Not Found para URL: ${fullUrlForLog}. Verifique SANKHYA_URL/SANKHYA_API_URL e o caminho (${relativePath}) para ${serviceName}.`);
        } else {
             logger.error(`Erro na chamada ${serviceName}: ${error.message}`, { errorData: error.response?.data });
        }

        if (error.sankhyaResponse) { // Se já tivermos anexado a resposta antes (na lógica de status != 1)
             throw error;
        }

        const errorMessage = error.response?.data?.statusMessage || error.message || `Erro desconhecido em ${serviceName}`;
        const serviceError = new Error(errorMessage);
        serviceError.sankhyaResponse = error.response?.data;
        throw serviceError;
    }
}

module.exports = {
    initializeSankhyaService: getSystemBearerToken,
    callSankhyaService,
    callSankhyaAsSystem,
};