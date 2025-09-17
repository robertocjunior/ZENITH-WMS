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

// src/backend/controllers/auth.controller.js
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { callSankhyaService, callSankhyaAsSystem } = require('../services/sankhya.service');
const logger = require('../../../logger');
const { sanitizeStringForSql } = require('../utils/sanitizer');

const JWT_SECRET = process.env.JWT_SECRET;

const login = async (req, res, next) => {
    const { username, password, deviceToken: clientDeviceToken } = req.body;
    try {
        logger.http(`Tentativa de login para o usuário: ${username}`);

        // --- 1. Validação de Usuário e Permissões ---
        const userQueryResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
            sql: `SELECT CODUSU, NOMEUSU FROM TSIUSU WHERE NOMEUSU = '${sanitizeStringForSql(username.toUpperCase())}'`,
        });
        if (userQueryResponse.status !== '1' || !userQueryResponse.responseBody?.rows.length) {
            throw new Error('Usuário não encontrado.');
        }
        const codUsu = userQueryResponse.responseBody.rows[0][0];
        const nomeUsu = userQueryResponse.responseBody.rows[0][1];
        logger.info(`CODUSU ${codUsu} encontrado para o usuário ${username}.`);

        const permAppResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
            sql: `SELECT NUMREG FROM AD_APPPERM WHERE CODUSU = ${codUsu}`
        });
        if (permAppResponse.status !== '1' || !permAppResponse.responseBody?.rows.length) {
            logger.warn(`Login bloqueado para ${username} (CODUSU: ${codUsu}). Usuário não encontrado na AD_APPPERM.`);
            throw new Error('Usuário não possui permissão para acessar este aplicativo.');
        }
        const numReg = permAppResponse.responseBody.rows[0][0];
        logger.info(`NUMREG ${numReg} encontrado para o CODUSU ${codUsu}.`);

        // --- 2. Lógica de Dispositivo ---
        const descrDisp = req.headers['user-agent']?.substring(0, 100) || 'Dispositivo Web';
        let deviceTokenToUse = clientDeviceToken;

        if (!clientDeviceToken) {
            deviceTokenToUse = crypto.randomBytes(20).toString('hex');
            logger.info('Requisição sem deviceToken. Criando um novo para registro.');
        }

        const deviceCheckSql = `SELECT ATIVO FROM AD_DISPAUT WHERE CODUSU = ${codUsu} AND DEVICETOKEN = '${sanitizeStringForSql(deviceTokenToUse)}'`;
        const deviceCheckResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: deviceCheckSql });

        if (!deviceCheckResponse.responseBody?.rows.length) {
            await callSankhyaService('DatasetSP.save', {
                entityName: 'AD_DISPAUT',
                fields: ['CODUSU', 'DEVICETOKEN', 'DESCRDISP', 'ATIVO', 'DHGER'],
                records: [{ values: { 0: codUsu, 1: deviceTokenToUse, 2: sanitizeStringForSql(descrDisp), 3: 'N', 4: new Date().toLocaleDateString('pt-BR') } }],
            });

            logger.info(`Dispositivo novo ${deviceTokenToUse} registrado para CODUSU ${codUsu}. Aguardando autorização.`);
            return res.status(403).json({ message: 'Dispositivo novo detectado. Solicite a um administrador para ativá-lo.', deviceToken: deviceTokenToUse });
        }

        const isDeviceActive = deviceCheckResponse.responseBody.rows[0][0] === 'S';
        if (!isDeviceActive) {
            return res.status(403).json({ message: 'Este dispositivo está registrado, mas não está ativo.', deviceToken: deviceTokenToUse });
        }

        logger.info(`Dispositivo ${deviceTokenToUse} autorizado para CODUSU ${codUsu}.`);

        // --- 3. Validação de Senha ---
        const loginResponse = await callSankhyaService('MobileLoginSP.login', {
            NOMUSU: { $: username.toUpperCase() },
            INTERNO: { $: password },
        });
        if (loginResponse.status !== '1') {
            throw new Error(loginResponse.statusMessage || 'Credenciais de operador inválidas.');
        }
        logger.info(`Senha validada com sucesso para o usuário ${username}.`);

        // --- 4. Geração do Token JWT e Resposta de Sucesso ---
        const sessionPayload = { username, codusu: codUsu, nomeusu: nomeUsu, numreg: numReg };
        const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '8h' });

        res.cookie('sessionToken', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000,
        });
        
        // --- MODIFICAÇÃO: Verificação do ambiente ---
        const isTestEnvironment = process.env.SANKHYA_API_URL === 'https://api.sandbox.sankhya.com.br';
        if (isTestEnvironment) {
            logger.warn('Atenção: A API está conectada ao ambiente de SANDBOX (TESTES).');
        }

        logger.info(`Usuário ${username} logado com sucesso.`);
        
        // --- MODIFICAÇÃO: Resposta final com a nova flag ---
        res.json({
            username: username,
            codusu: codUsu,
            numreg: numReg,
            deviceToken: deviceTokenToUse,
            sessionToken: sessionToken,
            isTestEnvironment: isTestEnvironment // <--- PARÂMETRO ADICIONADO
        });

    } catch (error) {
        logger.error(`Falha no login para ${username}: ${error.message}`);
        next(error);
    }
};

const logout = (req, res) => {
    const { username } = req.userSession || { username: 'desconhecido' };
    logger.info(`Usuário ${username} realizou logout.`);
    res.clearCookie('sessionToken');
    res.status(200).json({ message: 'Logout bem-sucedido.' });
};

module.exports = { login, logout };