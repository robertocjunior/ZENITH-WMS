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
    baseURL: process.env.SANKHYA_API_URL,
    httpAgent: httpAgent,
    httpsAgent: httpsAgent,
});

let systemBearerToken = null; // Cache do token de sistema

// Função para obter o token (cacheado ou novo)
async function getSystemBearerToken(forceRefresh = false) {
    if (systemBearerToken && !forceRefresh) {
        // logger.debug('Usando Bearer Token do sistema em cache.'); // Log opcional
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
        systemBearerToken = null; // Limpa o cache em caso de erro
        throw new Error(`Falha na autenticação do servidor proxy: ${errMsg}`);
    }
}

// Função para tentar fazer logout de um token específico
async function tryLogoutToken(tokenToLogout) {
    if (!tokenToLogout) return; // Não faz nada se não houver token
    try {
        logger.warn(`Tentando fazer logout do token de sistema potencialmente inválido: ${tokenToLogout.substring(0, 10)}...`);
        const logoutUrl = `/gateway/v1/mge/service.sbr?serviceName=MobileLoginSP.logout&outputType=json`;
        // Usa GET para o logout conforme especificado
        await sankhyaApi.get(logoutUrl, {
            headers: { Authorization: `Bearer ${tokenToLogout}` }
        });
        logger.info(`Logout do token ${tokenToLogout.substring(0, 10)}... realizado (ou já estava inválido).`);
    } catch (logoutError) {
        // Apenas loga o erro do logout, pois o objetivo principal é obter um novo token
        const logoutErrMsg = logoutError.response?.data?.statusMessage || logoutError.message;
        logger.error(`Erro ao tentar fazer logout do token ${tokenToLogout.substring(0, 10)}... : ${logoutErrMsg}. Prosseguindo para obter novo token.`);
    }
}


