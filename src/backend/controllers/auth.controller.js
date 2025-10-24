/**
 * Copyright (c) 2025 Roberto Casali Junior. Todos os Direitos Reservados.
 * (Avisos de propriedade omitidos para brevidade)
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { callSankhyaService, callSankhyaAsSystem } = require('../services/sankhya.service');
const logger = require('../../../logger');
const { sanitizeStringForSql } = require('../utils/sanitizer');

const JWT_SECRET = process.env.JWT_SECRET;

const formatDateForSankhya = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

const login = async (req, res, next) => {
    const { username, password, deviceToken: clientDeviceToken } = req.body;
    const sanitizedUsername = sanitizeStringForSql(username.toUpperCase()); // Sanitiza uma vez

    try {
        logger.http(`Tentativa de login para o usuário: ${username}`);

        // --- 1. Lógica de Dispositivo (Verifica/Gera Token) ---
        const descrDisp = req.headers['user-agent']?.substring(0, 100) || 'Dispositivo Web';
        let deviceTokenToUse = clientDeviceToken;
        let isNewDevice = false;

        if (!clientDeviceToken) {
            deviceTokenToUse = crypto.randomBytes(20).toString('hex');
            isNewDevice = true;
            logger.info('Requisição sem deviceToken. Gerando um novo: ' + deviceTokenToUse);
        }
        const sanitizedDeviceToken = sanitizeStringForSql(deviceTokenToUse);

        // --- 2. Consulta Combinada (Usuário, Permissão, Dispositivo) ---
        const combinedQuerySql = `
            SELECT
                USU.CODUSU,
                USU.NOMEUSU,
                PERM.NUMREG,
                DISP.ATIVO
            FROM
                TSIUSU USU
            LEFT JOIN
                AD_APPPERM PERM ON USU.CODUSU = PERM.CODUSU
            LEFT JOIN
                AD_DISPAUT DISP ON USU.CODUSU = DISP.CODUSU AND DISP.DEVICETOKEN = '${sanitizedDeviceToken}'
            WHERE
                USU.NOMEUSU = '${sanitizedUsername}'
        `;

        logger.debug(`Executando consulta combinada para ${username} com device ${deviceTokenToUse}`);
        const combinedResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: combinedQuerySql });

        // Verifica se o usuário existe
        if (combinedResponse.status !== '1' || !combinedResponse.responseBody?.rows?.length) {
            logger.warn(`Usuário ${username} não encontrado na TSIUSU.`);
            return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
        }

        const userData = combinedResponse.responseBody.rows[0];
        const codUsu = userData[0];
        const nomeUsu = userData[1];
        const numReg = userData[2];
        const deviceActiveStatus = userData[3];

        logger.info(`Consulta combinada retornou: CODUSU=${codUsu}, NOMEUSU=${nomeUsu}, NUMREG=${numReg}, DEVICE_ATIVO=${deviceActiveStatus}`);

        // Verifica Permissão de Acesso ao App (NUMREG)
        if (!numReg) {
            logger.warn(`Login bloqueado para ${username} (CODUSU: ${codUsu}). Usuário não encontrado na AD_APPPERM (NUMREG está nulo).`);
            return res.status(403).json({ message: 'Usuário não possui permissão para acessar este aplicativo.' });
        }
        logger.info(`Permissão de acesso confirmada (NUMREG ${numReg}) para o CODUSU ${codUsu}.`);

        // --- 3. Tratamento do Status do Dispositivo ---
        if (deviceActiveStatus === null) {
            logger.info(`Dispositivo ${deviceTokenToUse} não encontrado para CODUSU ${codUsu}. Registrando...`);
            const savePayload = {
                entityName: 'AD_DISPAUT',
                fields: ['CODUSU', 'DEVICETOKEN', 'DESCRDISP', 'ATIVO', 'DHGER'],
                records: [{
                    values: {
                        0: codUsu,
                        1: deviceTokenToUse,
                        2: sanitizeStringForSql(descrDisp),
                        3: 'N',
                        4: formatDateForSankhya(new Date())
                    }
                }],
            };
            const saveResponse = await callSankhyaAsSystem('DatasetSP.save', savePayload);
            if (saveResponse.status !== '1') {
                logger.error(`Falha ao registrar novo dispositivo ${deviceTokenToUse} para CODUSU ${codUsu}. Resposta: ${JSON.stringify(saveResponse)}`);
                const error = new Error(`Falha ao salvar dispositivo. Status: ${saveResponse.status} | Mensagem: ${saveResponse.statusMessage || 'Erro desconhecido'}`);
                error.sankhyaResponse = saveResponse;
                throw error;
            }
            logger.info(`Novo dispositivo ${deviceTokenToUse} registrado (inativo) para CODUSU ${codUsu}.`);
            return res.status(403).json({ message: 'Dispositivo novo detectado. Solicite a um administrador para ativá-lo.', deviceToken: deviceTokenToUse });
        } else if (deviceActiveStatus === 'N') {
            logger.warn(`Dispositivo ${deviceTokenToUse} encontrado para CODUSU ${codUsu}, mas está inativo.`);
            return res.status(403).json({ message: 'Este dispositivo está registrado, mas não está ativo.', deviceToken: deviceTokenToUse });
        } else {
            logger.info(`Dispositivo ${deviceTokenToUse} autorizado para CODUSU ${codUsu}.`);
        }

        // --- 4. Validação de Senha ---
        logger.debug(`Validando senha para ${username} via MobileLoginSP.login`);
        const loginResponse = await callSankhyaService('MobileLoginSP.login', {
            NOMUSU: { $: username.toUpperCase() },
            INTERNO: { $: password },
        });

        if (loginResponse.status !== '1') {
            const errorMessage = loginResponse.statusMessage || 'Credenciais inválidas.';
            logger.warn(`Falha na validação de senha para ${username}: ${errorMessage}`);
            return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
        }
        logger.info(`Senha validada com sucesso para o usuário ${username}.`);

        // --- INÍCIO DA MODIFICAÇÃO ---
        // Extrai o jsessionid da resposta do login
        const jsessionid = loginResponse.responseBody?.jsessionid?.$ || null;
        if (!jsessionid) {
            logger.error(`jsessionid não encontrado na resposta de MobileLoginSP.login para ${username}.`);
            throw new Error("Falha ao obter o jsessionid necessário da API Sankhya.");
        }
        logger.info(`jsessionid obtido para ${username}: ${jsessionid.substring(0, 10)}...`); // Log truncado por segurança

        // --- 5. Geração do Token JWT ---
        // Inclui o jsessionid no payload do token JWT
        const sessionPayload = { username: username, codusu: codUsu, nomeusu: nomeUsu, numreg: numReg, jsessionid: jsessionid };
        const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '8h' });
        // --- FIM DA MODIFICAÇÃO ---

        res.cookie('sessionToken', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000,
        });

        const isTestEnvironment = (process.env.SANKHYA_API_URL || '').includes('sandbox');
        if (isTestEnvironment) {
            logger.warn('Atenção: A API está conectada ao ambiente de SANDBOX (TESTES).');
        }

        logger.info(`Usuário ${username} logado com sucesso com device ${deviceTokenToUse}.`);

        res.json({
            username: username,
            codusu: codUsu,
            nomeusu: nomeUsu,
            numreg: numReg,
            deviceToken: deviceTokenToUse,
            sessionToken: sessionToken,
            isTestEnvironment: isTestEnvironment
        });

    } catch (error) {
        logger.error(`Falha inesperada no processo de login para ${username}: ${error.message}`, { stack: error.stack });
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