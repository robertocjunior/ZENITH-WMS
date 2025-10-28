/**
 * Copyright (c) 2025 Roberto Casali Junior. Todos os Direitos Reservados.
 * (Avisos de propriedade omitidos para brevidade)
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

const sankhyaMgeApi = axios.create({
    baseURL: process.env.SANKHYA_URL || process.env.SANKHYA_API_URL, // Usa SANKHYA_URL se definida, senão fallback
    httpAgent: httpAgent,
    httpsAgent: httpsAgent,
});


let systemBearerToken = null;

async function getSystemBearerToken(forceRefresh = false) {
    if (systemBearerToken && !forceRefresh) {
        return systemBearerToken;
    }
    try {
        logger.http('Autenticando o sistema para obter Bearer Token...');
        const response = await sankhyaApi.post(
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
        systemBearerToken = null;
        throw new Error(`Falha na autenticação do servidor proxy: ${errMsg}`);
    }
}

async function tryLogoutToken(tokenToLogout) {
    if (!tokenToLogout) return;
    try {
        logger.warn(`Tentando fazer logout do token de sistema potencialmente inválido: ${tokenToLogout.substring(0, 10)}...`);
        const logoutUrl = `/gateway/v1/mge/service.sbr?serviceName=MobileLoginSP.logout&outputType=json`;
        await sankhyaApi.get(logoutUrl, {
            headers: { Authorization: `Bearer ${tokenToLogout}` }
        });
        logger.info(`Logout do token ${tokenToLogout.substring(0, 10)}... realizado (ou já estava inválido).`);
    } catch (logoutError) {
        const logoutErrMsg = logoutError.response?.data?.statusMessage || logoutError.message;
        logger.error(`Erro ao tentar fazer logout do token ${tokenToLogout.substring(0, 10)}... : ${logoutErrMsg}. Prosseguindo para obter novo token.`);
    }
}

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

            const serviceResponse = await sankhyaApi.post(
                relativePath,
                { requestBody },
                { headers: { Authorization: `Bearer ${tokenAttempt1}` } }
            );

            // A checagem aqui permanece apenas para status 1, pois DbExplorer não retorna 2
            if (serviceResponse.data.status !== '1') {
                 logger.warn(`Tentativa ${attempt}: Resposta da API Sankhya para ${serviceName} (callSankhyaAsSystem) indicou erro (status ${serviceResponse.data.status}): ${serviceResponse.data.statusMessage}`);
                 throw new Error(serviceResponse.data.statusMessage || `Erro retornado pela API Sankhya (status ${serviceResponse.data.status})`);
            }

            logger.info(`Tentativa ${attempt}: ${serviceName} executado com sucesso.`);
            return serviceResponse.data;

        } catch (error) {
            const errorMessage = error.response?.data?.statusMessage || error.message || `Erro desconhecido ao executar ${serviceName}`;
            logger.error(`Erro na Tentativa ${attempt} de callSankhyaAsSystem (${serviceName}): ${errorMessage}`, { errorData: error.response?.data });

             const isTokenError = errorMessage.includes("Bearer Token inválido ou Expirado") ||
                                  (errorMessage.includes("Usuário não logado") && attempt === 1);

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


async function callSankhyaService(serviceName, requestBody, userJSessionId = null, userCodUsu = null) {

    const useMgeApiAndJSessionIdOnly = (serviceName === 'DatasetSP.save' || serviceName === 'ActionButtonsSP.executeScript') && userJSessionId;

    const apiInstance = useMgeApiAndJSessionIdOnly ? sankhyaMgeApi : sankhyaApi;
    const relativePath = useMgeApiAndJSessionIdOnly
        ? `/mge/service.sbr?serviceName=${serviceName}&outputType=json` // Caminho direto MGE
        : `/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`; // Caminho via Gateway API
    const baseURL = apiInstance.defaults.baseURL;
    const fullUrlForLog = `${baseURL}${relativePath}`;

    logger.debug(`Service call details: useMgeApiAndJSessionIdOnly=${useMgeApiAndJSessionIdOnly}, serviceName=${serviceName}, baseURL=${baseURL}, relativePath=${relativePath}`);

    let headers = {};
    let systemTokenForCall = null;

    if (useMgeApiAndJSessionIdOnly) {
        headers['Cookie'] = `JSESSIONID=${userJSessionId}`;
        if (userCodUsu) {
            headers['Cookie'] += `; userIDLogado=${userCodUsu}`;
            logger.http(`Executando ${serviceName} (URL MGE: ${fullUrlForLog}) SOMENTE com Cookies JSESSIONID e userIDLogado do usuário.`);
        } else {
            logger.http(`Executando ${serviceName} (URL MGE: ${fullUrlForLog}) SOMENTE com Cookie JSESSIONID do usuário (sem userIDLogado).`);
        }
    } else {
        try {
            systemTokenForCall = await getSystemBearerToken();
            headers['Authorization'] = `Bearer ${systemTokenForCall}`;
            logger.http(`Executando ${serviceName} (URL Gateway: ${fullUrlForLog}) com Bearer Token do sistema.`);

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
        logger.http(`Fazendo POST para: ${fullUrlForLog}`);
        const response = await apiInstance.post(
            relativePath,
            { requestBody },
            { headers: headers }
        );
        const responseData = response.data;

        // --- INÍCIO DA MODIFICAÇÃO: Tratar Status 2 como sucesso para STP e Script ---
        const isSuccessStatus = responseData.status === '1' ||
                                (responseData.status === '2' &&
                                 (serviceName === 'ActionButtonsSP.executeSTP' || serviceName === 'ActionButtonsSP.executeScript'));
        // --- FIM DA MODIFICAÇÃO ---

        // Lógica de tratamento de erros e retentativas
        const isSystemTokenExpiredError = responseData.error?.descricao?.includes("Bearer Token inválido ou Expirado") && !useMgeApiAndJSessionIdOnly;
        const isNotLoggedInError = responseData.status === '0' && responseData.statusMessage?.includes("Usuário não logado");
        const isUnauthorizedError = responseData.status === '0' && responseData.statusMessage?.includes("Não autorizado");

        if (isSystemTokenExpiredError || (isNotLoggedInError && !userJSessionId && !useMgeApiAndJSessionIdOnly)) {
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

            // --- INÍCIO DA MODIFICAÇÃO: Reavaliar sucesso após retry ---
            const isRetrySuccessStatus = retryResponse.data.status === '1' ||
                                         (retryResponse.data.status === '2' &&
                                          (serviceName === 'ActionButtonsSP.executeSTP' || serviceName === 'ActionButtonsSP.executeScript'));

            if (!isRetrySuccessStatus) {
                 logger.error(`Falha na retentativa de ${serviceName} após renovar token (Status ${retryResponse.data.status}): ${retryResponse.data.statusMessage}`);
                 const retryFailError = new Error(retryResponse.data.statusMessage || `Erro na retentativa de ${serviceName} (status ${retryResponse.data.status})`);
                 retryFailError.sankhyaResponse = retryResponse.data;
                 throw retryFailError;
             }
             // --- FIM DA MODIFICAÇÃO ---
            logger.info(`Requisição ${serviceName} reenviada com sucesso após renovação do token (Status ${retryResponse.data.status}).`);
            return retryResponse.data; // Retorna o sucesso da retentativa

        } else if ((isNotLoggedInError || isUnauthorizedError) && userJSessionId) {
             logger.warn(`Erro "${responseData.statusMessage}" em ${serviceName} com sessão de usuário ativa (JSESSIONID). Pode ser sessão do usuário expirada. Status: ${responseData.status}`);
             const userSessionError = new Error(responseData.statusMessage || "Não autorizado/logado (sessão do usuário pode ter expirado)");
             userSessionError.sankhyaResponse = responseData;
             throw userSessionError;

        // --- INÍCIO DA MODIFICAÇÃO: Verifica se NÃO é sucesso ---
        } else if (!isSuccessStatus) {
        // --- FIM DA MODIFICAÇÃO ---
             // Outros erros da API Sankhya
             logger.error(`Erro retornado pela API Sankhya para ${serviceName} (status ${responseData.status}): ${responseData.statusMessage}`);
             const apiError = new Error(responseData.statusMessage || `Erro da API Sankhya (status ${responseData.status})`);
             apiError.sankhyaResponse = responseData;
             throw apiError;
        }

        // Log de sucesso, incluindo status 2
        if (responseData.status === '2') {
             logger.info(`${serviceName} executado com status 2 (Sucesso com aviso): ${responseData.statusMessage}`);
        } else {
             logger.info(`${serviceName} executado com sucesso (Status 1).`);
        }
        return responseData; // Retorna sucesso

    } catch (error) {
        if (error.response?.status === 404) {
            logger.error(`Recebido 404 Not Found para URL: ${fullUrlForLog}. Verifique SANKHYA_URL/SANKHYA_API_URL e o caminho (${relativePath}) para ${serviceName}.`);
        } else if (error.sankhyaResponse) { // Se o erro já foi construído e tem a resposta
             logger.error(`Erro pré-tratado na chamada ${serviceName}: ${error.message}`); // Log adicional
             // Não loga novamente os detalhes do erro, apenas re-lança
        } else {
             // Erro de rede ou Axios não tratado
             logger.error(`Erro genérico na chamada ${serviceName}: ${error.message}`, { errorData: error.response?.data });
        }

        // Garante que o erro lançado tenha a resposta anexa, se disponível
        if (!error.sankhyaResponse && error.response?.data) {
             error.sankhyaResponse = error.response.data;
        }
        throw error; // Re-lança o erro para ser tratado pelo controller ou errorHandler
    }
}

module.exports = {
    initializeSankhyaService: getSystemBearerToken,
    callSankhyaService,
    callSankhyaAsSystem,
};