// src/backend/controllers/auth.controller.js
const crypto = require('crypto');
const jwt =require('jsonwebtoken');
const sankhya = require('../services/sankhya.service');
const logger = require('../../../logger');
const { sanitizeStringForSql } = require('../utils/sanitizer');

const loginAttempts = {};
const MAX_ATTEMPTS = 10;
const LOCKOUT_TIME = 15 * 60 * 1000;
const JWT_SECRET = process.env.JWT_SECRET;

const login = async (req, res, next) => {
    const { username, password, deviceToken: clientDeviceToken } = req.body;
    const deviceIdentifier = clientDeviceToken || req.ip;

    try {
        if (loginAttempts[deviceIdentifier] && loginAttempts[deviceIdentifier].lockedUntil > Date.now()) {
            const remainingTime = Math.ceil((loginAttempts[deviceIdentifier].lockedUntil - Date.now()) / 60000);
            return res.status(429).json({ message: `Muitas tentativas de login. Tente novamente em ${remainingTime} minutos.` });
        }

        logger.http(`Tentativa de login para o usuário: ${username}`);
        
        // Usando callAsSystem para as buscas no banco, como no original, garantindo um token novo.
        const userQueryResponse = await sankhya.callAsSystem('DbExplorerSP.executeQuery', {
            sql: `SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${sanitizeStringForSql(username.toUpperCase())}'`,
        });
        if (userQueryResponse.status !== '1' || !userQueryResponse.responseBody?.rows.length) {
            throw new Error('Usuário não encontrado.');
        }
        const codUsu = userQueryResponse.responseBody.rows[0][0];

        const permAppResponse = await sankhya.callAsSystem('DbExplorerSP.executeQuery', {
            sql: `SELECT NUMREG FROM AD_APPPERM WHERE CODUSU = ${codUsu}`
        });
        if (permAppResponse.status !== '1' || !permAppResponse.responseBody?.rows.length) {
            throw new Error('Usuário não possui permissão para acessar este aplicativo.');
        }
        const numReg = permAppResponse.responseBody.rows[0][0];
        
        let finalDeviceToken = clientDeviceToken;
        let deviceIsAuthorized = false;

        if (clientDeviceToken) {
            const deviceCheckResponse = await sankhya.callAsSystem('DbExplorerSP.executeQuery', {
                sql: `SELECT ATIVO FROM AD_DISPAUT WHERE CODUSU = ${codUsu} AND DEVICETOKEN = '${sanitizeStringForSql(clientDeviceToken)}'`,
            });
            if (deviceCheckResponse.responseBody?.rows.length > 0) {
                if (deviceCheckResponse.responseBody.rows[0][0] === 'S') {
                    deviceIsAuthorized = true;
                } else {
                    return res.status(403).json({ message: 'Este dispositivo está registrado, mas não está ativo. Contate um administrador.', deviceToken: clientDeviceToken });
                }
            }
        }
        
        if (!deviceIsAuthorized) {
            finalDeviceToken = crypto.randomBytes(20).toString('hex');
            const descrDisp = req.headers['user-agent']?.substring(0, 100) || 'Dispositivo Web';
            
            // Usando "call" (token cache) para salvar o dispositivo, como no original (callSankhyaService)
            const saveResponse = await sankhya.call('DatasetSP.save', {
                entityName: 'AD_DISPAUT',
                fields: ['CODUSU', 'DEVICETOKEN', 'DESCRDISP', 'ATIVO', 'DHGER'],
                records: [{ values: { 0: codUsu, 1: finalDeviceToken, 2: sanitizeStringForSql(descrDisp), 3: 'N', 4: new Date().toLocaleDateString('pt-BR') } }],
            });
            if (saveResponse.status !== '1') throw new Error(saveResponse.statusMessage || 'Falha ao tentar registrar o novo dispositivo.');

            return res.status(403).json({ message: 'Dispositivo novo detectado. Solicite a um administrador para ativá-lo.', deviceToken: finalDeviceToken });
        }
        
        // Usando "call" (token cache) para validar a senha do usuário, como no original
        const loginResponse = await sankhya.call('MobileLoginSP.login', {
            NOMUSU: { $: username.toUpperCase() },
            INTERNO: { $: password },
        });
        if (loginResponse.status !== '1') {
            throw new Error(loginResponse.statusMessage || 'Credenciais de operador inválidas.');
        }
        
        delete loginAttempts[deviceIdentifier];

        const sessionPayload = { username, codusu: codUsu, numreg: numReg };
        const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '8h' });

        res.cookie('sessionToken', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000,
        });

        logger.info(`Usuário ${username} logado com sucesso.`);
        res.json({ username, codusu: codUsu, numreg: numReg, deviceToken: finalDeviceToken });

    } catch (error) {
        if (!loginAttempts[deviceIdentifier]) {
            loginAttempts[deviceIdentifier] = { count: 0, lockedUntil: null };
        }
        loginAttempts[deviceIdentifier].count++;
        if (loginAttempts[deviceIdentifier].count >= MAX_ATTEMPTS) {
            loginAttempts[deviceIdentifier].lockedUntil = Date.now() + LOCKOUT_TIME;
        }
        logger.error(`Falha no login para ${username}: ${error.message}`);
        next(error);
    }
};

const logout = (req, res) => {
    const { username } = req.userSession;
    logger.info(`Usuário ${username} realizou logout.`);
    res.clearCookie('sessionToken');
    res.status(200).json({ message: 'Logout bem-sucedido.' });
};

module.exports = { login, logout };