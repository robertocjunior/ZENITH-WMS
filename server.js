// server.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const SANKHYA_API_URL = process.env.SANKHYA_API_URL;
const JWT_SECRET = process.env.JWT_SECRET;
let systemBearerToken = null;

// ======================================================
// FUNÇÕES AUXILIARES DO BACKEND
// ======================================================
async function getSystemBearerToken(forceRefresh = false) {
    if (systemBearerToken && !forceRefresh) return systemBearerToken;
    try {
        console.log("Autenticando o sistema para obter Bearer Token...");
        const response = await axios.post(`${SANKHYA_API_URL}/login`, {}, {
            headers: { 'appkey': process.env.SANKHYA_APPKEY, 'username': process.env.SANKHYA_USERNAME, 'password': process.env.SANKHYA_PASSWORD, 'token': process.env.SANKHYA_TOKEN }
        });
        systemBearerToken = response.data.bearerToken;
        if (!systemBearerToken) throw new Error("Falha ao obter Bearer Token do sistema.");
        console.log("Token de sistema obtido com sucesso.");
        return systemBearerToken;
    } catch (error) {
        console.error("ERRO CRÍTICO: Não foi possível obter o Bearer Token do sistema.", error.message);
        systemBearerToken = null;
        throw new Error("Falha na autenticação do servidor proxy.");
    }
}

async function callSankhyaService(serviceName, requestBody) {
    let token = await getSystemBearerToken();
    const url = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
    
    try {
        const response = await axios.post(url, { requestBody }, { headers: { 'Authorization': `Bearer ${token}` } });
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log("Token de sistema possivelmente expirado. Tentando renovar...");
            token = await getSystemBearerToken(true);
            const response = await axios.post(url, { requestBody }, { headers: { 'Authorization': `Bearer ${token}` } });
            return response.data;
        }
        throw error;
    }
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, userSession) => {
        if (err) return res.sendStatus(403);
        req.userSession = userSession;
        next();
    });
};

// ======================================================
// ROTAS DE AUTENTICAÇÃO E SESSÃO
// ======================================================
app.post('/login', async (req, res) => {
    const { username, password, deviceToken: clientDeviceToken } = req.body;
    try {
        const loginResponse = await callSankhyaService("MobileLoginSP.login", { NOMUSU: { "$": username.toUpperCase() }, INTERNO: { "$": password } });
        if (loginResponse.status !== "1") throw new Error(loginResponse.statusMessage || 'Credenciais de operador inválidas.');

        const userQueryResponse = await callSankhyaService("DbExplorerSP.executeQuery", { sql: `SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${username.toUpperCase()}'` });
        if (userQueryResponse.status !== '1' || userQueryResponse.responseBody.rows.length === 0) throw new Error("Não foi possível encontrar o código de usuário (CODUSU).");
        const codUsu = userQueryResponse.responseBody.rows[0][0];

        let finalDeviceToken = clientDeviceToken;
        let deviceIsAuthorized = false;

        if (clientDeviceToken) {
            const deviceCheckResponse = await callSankhyaService("DbExplorerSP.executeQuery", { sql: `SELECT ATIVO FROM AD_DISPAUT WHERE CODUSU = ${codUsu} AND DEVICETOKEN = '${clientDeviceToken}'` });
            if (deviceCheckResponse.responseBody.rows.length > 0) {
                if (deviceCheckResponse.responseBody.rows[0][0] === 'S') {
                    deviceIsAuthorized = true;
                } else {
                    return res.status(403).json({ message: 'Este dispositivo está registrado, mas não está ativo. Contate um administrador.', deviceToken: clientDeviceToken });
                }
            }
        }
        
        if (!deviceIsAuthorized) {
            finalDeviceToken = crypto.randomBytes(20).toString('hex');
            const descrDisp = req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 100) : 'Dispositivo Web';
            await callSankhyaService("DatasetSP.save", {
                entityName: "AD_DISPAUT", fields: ["CODUSU", "DEVICETOKEN", "DESCRDISP", "ATIVO", "DHGER"],
                records: [{ values: { "0": codUsu, "1": finalDeviceToken, "2": descrDisp, "3": "N", "4": new Date().toLocaleDateString('pt-BR') } }]
            });
            return res.status(403).json({ message: 'Dispositivo novo detectado e registrado. Solicite a um administrador para ativá-lo.', deviceToken: finalDeviceToken });
        }

        const sessionPayload = { username: username, codusu: codUsu };
        const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '8h' });
        res.json({ sessionToken, username, codusu: codUsu, deviceToken: finalDeviceToken });
    } catch (error) {
        const errorMessage = error.response ? (error.response.data.statusMessage || JSON.stringify(error.response.data)) : error.message;
        res.status(401).json({ message: errorMessage || 'Erro durante o processo de login.' });
    }
});

