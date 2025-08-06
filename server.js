// server.js (CORRIGIDO)
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors());
app.set('trust proxy', 1);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    message:
        'Muitas tentativas de login a partir deste IP, por favor, tente novamente após 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 200, 
    message: 'Muitas requisições para a API a partir deste IP.',
    standardHeaders: true,
    legacyHeaders: false,
});

const SANKHYA_API_URL = process.env.SANKHYA_API_URL;
const JWT_SECRET = process.env.JWT_SECRET;
let systemBearerToken = null;

function sanitizeStringForSql(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') return '';
    return str.replace(/'/g, "''");
}

function sanitizeNumber(num) {
    const parsed = parseInt(num, 10);
    if (isNaN(parsed)) {
        throw new Error('Parâmetro numérico inválido.');
    }
    return parsed;
}

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

// ========================= ALTERAÇÃO INICIA AQUI =========================
/**
 * [NOVA FUNÇÃO]
 * Executa uma consulta SELECT (DbExplorerSP.executeQuery) usando uma sessão de sistema isolada.
 * Garante que as leituras de dados sempre tenham a permissão máxima do usuário do .env.
 */
async function callSankhyaAsSystem(serviceName, requestBody) {
    logger.http(`Executando consulta como usuário de sistema: ${serviceName}`);
    try {
        // 1. Faz login como usuário de sistema para obter um token limpo e com permissão total.
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

        // 2. Executa o serviço com o token de sistema recém-obtido.
        const url = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
        const serviceResponse = await axios.post(
            url,
            { requestBody },
            { headers: { Authorization: `Bearer ${freshSystemToken}` } }
        );

        // 3. Faz logout para invalidar o token temporário (boa prática).
        await axios.post(`${SANKHYA_API_URL}/logout`, {}, {
            headers: { Authorization: `Bearer ${freshSystemToken}` }
        });

        return serviceResponse.data;
    } catch (error) {
        const errorMessage = error.response?.data?.statusMessage || `Falha ao executar ${serviceName} como sistema.`;
        logger.error(`Erro em callSankhyaAsSystem: ${errorMessage}`);
        throw new Error(errorMessage);
    }
}
// ========================= ALTERAÇÃO TERMINA AQUI =========================


/**
 * [FUNÇÃO ORIGINAL MANTIDA]
 * Usada para operações de sessão do usuário (login, baixa, transferência).
 * Utiliza um token que se associa à sessão do usuário logado.
 */
async function callSankhyaService(serviceName, requestBody) {
    let token = await getSystemBearerToken();
    const url = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;

    try {
        const response = await axios.post(
            url,
            { requestBody },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (response.data.status === '0' && response.data.statusMessage?.includes("Usuário não logado")) {
            logger.warn('Detectado erro "Usuário não logado". Forçando renovação de token e tentando novamente...');
            token = await getSystemBearerToken(true);
            const retryResponse = await axios.post(
                url,
                { requestBody },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return retryResponse.data;
        }
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            logger.warn('Token de sistema possivelmente expirado. Tentando renovar e reenviar a requisição...');
            token = await getSystemBearerToken(true);
            const response = await axios.post(
                url,
                { requestBody },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            logger.info('Requisição reenviada com sucesso após renovação do token.');
            return response.data;
        }
        throw error;
    }
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) {
        logger.warn(
            `Acesso não autorizado à rota ${req.originalUrl} - Token não fornecido.`
        );
        return res.sendStatus(401);
    }
    jwt.verify(token, JWT_SECRET, (err, userSession) => {
        if (err) {
            logger.warn(
                `Tentativa de acesso com token inválido/expirado para rota ${req.originalUrl}. Erro: ${err.message}`
            );
            return res.sendStatus(403);
        }
        req.userSession = userSession;
        next();
    });
};


app.post('/login', loginLimiter, async (req, res) => {
    const { username, password, deviceToken: clientDeviceToken } = req.body;
    logger.http(`Tentativa de login para o usuário: ${username}`);
    try {
        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const userQueryResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
            sql: `SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${sanitizeStringForSql(username.toUpperCase())}'`,
        });

        if (userQueryResponse.status !== '1' || !userQueryResponse.responseBody || userQueryResponse.responseBody.rows.length === 0) {
            throw new Error('Usuário não encontrado ou falha ao buscar dados.');
        }
        const codUsu = userQueryResponse.responseBody.rows[0][0];
        logger.info(`CODUSU ${codUsu} encontrado para o usuário ${username}.`);

        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const permAppResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
            sql: `SELECT NUMREG FROM AD_APPPERM WHERE CODUSU = ${codUsu}`
        });

        if (permAppResponse.status !== '1' || !permAppResponse.responseBody || permAppResponse.responseBody.rows.length === 0) {
            logger.warn(`Login bloqueado para ${username} (CODUSU: ${codUsu}). Usuário não encontrado na AD_APPPERM.`);
            throw new Error('Usuário não possui permissão para acessar este aplicativo.');
        }
        const numReg = permAppResponse.responseBody.rows[0][0];
        logger.info(`NUMREG ${numReg} encontrado para o CODUSU ${codUsu}.`);

        let finalDeviceToken = clientDeviceToken;
        let deviceIsAuthorized = false;

        if (clientDeviceToken) {
            // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
            const deviceCheckResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
                sql: `SELECT ATIVO FROM AD_DISPAUT WHERE CODUSU = ${codUsu} AND DEVICETOKEN = '${sanitizeStringForSql(clientDeviceToken)}'`,
            });

            if (deviceCheckResponse.responseBody?.rows.length > 0) {
                if (deviceCheckResponse.responseBody.rows[0][0] === 'S') {
                    deviceIsAuthorized = true;
                    logger.info(`Dispositivo ${clientDeviceToken} autorizado para CODUSU ${codUsu}.`);
                } else {
                    return res.status(403).json({
                        message: 'Este dispositivo está registrado, mas não está ativo. Contate um administrador.',
                        deviceToken: clientDeviceToken,
                    });
                }
            }
        }

        if (!deviceIsAuthorized) {
            finalDeviceToken = crypto.randomBytes(20).toString('hex');
            const descrDisp = req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 100) : 'Dispositivo Web';
            // A escrita continua usando a função original
            await callSankhyaService('DatasetSP.save', {
                entityName: 'AD_DISPAUT',
                fields: ['CODUSU', 'DEVICETOKEN', 'DESCRDISP', 'ATIVO', 'DHGER'],
                records: [{ values: { 0: codUsu, 1: finalDeviceToken, 2: sanitizeStringForSql(descrDisp), 3: 'N', 4: new Date().toLocaleDateString('pt-BR') } }],
            });
            return res.status(403).json({
                message: 'Dispositivo novo detectado e registrado. Solicite a um administrador para ativá-lo.',
                deviceToken: finalDeviceToken,
            });
        }
        
        // O login do usuário continua usando a função original para atrelar a sessão
        const loginResponse = await callSankhyaService('MobileLoginSP.login', {
            NOMUSU: { $: username.toUpperCase() },
            INTERNO: { $: password },
        });

        if (loginResponse.status !== '1') {
            throw new Error(loginResponse.statusMessage || 'Credenciais de operador inválidas.');
        }
        logger.info(`Senha validada com sucesso para o usuário ${username}.`);

        const sessionPayload = { username: username, codusu: codUsu, numreg: numReg };
        const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '8h' });

        logger.info(`Usuário ${username} logado com sucesso.`);
        res.json({
            sessionToken,
            username,
            codusu: codUsu,
            numreg: numReg,
            deviceToken: finalDeviceToken,
        });

    } catch (error) {
        let errorMessage = 'Erro durante o processo de login.';
        if (error.response && error.response.data) {
            errorMessage = error.response.data.statusMessage || JSON.stringify(error.response.data);
        } else if (error.message) {
            errorMessage = error.message;
        }
        logger.error(`Falha no login para ${username}: ${errorMessage}`);
        res.status(401).json({ message: errorMessage });
    }
});


