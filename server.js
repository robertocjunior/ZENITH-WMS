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

// ======================================================
// GERENCIAMENTO DO BEARER TOKEN DE SISTEMA
// ======================================================
let systemBearerToken = null;

async function getSystemBearerToken(forceRefresh = false) {
    if (systemBearerToken && !forceRefresh) {
        return systemBearerToken;
    }

    console.log("Autenticando o sistema para obter Bearer Token...");
    try {
        const response = await axios.post(`${SANKHYA_API_URL}/login`, {}, {
            headers: {
                'appkey': process.env.SANKHYA_APPKEY,
                'username': process.env.SANKHYA_USERNAME,
                'password': process.env.SANKHYA_PASSWORD,
                'token': process.env.SANKHYA_TOKEN
            }
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


// ======================================================
// MIDDLEWARE DE AUTENTICAÇÃO COM JWT
// ======================================================
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
// ROTAS DA API
// ======================================================

// Rota de login do OPERADOR (MODIFICADA)
app.post('/login', async (req, res) => {
    const { username, password, deviceToken: clientDeviceToken } = req.body;
    console.log(`Tentativa de login para: ${username}`);

    try {
        // ETAPA 1: Autenticar credenciais do usuário no Sankhya
        const systemToken = await getSystemBearerToken();
        const validationUrl = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json`;
        const validationBody = {
            serviceName: "MobileLoginSP.login",
            requestBody: {
                NOMUSU: { "$": username.toUpperCase() },
                INTERNO: { "$": password }
            }
        };
        const validationResponse = await axios.post(validationUrl, validationBody, {
            headers: { 'Authorization': `Bearer ${systemToken}` }
        });

        if (validationResponse.data.status !== "1") {
            throw new Error(validationResponse.data.statusMessage || 'Credenciais de operador inválidas.');
        }

        // ETAPA 2: Obter o CODUSU do usuário autenticado
        const sqlCodUsu = `SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${username.toUpperCase()}'`;
        const queryUrl = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`;
        const userQueryResponse = await axios.post(queryUrl, { requestBody: { sql: sqlCodUsu } }, {
            headers: { 'Authorization': `Bearer ${systemToken}` }
        });
        
        if (userQueryResponse.data.status !== '1' || userQueryResponse.data.responseBody.rows.length === 0) {
            throw new Error("Não foi possível encontrar o código de usuário (CODUSU).");
        }
        const codUsu = userQueryResponse.data.responseBody.rows[0][0];

        // ETAPA 3: Lógica de Autorização do Dispositivo
        let finalDeviceToken = clientDeviceToken;
        let deviceIsAuthorized = false;

        if (clientDeviceToken) {
            const sqlCheckDevice = `SELECT ATIVO FROM AD_DISPAUT WHERE CODUSU = ${codUsu} AND DEVICETOKEN = '${clientDeviceToken}'`;
            const deviceCheckResponse = await axios.post(queryUrl, { requestBody: { sql: sqlCheckDevice } }, { headers: { 'Authorization': `Bearer ${systemToken}` } });

            if (deviceCheckResponse.data.responseBody.rows.length > 0) {
                const status = deviceCheckResponse.data.responseBody.rows[0][0];
                if (status === 'S') {
                    deviceIsAuthorized = true;
                } else {
                    // MODIFICADO: Retorna o token mesmo no erro
                     return res.status(403).json({ 
                        message: 'Este dispositivo está registrado, mas não está ativo. Contate um administrador.',
                        deviceToken: clientDeviceToken 
                    });
                }
            }
        }
        
        // Se não tem token ou o token não foi encontrado no banco, é um dispositivo novo.
        if (!deviceIsAuthorized) {
            finalDeviceToken = crypto.randomBytes(20).toString('hex');
            const descrDisp = req.headers['user-agent'] ? req.headers['user-agent'].substring(0, 100) : 'Dispositivo Web';
            
            const saveUrl = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=DatasetSP.save&outputType=json`;
            const saveBody = {
                entityName: "AD_DISPAUT",
                fields: ["CODUSU", "DEVICETOKEN", "DESCRDISP", "ATIVO", "DHGER"],
                records: [{
                    values: {
                        "0": codUsu,
                        "1": finalDeviceToken,
                        "2": descrDisp,
                        "3": "N", // Dispositivos novos são cadastrados como INATIVOS
                        "4": new Date().toLocaleDateString('pt-BR')
                    }
                }]
            };

            await axios.post(saveUrl, { requestBody: saveBody }, { headers: { 'Authorization': `Bearer ${systemToken}` }});
            
            // MODIFICADO: Retorna o NOVO token mesmo no erro
            return res.status(403).json({ 
                message: 'Dispositivo novo detectado e registrado. Solicite a um administrador para ativá-lo.',
                deviceToken: finalDeviceToken
            });
        }

        // ETAPA 4: Se chegou até aqui, o dispositivo está autorizado. Gerar token de sessão.
        console.log(`Dispositivo autorizado para o operador ${username}.`);
        const sessionPayload = { username: username, codusu: codUsu };
        const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '8h' });

        res.json({ sessionToken, username, codusu: codUsu, deviceToken: finalDeviceToken });

    } catch (error) {
        const errorMessage = error.response ? (error.response.data.statusMessage || JSON.stringify(error.response.data)) : error.message;
        console.error('Erro no login:', errorMessage);
        res.status(401).json({ message: errorMessage || 'Erro durante o processo de login.' });
    }
});

app.post('/api', authenticateToken, async (req, res) => {
    const { serviceName, requestBody } = req.body;
    const { username } = req.userSession;
    
    console.log(`Operador '${username}' consultando o serviço: ${serviceName}`);
    try {
        let systemToken = await getSystemBearerToken();
        const queryUrl = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
        
        try {
            const response = await axios.post(queryUrl, { requestBody }, {
                headers: { 'Authorization': `Bearer ${systemToken}` }
            });
            return res.json(response.data);
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log("Token de sistema possivelmente expirado. Tentando renovar...");
                systemToken = await getSystemBearerToken(true);
                const response = await axios.post(queryUrl, { requestBody }, {
                    headers: { 'Authorization': `Bearer ${systemToken}` }
                });
                return res.json(response.data);
            }
            throw error;
        }
    } catch (error) {
        const message = error.response ? (error.response.data.statusMessage || JSON.stringify(error.response.data)) : "Erro interno do servidor.";
        console.error('Erro na consulta ao Sankhya:', message);
        res.status(500).json({ message: message });
    }
});

app.post('/logout', (req, res) => {
    res.status(200).json({ message: 'Logout bem-sucedido.' });
});

app.use(express.static(path.join(__dirname, '')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`\n✅ Servidor completo (Proxy + Frontend) rodando!`);
    console.log(`   - Para acessar no seu PC, use: http://localhost:${PORT}`);
});