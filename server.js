// server.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const helmet = require('helmet');
const cookieParser = require('cookie-parser'); // [NOVO] Importa o cookie-parser
const logger = require('./logger');

const app = express();

// [ALTERAÇÃO] Configuração de segurança aprimorada com Helmet e CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'"], // Permite scripts apenas da mesma origem
        "style-src": ["'self'", "fonts.googleapis.com", "'unsafe-inline'"], // Permite estilos do site, Google Fonts e inline
        "font-src": ["'self'", "fonts.gstatic.com"], // Permite fontes do site e do Google Fonts
        "connect-src": ["'self'"], // Permite conexões (API calls) apenas para a mesma origem
        "img-src": ["'self'", "data:"], // Permite imagens do site e data URIs
        "object-src": ["'none'"], // Desabilita plugins como Flash
        "upgrade-insecure-requests": [],
      },
    },
  })
);

app.use(express.json());
app.use(cors());
app.use(cookieParser()); // [NOVO] Adiciona o middleware para cookies
app.set('trust proxy', 1);

const apiLimiter = require('express-rate-limit')({
    windowMs: 15 * 60 * 1000,
    max: 200, 
    message: 'Muitas requisições para a API a partir deste IP.',
    standardHeaders: true,
    legacyHeaders: false,
});

const loginAttempts = {};
const MAX_ATTEMPTS = 10;
const LOCKOUT_TIME = 15 * 60 * 1000;

const SANKHYA_API_URL = process.env.SANKHYA_API_URL;
const JWT_SECRET = process.env.JWT_SECRET;
let systemBearerToken = null;

// Funções utilitárias (sanitizeStringForSql, sanitizeNumber, formatDbDateToApi) permanecem inalteradas...
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

function formatDbDateToApi(dbDate) {
    if (!dbDate || typeof dbDate !== 'string') return null;
    const datePart = dbDate.split(' ')[0];
    if (datePart.length !== 8) return datePart;
    const day = datePart.substring(0, 2);
    const month = datePart.substring(2, 4);
    const year = datePart.substring(4, 8);
    return `${day}/${month}/${year}`;
}

// Funções de chamada ao Sankhya (getSystemBearerToken, callSankhyaAsSystem, callSankhyaService) permanecem inalteradas...
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

// [ALTERAÇÃO] Middleware agora lê o token do cookie
const authenticateToken = (req, res, next) => {
    const token = req.cookies.sessionToken; // Lê o token do cookie
    if (token == null) {
        return res.sendStatus(401);
    }
    jwt.verify(token, JWT_SECRET, (err, userSession) => {
        if (err) {
            return res.sendStatus(403);
        }
        req.userSession = userSession;
        next();
    });
};