app.post('/logout', (req, res) => res.status(200).json({ message: 'Logout bem-sucedido.' }));

// ======================================================
// NOVAS ROTAS ESPECÍFICAS DA API
// ======================================================

app.post('/get-warehouses', authenticateToken, async (req, res) => {
    try {
        const sql = "SELECT CODARM, CODARM || '-' || DESARM FROM AD_CADARM ORDER BY CODARM";
        const data = await callSankhyaService("DbExplorerSP.executeQuery", { sql });
        if (data.status !== '1') throw new Error(data.statusMessage);
        res.json(data.responseBody.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/search-items', authenticateToken, async (req, res) => {
    const { codArm, filtro } = req.body;
    if (!codArm) return res.status(400).json({ message: "O código do armazém é obrigatório." });
    try {
        let sqlFinal = `SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm}`;
        let orderByClause = '';
        if (filtro) {
            const filtroLimpo = filtro.trim();
            if (/^\d+$/.test(filtroLimpo)) {
                sqlFinal += ` AND (ENDE.SEQEND LIKE '${filtroLimpo}%' OR ENDE.CODPROD = ${filtroLimpo} OR ENDE.CODPROD = (SELECT CODPROD FROM AD_CADEND WHERE SEQEND = ${filtroLimpo} AND CODARM = ${codArm} AND ROWNUM = 1))`;
                orderByClause = ` ORDER BY CASE WHEN ENDE.SEQEND = ${filtroLimpo} THEN 0 ELSE 1 END, ENDE.ENDPIC DESC, ENDE.DATVAL ASC`;
            } else {
                const removerAcentos = (texto) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const palavrasChave = removerAcentos(filtroLimpo).split(' ').filter(p => p.length > 0);
                const condicoes = palavrasChave.map(palavra => {
                    const palavraUpper = palavra.toUpperCase();
                    const cleanDescrprod = "TRANSLATE(UPPER(PRO.DESCRPROD), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')";
                    const cleanMarca = "TRANSLATE(UPPER(PRO.MARCA), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')";
                    return `(${cleanDescrprod} LIKE '%${palavraUpper}%' OR ${cleanMarca} LIKE '%${palavraUpper}%')`;
                });
                if (condicoes.length > 0) sqlFinal += ` AND ${condicoes.join(' AND ')}`;
                orderByClause = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';
            }
        } else {
            orderByClause = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';
        }
        sqlFinal += orderByClause;
        
        const data = await callSankhyaService("DbExplorerSP.executeQuery", { "sql": sqlFinal });
        if (data.status !== "1") throw new Error(data.statusMessage);
        res.json(data.responseBody.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/get-item-details', authenticateToken, async (req, res) => {
    try {
        const { codArm, sequencia } = req.body;
        const sql = `SELECT ENDE.CODARM, ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm} AND ENDE.SEQEND = ${sequencia}`;
        const data = await callSankhyaService("DbExplorerSP.executeQuery", { sql });
        if (data.status === "1" && data.responseBody.rows.length > 0) {
            res.json(data.responseBody.rows[0]);
        } else {
            throw new Error('Produto não encontrado ou erro na consulta.');
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ROTA ADICIONADA
app.post('/get-picking-locations', authenticateToken, async (req, res) => {
    try {
        const { codarm, codprod, sequencia } = req.body;
        const sql = `SELECT ENDE.SEQEND, PRO.DESCRPROD FROM AD_CADEND ENDE JOIN TGFPRO PRO ON ENDE.CODPROD = PRO.CODPROD WHERE ENDE.CODARM = ${codarm} AND ENDE.CODPROD = ${codprod} AND ENDE.ENDPIC = 'S' AND ENDE.SEQEND <> ${sequencia} ORDER BY ENDE.SEQEND`;
        const data = await callSankhyaService("DbExplorerSP.executeQuery", { sql });
        if (data.status !== '1') throw new Error(data.statusMessage);
        res.json(data.responseBody.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/get-history', authenticateToken, async (req, res) => {
    try {
        const { codusu } = req.userSession;
        const hoje = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const sql = `
            WITH RankedItems AS (
                SELECT BXA.SEQBAI, TO_CHAR(BXA.DATGER, 'HH24:MI:SS') AS HORA, BXA.DATGER, IBX.CODARM, IBX.SEQEND, IBX.ARMDES, IBX.ENDDES, IBX.CODPROD, IBX.SEQITE, PRO.DESCRPROD,
                ROW_NUMBER() OVER(PARTITION BY BXA.SEQBAI ORDER BY IBX.SEQITE DESC) as rn
                FROM AD_BXAEND BXA JOIN AD_IBXEND IBX ON IBX.SEQBAI = BXA.SEQBAI LEFT JOIN TGFPRO PRO ON IBX.CODPROD = PRO.CODPROD
                WHERE BXA.USUGER = ${codusu} AND TRUNC(BXA.DATGER) = TO_DATE('${hoje}', 'DD/MM/YYYY')
            )
            SELECT SEQBAI, HORA, CODARM, SEQEND, ARMDES, ENDDES, CODPROD, DESCRPROD FROM RankedItems WHERE rn = 1 ORDER BY DATGER DESC`;
        const data = await callSankhyaService("DbExplorerSP.executeQuery", { sql });
        if (data.status !== "1") throw new Error(data.statusMessage || "Falha ao carregar o histórico.");
        res.json(data.responseBody.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/execute-transaction', authenticateToken, async (req, res) => {
    const { type, payload } = req.body;
    const { codusu } = req.userSession;
    
    try {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const cabecalhoData = await callSankhyaService("DatasetSP.save", {
            entityName: "AD_BXAEND", fields: ["SEQBAI", "DATGER", "USUGER"],
            records: [{ values: { "1": hoje, "2": codusu } }]
        });
        if (cabecalhoData.status !== "1" || !cabecalhoData.responseBody.result?.[0]?.[0]) {
            throw new Error(cabecalhoData.statusMessage || "Falha ao criar cabeçalho da transação.");
        }
        const seqBai = cabecalhoData.responseBody.result[0][0];

        let recordsToSave = [];
        if (type === 'baixa') {
            recordsToSave.push({
                entityName: "AD_IBXEND",
                fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
                values: { "2": payload.codarm.toString(), "3": payload.sequencia.toString(), "4": payload.quantidade.toString() }
            });
        } else if (type === 'transferencia' || type === 'picking') {
            const { codarm, sequencia, codprod } = payload.origem;
            const { armazemDestino, enderecoDestino, quantidade } = payload.destino;

            const checkSql = `SELECT CODPROD, QTDPRO FROM AD_CADEND WHERE SEQEND = ${enderecoDestino} AND CODARM = ${armazemDestino}`;
            const checkData = await callSankhyaService("DbExplorerSP.executeQuery", { sql: checkSql });
            if (checkData.status !== '1') throw new Error("Falha ao verificar o endereço de destino.");
            const destinationItem = checkData.responseBody.rows.length > 0 ? checkData.responseBody.rows[0] : null;

            if (destinationItem && destinationItem[0] === codprod) {
                recordsToSave.push({
                    entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
                    values: { "2": armazemDestino, "3": enderecoDestino, "4": destinationItem[1].toString() }
                });
            }
            recordsToSave.push({
                entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "ARMDES", "ENDDES", "QTDPRO"],
                values: { "2": codarm.toString(), "3": sequencia.toString(), "4": armazemDestino, "5": enderecoDestino, "6": quantidade.toString() }
            });
        }

        for (const record of recordsToSave) {
            record.values["1"] = seqBai;
            const itemData = await callSankhyaService("DatasetSP.save", { ...record, standAlone: false, records: [{ values: record.values }] });
            if (itemData.status !== "1") throw new Error(itemData.statusMessage || "Falha ao inserir item da transação.");
        }

        const pollSql = `SELECT COUNT(*) FROM AD_IBXEND WHERE SEQBAI = ${seqBai} AND CODPROD IS NOT NULL`;
        let isPopulated = false;
        for (let i = 0; i < 10; i++) {
            const pollData = await callSankhyaService("DbExplorerSP.executeQuery", { sql: pollSql });
            if (pollData.status === '1' && parseInt(pollData.responseBody.rows[0][0], 10) >= recordsToSave.length) {
                isPopulated = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!isPopulated) throw new Error("Timeout: O sistema não populou o CODPROD a tempo.");

        const stpData = await callSankhyaService("ActionButtonsSP.executeSTP", {
            stpCall: { actionID: "20", procName: "NIC_STP_BAIXA_END", rootEntity: "AD_BXAEND", rows: { row: [{ field: [{ fieldName: "SEQBAI", "$": seqBai }] }] } }
        });
        if (stpData.status !== "1" && stpData.status !== "2") throw new Error(stpData.statusMessage || "Falha ao executar a procedure de baixa.");

        res.json({ message: stpData.statusMessage || 'Operação concluída com sucesso!' });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ======================================================
// SERVIR ARQUIVOS DO FRONTEND
// ======================================================
app.use(express.static(path.join(__dirname, '')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => console.log(`\n✅ Servidor completo (Proxy + Frontend) rodando em http://localhost:${PORT}`));