const apiRoutes = express.Router();
apiRoutes.use(apiLimiter);
apiRoutes.use(authenticateToken);

apiRoutes.post('/logout', (req, res) => {
    const { username } = req.userSession;
    logger.info(`Usuário ${username} realizou logout.`);
    res.status(200).json({ message: 'Logout bem-sucedido.' });
});

apiRoutes.post('/get-warehouses', async (req, res) => {
    const { username, numreg } = req.userSession;
    logger.http(`Usuário ${username} (NUMREG: ${numreg}) solicitou a lista de armazéns.`);

    try {
        if (!numreg) {
            throw new Error("NUMREG do usuário não encontrado na sessão.");
        }
        
        const sql = `SELECT CODARM, CODARM || '-' || DESARM FROM AD_CADARM WHERE CODARM IN (SELECT CODARM FROM AD_PERMEND WHERE NUMREG = ${sanitizeNumber(numreg)}) ORDER BY CODARM`;
        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        
        if (data.status !== '1') {
            throw new Error(data.statusMessage || "Falha ao buscar armazéns.");
        }

        res.json(data.responseBody.rows);

    } catch (error) {
        logger.error(`Erro em /get-warehouses para ${username}: ${error.message}`);
        res.status(500).json({ message: 'Ocorreu um erro ao buscar os armazéns.' });
    }
});