// >>>>>>>> MODIFICAÇÃO PRINCIPAL AQUI <<<<<<<<<<
async function callSankhyaAsSystem(serviceName, requestBody) {
    logger.http(`Executando consulta como sistema: ${serviceName}`);
    let tokenAttempt1 = null;
    let attempt = 1;

    while (attempt <= 2) {
        try {
            // Na primeira tentativa, força a obtenção de um token novo
            // Na segunda tentativa (retry), também força a obtenção de um token novo após o logout
            tokenAttempt1 = await getSystemBearerToken(true); // Força refresh em ambas tentativas

            const url = `/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
            logger.debug(`Tentativa ${attempt}: Executando ${serviceName} com token ${tokenAttempt1.substring(0, 10)}...`);
            const serviceResponse = await sankhyaApi.post(
                url,
                { requestBody },
                { headers: { Authorization: `Bearer ${tokenAttempt1}` } }
            );

            // Verifica se a resposta indica um erro de API, mesmo com status HTTP 200
            if (serviceResponse.data.status !== '1') {
                 logger.warn(`Tentativa ${attempt}: Resposta da API Sankhya para ${serviceName} indicou erro (status ${serviceResponse.data.status}): ${serviceResponse.data.statusMessage}`);
                 throw new Error(serviceResponse.data.statusMessage || `Erro retornado pela API Sankhya (status ${serviceResponse.data.status})`);
            }

            logger.info(`Tentativa ${attempt}: ${serviceName} executado com sucesso.`);
            return serviceResponse.data; // Sucesso, retorna a resposta

        } catch (error) {
            const errorMessage = error.response?.data?.statusMessage || error.message || `Erro desconhecido ao executar ${serviceName}`;
            logger.error(`Erro na Tentativa ${attempt} de callSankhyaAsSystem (${serviceName}): ${errorMessage}`, { errorData: error.response?.data });

            if (attempt === 1) {
                logger.warn(`Iniciando procedimento de logout e nova tentativa para ${serviceName}.`);
                // Tenta fazer logout do token que falhou
                await tryLogoutToken(tokenAttempt1);
                // Limpa o token cacheado localmente para garantir que getSystemBearerToken busque um novo
                systemBearerToken = null;
                attempt++; // Incrementa para a próxima tentativa
                // O loop continuará para a tentativa 2
            } else {
                // Se falhou na segunda tentativa, lança o erro definitivo
                logger.error(`Falha na segunda tentativa de executar ${serviceName}. Desistindo.`);
                const serviceError = new Error(`Falha ao executar ${serviceName} após retentativa: ${errorMessage}`);
                serviceError.sankhyaResponse = error.response?.data;
                throw serviceError;
            }
        }
    }
}
// >>>>>>>> FIM DA MODIFICAÇÃO <<<<<<<<<<


// --- Função callSankhyaService (mantida como antes, com jsessionid + userIDLogado) ---
async function callSankhyaService(serviceName, requestBody, userJSessionId = null, userCodUsu = null) {
    const url = `/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
    let headers = {};
    let systemTokenForCall = null; // Token de sistema a ser usado nesta chamada

    // Tenta obter o token de sistema (pode vir do cache ou ser renovado)
    try {
        systemTokenForCall = await getSystemBearerToken(); // Não força refresh inicialmente aqui
        headers['Authorization'] = `Bearer ${systemTokenForCall}`;
        logger.http(`Executando ${serviceName} com Bearer Token do sistema.`);
    } catch (tokenError) {
         // Se falhar em obter o token inicial, já lança o erro.
        logger.error(`Falha crítica ao obter token de sistema antes de chamar ${serviceName}: ${tokenError.message}`);
        throw tokenError; // Re-lança o erro da obtenção do token
    }


    if (userJSessionId && userCodUsu) {
        headers['Cookie'] = `JSESSIONID=${userJSessionId}; userIDLogado=${userCodUsu}`;
        logger.http(`ADICIONANDO Cookies JSESSIONID e userIDLogado do usuário para ${serviceName}.`);
    } else if (userJSessionId) {
        headers['Cookie'] = `JSESSIONID=${userJSessionId}`;
        logger.http(`ADICIONANDO Cookie JSESSIONID do usuário para ${serviceName} (userIDLogado não fornecido).`);
    }

    try {
        const response = await sankhyaApi.post(
            url,
            { requestBody },
            { headers: headers }
        );
        const responseData = response.data;

        // Verifica erros específicos na resposta que indicam necessidade de renovar token de SISTEMA
        const isTokenExpiredError = responseData.error?.descricao?.includes("Bearer Token inválido ou Expirado");
        const isNotLoggedInError = responseData.status === '0' && responseData.statusMessage?.includes("Usuário não logado");
        const isUnauthorizedError = responseData.status === '0' && responseData.statusMessage?.includes("Não autorizado"); // Pode ser do sistema ou usuário

        // Apenas tenta renovar o token de SISTEMA se o erro for claramente dele
        if (isTokenExpiredError || (isNotLoggedInError && !userJSessionId)) { // Se não tem sessão de usuário, erro "não logado" é do sistema
            logger.warn(`Token de sistema inválido/expirado detectado em ${serviceName}. Forçando renovação... (Mensagem: ${responseData.statusMessage || 'Token Expirado'})`);

            await tryLogoutToken(systemTokenForCall); // Tenta logout do token antigo
            systemTokenForCall = await getSystemBearerToken(true); // Força refresh e atualiza a variável local
            headers['Authorization'] = `Bearer ${systemTokenForCall}`; // Atualiza o header para a retentativa

            logger.info(`Reenviando ${serviceName} com novo token de sistema...`);
            const retryResponse = await sankhyaApi.post(url, { requestBody }, { headers: headers });

            // Verifica se a retentativa deu certo
             if (retryResponse.data.status !== '1') {
                 logger.error(`Falha na retentativa de ${serviceName} após renovar token: ${retryResponse.data.statusMessage}`);
                 const retryFailError = new Error(retryResponse.data.statusMessage || `Erro na retentativa de ${serviceName} (status ${retryResponse.data.status})`);
                 retryFailError.sankhyaResponse = retryResponse.data;
                 throw retryFailError;
             }

            logger.info(`Requisição ${serviceName} reenviada com sucesso após renovação do token.`);
            return retryResponse.data; // Retorna o sucesso da retentativa
        } else if (isUnauthorizedError && userJSessionId) {
             // Erro "Não autorizado" QUANDO temos sessão de usuário pode ser SESSÃO DO USUÁRIO EXPIRADA
             logger.warn(`Erro "Não autorizado" em ${serviceName} com sessão de usuário ativa. Pode ser sessão do usuário expirada. Status: ${responseData.status}, Msg: ${responseData.statusMessage}`);
             const userSessionError = new Error(responseData.statusMessage || "Não autorizado (sessão do usuário pode ter expirado)");
             userSessionError.sankhyaResponse = responseData;
             // Lança erro para ser tratado pelo errorHandler (que pode retornar 401 para o frontend)
             throw userSessionError;
        } else if (responseData.status !== '1') {
            // Outros erros da API Sankhya (status != '1')
             logger.error(`Erro retornado pela API Sankhya para ${serviceName} (status ${responseData.status}): ${responseData.statusMessage}`);
             const apiError = new Error(responseData.statusMessage || `Erro da API Sankhya (status ${responseData.status})`);
             apiError.sankhyaResponse = responseData;
             throw apiError;
        }

        return responseData; // Retorna sucesso da primeira tentativa

    } catch (error) {
         // Verifica se o erro já foi tratado e enriquecido (como o userSessionError acima)
        if (error.sankhyaResponse) {
             throw error; // Apenas re-lança se já tem a resposta anexada
        }

        // Trata erros de rede ou outros erros do Axios
        const errorMessage = error.response?.data?.statusMessage || error.message || `Erro desconhecido em ${serviceName}`;
        logger.error(`Erro na chamada ${serviceName}: ${errorMessage}`, { errorData: error.response?.data });
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