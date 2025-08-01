// server.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

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
                'token': process.env.SANKHYA_TOKEN // <-- ESTA LINHA ESTAVA FALTANDO
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

// Rota de login do OPERADOR
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log(`Tentativa de login para o operador: ${username}`);
    try {
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

        console.log(`Operador ${username} validado com sucesso.`);

        const sessionPayload = { username: username };
        const sessionToken = jwt.sign(sessionPayload, JWT_SECRET, { expiresIn: '8h' });

        res.json({ sessionToken: sessionToken, username: username });

    } catch (error) {
        const errorMessage = error.response ? error.response.data.statusMessage : error.message;
        console.error('Erro no login do operador:', errorMessage);
        res.status(401).json({ message: errorMessage || 'Usuário ou senha inválidos.' });
    }
});

// Rota genérica para chamadas à API
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
            // Se o erro for 401, o token pode ter expirado. Tenta renovar e refazer a chamada UMA vez.
            if (error.response && error.response.status === 401) {
                console.log("Token de sistema possivelmente expirado. Tentando renovar...");
                systemToken = await getSystemBearerToken(true); // Força a renovação
                const response = await axios.post(queryUrl, { requestBody }, {
                    headers: { 'Authorization': `Bearer ${systemToken}` }
                });
                return res.json(response.data);
            }
            throw error; // Se o erro não for 401, apenas o relança
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

// ======================================================
// SERVIR OS ARQUIVOS DO FRONTEND
// ======================================================
app.use(express.static(path.join(__dirname, '')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ======================================================
// INICIAR O SERVIDOR
// ======================================================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`\n✅ Servidor completo (Proxy + Frontend) rodando!`);
    console.log(`   - Para acessar no seu PC, use: http://localhost:${PORT}`);
});