apiRoutes.post('/get-permissions', async (req, res) => {
    const { username, codusu } = req.userSession;
    logger.http(`Verificando permissões para o usuário ${username} (CODUSU: ${codusu}).`);
    try {
        const sql = `SELECT BAIXA, TRANSF, PICK FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });

        if (data.status !== '1' || !data.responseBody) {
            throw new Error(data.statusMessage || 'Falha ao consultar permissões.');
        }

        if (data.responseBody.rows.length === 0) {
            logger.warn(`Nenhuma permissão encontrada para o usuário ${username}. Retornando acesso negado a todas as funções.`);
            return res.json({ baixa: false, transfer: false, pick: false });
        }

        const perms = data.responseBody.rows[0];
        const permissions = {
            baixa: perms[0] === 'S',
            transfer: perms[1] === 'S',
            pick: perms[2] === 'S'
        };
        
        logger.info(`Permissões para ${username}: Baixa=${permissions.baixa}, Transfer=${permissions.transfer}, Pick=${permissions.pick}`);
        res.json(permissions);

    } catch (error) {
        logger.error(`Erro em /get-permissions para o usuário ${username}: ${error.message}`);
        res.status(500).json({ message: 'Ocorreu um erro ao verificar suas permissões.' });
    }
});


apiRoutes.post('/search-items', async (req, res) => {
    try {
        const codArm = sanitizeNumber(req.body.codArm);
        const filtro = req.body.filtro;

        logger.http(
            `Usuário ${req.userSession.username} buscou por '${
                filtro || 'todos'
            }' no armazém ${codArm}.`
        );
        
        let sqlFinal = `SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA, (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = ENDE.CODPROD AND V.CODVOL = ENDE.CODVOL) AS DERIVACAO FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm}`;
        let orderByClause = '';
        if (filtro) {
            const filtroLimpo = filtro.trim();
            if (/^\d+$/.test(filtroLimpo)) {
                const filtroNum = sanitizeNumber(filtroLimpo);
                sqlFinal += ` AND (ENDE.SEQEND LIKE '${sanitizeStringForSql(
                    filtroLimpo
                )}%' OR ENDE.CODPROD = ${filtroNum} OR ENDE.CODPROD = (SELECT CODPROD FROM AD_CADEND WHERE SEQEND = ${filtroNum} AND CODARM = ${codArm} AND ROWNUM = 1))`;
                orderByClause = ` ORDER BY CASE WHEN ENDE.SEQEND = ${filtroNum} THEN 0 ELSE 1 END, ENDE.ENDPIC DESC, ENDE.DATVAL ASC`;
            } else {
                const removerAcentos = (texto) =>
                    texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const palavrasChave = removerAcentos(filtroLimpo)
                    .split(' ')
                    .filter((p) => p.length > 0);
                const condicoes = palavrasChave.map((palavra) => {
                    const palavraUpper = sanitizeStringForSql(palavra.toUpperCase());
                    const cleanDescrprod =
                        "TRANSLATE(UPPER(PRO.DESCRPROD), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')";
                    const cleanMarca =
                        "TRANSLATE(UPPER(PRO.MARCA), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')";
                    return `(${cleanDescrprod} LIKE '%${palavraUpper}%' OR ${cleanMarca} LIKE '%${palavraUpper}%')`;
                });
                if (condicoes.length > 0) sqlFinal += ` AND ${condicoes.join(' AND ')}`;
                orderByClause = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';
            }
        } else {
            orderByClause = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';
        }
        sqlFinal += orderByClause;

        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
            sql: sqlFinal,
        });
        if (data.status !== '1') throw new Error(data.statusMessage);
        res.json(data.responseBody.rows);
    } catch (error) {
        logger.error(
            `Erro em /search-items para o usuário ${req.userSession.username}: ${error.message}`
        );
        res.status(500).json({ message: 'Ocorreu um erro ao buscar os itens.' });
    }
});

