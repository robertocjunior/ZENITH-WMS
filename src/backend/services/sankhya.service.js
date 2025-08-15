// src/backend/services/sankhya.service.js
const axios = require('axios');
const logger = require('../../../logger');

// Variáveis e funções copiadas do seu server.js original
const SANKHYA_API_URL = process.env.SANKHYA_API_URL;
let systemBearerToken = null;

async function getSystemBearerToken(forceRefresh = false) {
	if (systemBearerToken && !forceRefresh) return systemBearerToken;
	try {
		logger.http('Autenticando o sistema para obter Bearer Token...');
		const response = await axios.post(
			`${SANKHYA_API_URL}/login`,
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
		throw new Error('Falha na autenticação do servidor proxy.');
	}
}

async function callSankhyaAsSystem(serviceName, requestBody) {
	logger.http(`Executando consulta como usuário de sistema: ${serviceName}`);
	try {
		const loginResponse = await axios.post(
			`${SANKHYA_API_URL}/login`,
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
		const freshSystemToken = loginResponse.data.bearerToken;
		if (!freshSystemToken) {
			throw new Error('Falha ao obter token de sistema para a consulta.');
		}
		const url = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
		const serviceResponse = await axios.post(
			url,
			{ requestBody },
			{ headers: { Authorization: `Bearer ${freshSystemToken}` } }
		);
		return serviceResponse.data;
	} catch (error) {
		const errorMessage = error.response?.data?.statusMessage || `Falha ao executar ${serviceName} como sistema.`;
		logger.error(`Erro em callSankhyaAsSystem: ${errorMessage}`);
		throw new Error(errorMessage);
	}
}

async function callSankhyaService(serviceName, requestBody) {
	let token = await getSystemBearerToken();
	const url = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
	try {
		const response = await axios.post(
			url,
			{ requestBody },
			{ headers: { Authorization: `Bearer ${token}` } }
		);
		const responseData = response.data;
		const isTokenExpiredError = responseData.error?.descricao?.includes("Bearer Token inválido ou Expirado");
		const isNotLoggedInError = responseData.status === '0' && responseData.statusMessage?.includes("Usuário não logado");
		if (isTokenExpiredError || isNotLoggedInError) {
			logger.warn(`Token de sistema inválido (em resposta OK). Forçando renovação...`);
			token = await getSystemBearerToken(true);
			const retryResponse = await axios.post(url, { requestBody }, { headers: { Authorization: `Bearer ${token}` } });
			logger.info('Requisição reenviada com sucesso após renovação do token.');
			return retryResponse.data;
		}
		return responseData;
	} catch (error) {
		if (error.response && error.response.data) {
			const errorData = error.response.data;
			const isTokenExpiredError = errorData.error?.descricao?.includes("Bearer Token inválido ou Expirado");
			const isNotLoggedInError = errorData.status === '0' && errorData.statusMessage?.includes("Usuário não logado");
			if (isTokenExpiredError || isNotLoggedInError) {
				logger.warn(`Token de sistema inválido (em resposta de erro HTTP ${error.response.status}). Forçando renovação...`);
				token = await getSystemBearerToken(true);
				try {
					const retryResponse = await axios.post(url, { requestBody }, { headers: { Authorization: `Bearer ${token}` } });
					logger.info('Requisição reenviada com sucesso após renovação do token.');
					return retryResponse.data;
				} catch (retryError) {
					logger.error(`Falha ao reenviar a requisição após renovar o token: ${retryError.message}`);
					throw retryError;
				}
			}
		}
		throw error;
	}
}

// Exportamos as funções para que os controllers possam usá-las
module.exports = {
    initializeSankhyaService: getSystemBearerToken,
    callSankhyaService,
    callSankhyaAsSystem,
};