// [ALTERAÇÃO] Rota de login agora envia o token como um cookie HttpOnly
app.post('/login', async (req, res) => {
    const { username, password, deviceToken: clientDeviceToken } = req.body;
    
    const deviceIdentifier = clientDeviceToken || req.ip;

    if (loginAttempts[deviceIdentifier] && loginAttempts[deviceIdentifier].lockedUntil > Date.now()) {
        const remainingTime = Math.ceil((loginAttempts[deviceIdentifier].lockedUntil - Date.now()) / 60000);
        logger.warn(`Tentativa de login bloqueada para o dispositivo ${deviceIdentifier}. Tempo restante: ${remainingTime} min.`);
        return res.status(429).json({ message: `Muitas tentativas de login. Tente novamente em ${remainingTime} minutos.` });
    }

    logger.http(`Tentativa de login para o usuário: ${username}`);
    try {
        // Lógica de verificação de usuário e dispositivo (inalterada)...
        const userQueryResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
            sql: `SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${sanitizeStringForSql(username.toUpperCase())}'`,
        });

        if (userQueryResponse.status !== '1' || !userQueryResponse.responseBody || userQueryResponse.responseBody.rows.length === 0) {
            throw new Error('Usuário não encontrado ou falha ao buscar dados.');
        }
        const codUsu = userQueryResponse.responseBody.rows[0][0];
        logger.info(`CODUSU ${codUsu} encontrado para o usuário ${username}.`);

        const permAppResponse = await callSankhyaAsSystem('DbExplorerSP.executeQuery', {
            sql: `SELECT NUMREG FROM AD_APPPERM WHERE CODUSU = ${codUsu}`
        });

        if (permAppResponse.status !== '1' || !permAppResponse.responseBody || permAppResponse.responseBody.rows.length === 0) {
            throw new Error('Usuário não possui permissão para acessar este aplicativo.');
        }
        const numReg = permAppResponse.responseBody.rows[0][0];
        logger.info(`NUMREG ${numReg} encontrado para o CODUSU ${codUsu}.`);

        let finalDeviceToken = clientDeviceToken;
        let deviceIsAuthorized = false;

        if (clientDeviceToken) {
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

        if (!deviceIsAuthorized && clientDeviceToken) {
             return res.status(403).json({
                message: 'Dispositivo novo detectado e registrado. Solicite a um administrador para ativá-lo.',
                deviceToken: clientDeviceToken,
            });
        }
        
        if (!clientDeviceToken) {
            finalDeviceToken = crypto.randomBytes(20).toString('hex');
            const descrDisp = req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 100) : 'Dispositivo Web';
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
        
        const loginResponse = await callSankhyaService('MobileLoginSP.login', {
            NOMUSU: { $: username.toUpperCase() },
            INTERNO: { $: password },
        });

        if (loginResponse.status !== '1') {
            throw new Error(loginResponse.statusMessage || 'Credenciais de operador inválidas.');
        }
        
        delete loginAttempts[deviceIdentifier];
        logger.info(`Senha validada com sucesso para o usuário ${username}.`);

        const sessionPayload = { username: username, codusu: codUsu, numreg: numReg };
        const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '8h' });

        // [ALTERAÇÃO] Envia o token como um cookie seguro
        res.cookie('sessionToken', sessionToken, {
            httpOnly: true, // Impede acesso via JavaScript no cliente
            secure: process.env.NODE_ENV === 'production', // Envia apenas em HTTPS na produção
            sameSite: 'strict', // Proteção contra ataques CSRF
            maxAge: 8 * 60 * 60 * 1000 // 8 horas
        });

        logger.info(`Usuário ${username} logado com sucesso.`);
        
        // Envia a resposta sem o token no corpo
        res.json({
            username,
            codusu: codUsu,
            numreg: numReg,
            deviceToken: finalDeviceToken,
        });

    } catch (error) {
        // Lógica de contagem de tentativas (inalterada)...
        if (!loginAttempts[deviceIdentifier]) {
            loginAttempts[deviceIdentifier] = { count: 0, lockedUntil: null };
        }
        loginAttempts[deviceIdentifier].count++;

        if (loginAttempts[deviceIdentifier].count >= MAX_ATTEMPTS) {
            loginAttempts[deviceIdentifier].lockedUntil = Date.now() + LOCKOUT_TIME;
            logger.error(`Dispositivo ${deviceIdentifier} bloqueado por excesso de tentativas de login.`);
        }
        
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

// [ALTERAÇÃO] Rota de logout agora limpa o cookie
apiRoutes.post('/logout', (req, res) => {
    const { username } = req.userSession;
    logger.info(`Usuário ${username} realizou logout.`);
    res.clearCookie('sessionToken'); // Limpa o cookie de sessão
    res.status(200).json({ message: 'Logout bem-sucedido.' });
});

// O restante das rotas da API (get-warehouses, get-permissions, etc.) permanece inalterado...
// ... (código das outras rotas) ...
apiRoutes.post('/get-warehouses', async (req, res) => {
    const { username, numreg } = req.userSession;
    logger.http(`Usuário ${username} (NUMREG: ${numreg}) solicitou a lista de armazéns.`);

    try {
        if (!numreg) {
            throw new Error("NUMREG do usuário não encontrado na sessão.");
        }
        
        const sql = `SELECT CODARM, CODARM || '-' || DESARM FROM AD_CADARM WHERE CODARM IN (SELECT CODARM FROM AD_PERMEND WHERE NUMREG = ${sanitizeNumber(numreg)}) ORDER BY CODARM`;
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
        const sql = `SELECT BAIXA, TRANSF, PICK, CORRE FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });

        if (data.status !== '1' || !data.responseBody) {
            throw new Error(data.statusMessage || 'Falha ao consultar permissões.');
        }

        if (data.responseBody.rows.length === 0) {
            logger.warn(`Nenhuma permissão encontrada para o usuário ${username}. Retornando acesso negado a todas as funções.`);
            return res.json({ baixa: false, transfer: false, pick: false, corre: false });
        }

        const perms = data.responseBody.rows[0];
        const permissions = {
            baixa: perms[0] === 'S',
            transfer: perms[1] === 'S',
            pick: perms[2] === 'S',
            corre: perms[3] === 'S'
        };
        
        logger.info(`Permissões para ${username}: Baixa=${permissions.baixa}, Transfer=${permissions.transfer}, Pick=${permissions.pick}, Corre=${permissions.corre}`);
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
            SELECT 
                'MOV' AS TIPO,
                BXA.DATGER AS DATA_ORDEM,
                TO_CHAR(BXA.DATGER, 'HH24:MI:SS') AS HORA, 
                IBX.CODARM, 
                IBX.SEQEND, 
                IBX.ARMDES, 
                IBX.ENDDES, 
                IBX.CODPROD, 
                PRO.DESCRPROD,
                PRO.MARCA,
                (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = IBX.CODPROD AND V.CODVOL = PRO.CODVOL) AS DERIVACAO,
                NULL AS QUANT_ANT,
                NULL AS QTD_ATUAL,
                BXA.SEQBAI AS ID_OPERACAO
            FROM AD_BXAEND BXA 
            JOIN AD_IBXEND IBX ON IBX.SEQBAI = BXA.SEQBAI 
            LEFT JOIN TGFPRO PRO ON IBX.CODPROD = PRO.CODPROD
            WHERE BXA.USUGER = ${codusu} AND TRUNC(BXA.DATGER) = TO_DATE('${hoje}', 'DD/MM/YYYY')

            UNION ALL

            SELECT 
                'CORRECAO' AS TIPO,
                H.DTHOPER AS DATA_ORDEM,
                TO_CHAR(H.DTHOPER, 'HH24:MI:SS') AS HORA,
                H.CODARM,
                H.SEQEND,
                NULL AS ARMDES,
                NULL AS ENDDES,
                H.CODPROD,
                (SELECT P.DESCRPROD FROM TGFPRO P WHERE P.CODPROD = H.CODPROD) AS DESCRPROD,
                H.MARCA,
                H.DERIV,
                H.QUANT AS QUANT_ANT,
                H.QATUAL AS QTD_ATUAL,
                H.NUMUNICO AS ID_OPERACAO
            FROM AD_HISTENDAPP H
            WHERE H.CODUSU = ${codusu} AND TRUNC(H.DTHOPER) = TO_DATE('${hoje}', 'DD/MM/YYYY')
            
            ORDER BY DATA_ORDEM DESC
        `;

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
        const permCheckSql = `SELECT BAIXA, TRANSF, PICK, CORRE FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
        const permData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: permCheckSql });
        if (!permData.responseBody || permData.responseBody.rows.length === 0) {
            throw new Error('Você não tem permissão para esta ação.');
        }
        const perms = permData.responseBody.rows[0];
        const hasPermission = 
            (type === 'baixa' && perms[0] === 'S') ||
            (type === 'transferencia' && perms[1] === 'S') ||
            (type === 'picking' && perms[2] === 'S') ||
            (type === 'correcao' && perms[3] === 'S');

        if (!hasPermission) {
            logger.warn(`Tentativa de execução de '${type}' bloqueada por falta de permissão para ${username}.`);
            return res.status(403).json({ message: 'Você não tem permissão para executar esta ação.' });
        }

        if (type === 'correcao') {
            const { codarm, sequencia, newQuantity } = payload;
            
            const itemSql = `
                SELECT 
                    DEND.CODPROD, DEND.CODVOL, DEND.DATENT, DEND.DATVAL, DEND.QTDPRO,
                    PRO.MARCA, 
                    (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = DEND.CODPROD AND V.CODVOL = DEND.CODVOL) AS DERIVACAO 
                FROM AD_CADEND DEND 
                JOIN TGFPRO PRO ON DEND.CODPROD = PRO.CODPROD 
                WHERE DEND.CODARM = ${sanitizeNumber(codarm)} AND DEND.SEQEND = ${sanitizeNumber(sequencia)}
            `;
            const itemData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: itemSql });

            if (!itemData.responseBody || itemData.responseBody.rows.length === 0) {
                throw new Error('Item não encontrado para correção.');
            }

            const [codprod, codvol, datent, datval, qtdAnterior, marca, derivacao] = itemData.responseBody.rows[0];
            
            const scriptRequestBody = {
                runScript: {
                    actionID: "97",
                    refreshType: "SEL",
                    params: {
                        param: [
                            { type: "S", paramName: "CODPROD", $: codprod },
                            { type: "S", paramName: "CODVOL", $: codvol || '' },
                            { type: "F", paramName: "QTDPRO", $: newQuantity },
                            { type: "D", paramName: "DATENT", $: formatDbDateToApi(datent) },
                            { type: "D", paramName: "DATVAL", $: formatDbDateToApi(datval) }
                        ]
                    },
                    rows: {
                        row: [{
                            field: [
                                { fieldName: "CODARM", $: codarm.toString() },
                                { fieldName: "SEQEND", $: sequencia.toString() }
                            ]
                        }]
                    }
                },
                clientEventList: {
                    clientEvent: [{ "$": "br.com.sankhya.actionbutton.clientconfirm" }]
                }
            };
            
            const result = await callSankhyaService('ActionButtonsSP.executeScript', scriptRequestBody);
            
            const histRecord = {
                entityName: 'AD_HISTENDAPP',
                fields: ['CODARM', 'SEQEND', 'CODPROD', 'CODVOL', 'MARCA', 'DERIV', 'QUANT', 'QATUAL', 'CODUSU', 'DTHOPER'],
                records: [{
                    values: {
                        0: codarm,
                        1: sequencia,
                        2: codprod,
                        3: codvol,
                        4: marca,
                        5: derivacao,
                        6: qtdAnterior,
                        7: newQuantity,
                        8: codusu,
                        9: new Date()
                    }
                }]
            };
            await callSankhyaService('DatasetSP.save', histRecord);
            logger.info(`Histórico de correção salvo para SEQEND ${sequencia}.`);

            logger.info(`Correção (actionID 97) executada com sucesso para SEQEND ${sequencia} pelo usuário ${username}.`);
            return res.json({ message: result.statusMessage || 'Correção executada com sucesso!' });
        }

        const hoje = new Date().toLocaleDateString('pt-BR');
        
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