apiRoutes.post('/get-item-details', async (req, res) => {
    try {
        const codArm = sanitizeNumber(req.body.codArm);
        const sequencia = sanitizeNumber(req.body.sequencia);
        logger.http(
            `Usuário ${req.userSession.username} solicitou detalhes da sequência ${sequencia} no armazém ${codArm}.`
        );
        const sql = `SELECT ENDE.CODARM, ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA, (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = ENDE.CODPROD AND V.CODVOL = ENDE.CODVOL) AS DERIVACAO FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm} AND ENDE.SEQEND = ${sequencia}`;
        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });

        if (data.status === '1' && data.responseBody?.rows.length > 0) {
            res.json(data.responseBody.rows[0]);
        } else {
            throw new Error('Produto não encontrado ou erro na consulta.');
        }
    } catch (error) {
        logger.error(
            `Erro em /get-item-details para o usuário ${req.userSession.username}: ${error.message}`
        );
        res.status(500)
            .json({ message: 'Ocorreu um erro ao buscar os detalhes do item.' });
    }
});

apiRoutes.post('/get-picking-locations', async (req, res) => {
    try {
        const codarm = sanitizeNumber(req.body.codarm);
        const codprod = sanitizeNumber(req.body.codprod);
        const sequencia = sanitizeNumber(req.body.sequencia);
        logger.http(
            `Usuário ${req.userSession.username} solicitou locais de picking para o produto ${codprod}.`
        );

        const sql = `SELECT ENDE.SEQEND, PRO.DESCRPROD FROM AD_CADEND ENDE JOIN TGFPRO PRO ON ENDE.CODPROD = PRO.CODPROD WHERE ENDE.CODARM = ${codarm} AND ENDE.CODPROD = ${codprod} AND ENDE.ENDPIC = 'S' AND ENDE.SEQEND <> ${sequencia} ORDER BY ENDE.SEQEND`;
        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        if (data.status !== '1') throw new Error(data.statusMessage);
        res.json(data.responseBody.rows);
    } catch (error) {
        logger.error(
            `Erro em /get-picking-locations para o usuário ${req.userSession.username}: ${error.message}`
        );
        res.status(500)
            .json({ message: 'Ocorreu um erro ao buscar locais de picking.' });
    }
});

apiRoutes.post('/get-history', async (req, res) => {
    const { username, codusu } = req.userSession;
    logger.http(`Usuário ${username} solicitou seu histórico de hoje.`);
    try {
        const hoje = new Date().toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const sql = `
            WITH RankedItems AS (
                SELECT 
                    BXA.SEQBAI, 
                    TO_CHAR(BXA.DATGER, 'HH24:MI:SS') AS HORA, 
                    BXA.DATGER, 
                    IBX.CODARM, 
                    IBX.SEQEND, 
                    IBX.ARMDES, 
                    IBX.ENDDES, 
                    IBX.CODPROD, 
                    IBX.SEQITE, 
                    PRO.DESCRPROD,
                    PRO.MARCA,
                    (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = IBX.CODPROD AND V.CODVOL = PRO.CODVOL) AS DERIVACAO,
                    ROW_NUMBER() OVER(PARTITION BY BXA.SEQBAI ORDER BY IBX.SEQITE DESC) as rn
                FROM AD_BXAEND BXA 
                JOIN AD_IBXEND IBX ON IBX.SEQBAI = BXA.SEQBAI 
                LEFT JOIN TGFPRO PRO ON IBX.CODPROD = PRO.CODPROD
                WHERE BXA.USUGER = ${codusu} AND TRUNC(BXA.DATGER) = TO_DATE('${hoje}', 'DD/MM/YYYY')
            )
            SELECT SEQBAI, HORA, CODARM, SEQEND, ARMDES, ENDDES, CODPROD, DESCRPROD, MARCA, DERIVACAO FROM RankedItems WHERE rn = 1 ORDER BY DATGER DESC`;
        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        if (data.status !== '1')
            throw new Error(data.statusMessage || 'Falha ao carregar o histórico.');
        res.json(data.responseBody.rows);
    } catch (error) {
        logger.error(
            `Erro em /get-history para o usuário ${username}: ${error.message}`
        );
        res.status(500)
            .json({ message: 'Ocorreu um erro ao buscar seu histórico.' });
    }
});

apiRoutes.post('/execute-transaction', async (req, res) => {
    const { type, payload } = req.body;
    const { username, codusu } = req.userSession;
    logger.http(`Usuário ${username} (CODUSU: ${codusu}) iniciou uma transação do tipo: ${type}.`);

    try {
        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const permCheckSql = `SELECT BAIXA, TRANSF, PICK FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
        const permData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: permCheckSql });
        if (!permData.responseBody || permData.responseBody.rows.length === 0) {
            throw new Error('Você não tem permissão para esta ação.');
        }
        const perms = permData.responseBody.rows[0];
        const hasPermission = 
            (type === 'baixa' && perms[0] === 'S') ||
            (type === 'transferencia' && perms[1] === 'S') ||
            (type === 'picking' && perms[2] === 'S');

        if (!hasPermission) {
            logger.warn(`Tentativa de execução de '${type}' bloqueada por falta de permissão para ${username}.`);
            return res.status(403).json({ message: 'Você não tem permissão para executar esta ação.' });
        }

        const hoje = new Date().toLocaleDateString('pt-BR');
        
        // A escrita continua usando a função original para manter a sessão do usuário
        const cabecalhoData = await callSankhyaService('DatasetSP.save', {
            entityName: 'AD_BXAEND',
            fields: ['SEQBAI', 'DATGER', 'USUGER'],
            records: [{ values: { 1: hoje, 2: codusu } }],
        });

        if (
            cabecalhoData.status !== '1' ||
            !cabecalhoData.responseBody.result?.[0]?.[0]
        ) {
            throw new Error(
                cabecalhoData.statusMessage || 'Falha ao criar cabeçalho da transação.'
            );
        }
        const seqBai = cabecalhoData.responseBody.result[0][0];
        logger.info(
            `Cabeçalho da transação ${seqBai} criado para o usuário ${username} (USUGER: ${codusu}).`
        );

        let recordsToSave = [];
        if (type === 'baixa') {
            const sanitizedPayload = {
                codarm: sanitizeNumber(payload.codarm),
                sequencia: sanitizeNumber(payload.sequencia),
                quantidade: sanitizeNumber(payload.quantidade),
            };
            recordsToSave.push({
                entityName: 'AD_IBXEND',
                fields: ['SEQITE', 'SEQBAI', 'CODARM', 'SEQEND', 'QTDPRO'],
                values: {
                    2: sanitizedPayload.codarm.toString(),
                    3: sanitizedPayload.sequencia.toString(),
                    4: sanitizedPayload.quantidade.toString(),
                },
            });
        } else if (type === 'transferencia' || type === 'picking') {
            const { codarm, sequencia, codprod } = payload.origem;
            const { armazemDestino, enderecoDestino, quantidade } = payload.destino;

            const sanCodArm = sanitizeNumber(codarm);
            const sanSequencia = sanitizeNumber(sequencia);
            const sanCodProd = sanitizeNumber(codprod);
            const sanArmazemDestino = sanitizeNumber(armazemDestino);
            const sanEnderecoDestino = sanitizeStringForSql(enderecoDestino);
            const sanQuantidade = sanitizeNumber(quantidade);

            // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
            const checkSql = `SELECT CODPROD, QTDPRO FROM AD_CADEND WHERE SEQEND = '${sanEnderecoDestino}' AND CODARM = ${sanArmazemDestino}`;
            const checkData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
                sql: checkSql,
            });
            if (checkData.status !== '1')
                throw new Error('Falha ao verificar o endereço de destino.');
            const destinationItem =
                checkData.responseBody.rows.length > 0
                    ? checkData.responseBody.rows[0]
                    : null;

            if (destinationItem && destinationItem[0] === sanCodProd) {
                recordsToSave.push({
                    entityName: 'AD_IBXEND',
                    fields: ['SEQITE', 'SEQBAI', 'CODARM', 'SEQEND', 'QTDPRO'],
                    values: {
                        2: sanArmazemDestino.toString(),
                        3: sanEnderecoDestino,
                        4: destinationItem[1].toString(),
                    },
                });
            }
            recordsToSave.push({
                entityName: 'AD_IBXEND',
                fields: [
                    'SEQITE',
                    'SEQBAI',
                    'CODARM',
                    'SEQEND',
                    'ARMDES',
                    'ENDDES',
                    'QTDPRO',
                ],
                values: {
                    2: sanCodArm.toString(),
                    3: sanSequencia.toString(),
                    4: sanArmazemDestino.toString(),
                    5: sanEnderecoDestino,
                    6: sanQuantidade.toString(),
                },
            });
        }

        for (const record of recordsToSave) {
            record.values['1'] = seqBai;
            const { entityName, fields, values } = record;

            // A escrita continua usando a função original para manter a sessão do usuário
            const itemData = await callSankhyaService('DatasetSP.save', {
                entityName,
                fields,
                standAlone: false,
                records: [{ values: values }],
            });

            if (itemData.status !== '1')
                throw new Error(
                    itemData.statusMessage || 'Falha ao inserir item da transação.'
                );
        }

        logger.info(
            `${recordsToSave.length} item(ns) salvos para a transação ${seqBai}.`
        );

        // [ALTERAÇÃO] Usa a nova função para as consultas SELECT
        const pollSql = `SELECT COUNT(*) FROM AD_IBXEND WHERE SEQBAI = ${seqBai} AND CODPROD IS NOT NULL`;
        let isPopulated = false;
        for (let i = 0; i < 10; i++) {
            const pollData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
                sql: pollSql,
            });
            if (
                pollData.status === '1' &&
                pollData.responseBody &&
                parseInt(pollData.responseBody.rows[0][0], 10) >= recordsToSave.length
            ) {
                isPopulated = true;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!isPopulated)
            throw new Error('Timeout: O sistema não populou o CODPROD a tempo.');
        logger.info(
            `Polling de CODPROD bem-sucedido para a transação ${seqBai}.`
        );

        // A execução da procedure continua usando a função original para manter a sessão do usuário
        const stpData = await callSankhyaService('ActionButtonsSP.executeSTP', {
            stpCall: {
                actionID: '20',
                procName: 'NIC_STP_BAIXA_END',
                rootEntity: 'AD_BXAEND',
                rows: {
                    row: [{ field: [{ fieldName: 'SEQBAI', $: seqBai }] }],
                },
            },
        });
        if (stpData.status !== '1' && stpData.status !== '2')
            throw new Error(
                stpData.statusMessage || 'Falha ao executar a procedure de baixa.'
            );

        logger.info(
            `Transação ${type} (SEQBAI: ${seqBai}) finalizada com sucesso para o usuário ${username}.`
        );
        res.json({
            message: stpData.statusMessage || 'Operação concluída com sucesso!',
        });
    } catch (error) {
        logger.error(
            `Erro em /execute-transaction para o usuário ${username}: ${error.message}`
        );
        res.status(500)
            .json({ message: error.message || 'Ocorreu um erro ao executar a transação.' });
    }
});


// ======================================================
// REGISTRO DE ROTAS E SERVIDOR DE ARQUIVOS
// ======================================================
app.use('/api', apiRoutes);

if (process.env.NODE_ENV === 'production') {
    logger.info('Servidor em modo de PRODUÇÃO.');
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
} else {
    logger.info('Servidor em modo de DESENVOLVIMENTO.');
    app.use(express.static(path.join(__dirname, '')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
}

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const startServer = async () => {
    try {
        await getSystemBearerToken();
        app.listen(PORT, HOST, () =>
            logger.info(`✅ Servidor rodando em http://localhost:${PORT}`)
        );
    } catch (error) {
        logger.error(`Falha crítica ao iniciar o servidor: ${error.message}`);
        process.exit(1);
    }
};

startServer();
