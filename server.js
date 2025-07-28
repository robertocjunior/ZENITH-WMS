// server.js
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const SANKHYA_API_URL = process.env.SANKHYA_API_URL;

// ======================================================
// ROTAS DA API
// ======================================================

// Rota de login
app.post('/login', async (req, res) => {
    console.log('Recebida requisição de login...');
    try {
        const response = await axios.post(`${SANKHYA_API_URL}/login`, {}, {
            headers: {
                'appkey': process.env.SANKHYA_APPKEY,
                'token': process.env.SANKHYA_TOKEN,
                'username': process.env.SANKHYA_USERNAME,
                'password': process.env.SANKHYA_PASSWORD
            }
        });
        console.log('Login no Sankhya bem-sucedido.');
        res.json(response.data);
    } catch (error) {
        console.error('Erro ao fazer login no Sankhya:', error.response ? error.response.data : { message: error.message });
        res.status(500).json({ message: 'Erro ao fazer login no Sankhya' });
    }
});

// Rota genérica para chamadas à API do Sankhya
app.post('/api', async (req, res) => {
    const { bearerToken, serviceName, requestBody } = req.body;
    console.log(`Recebida requisição de consulta para o serviço: ${serviceName}`);
    try {
        const queryUrl = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=${serviceName}&outputType=json`;
        const response = await axios.post(queryUrl, { requestBody }, {
            headers: { 'Authorization': `Bearer ${bearerToken}` }
        });
        console.log('Consulta no Sankhya bem-sucedida.');
        res.json(response.data);
    } catch (error) {
        console.error('Erro na consulta ao Sankhya:', error.response ? error.response.data : { message: error.message });
        res.status(500).json({ message: 'Erro na consulta ao Sankhya' });
    }
});

// Rota de logout
app.post('/logout', async (req, res) => {
    const { bearerToken } = req.body;
    console.log('Recebida requisição de logout...');
    try {
        const logoutUrl = `${SANKHYA_API_URL}/gateway/v1/mge/service.sbr?serviceName=MobileLoginSP.logout&outputType=json`;
        const response = await axios.post(logoutUrl, {}, {
            headers: {
                'appkey': process.env.SANKHYA_APPKEY,
                'Authorization': `Bearer ${bearerToken}`
            }
        });
        if (response.data && response.data.status === "1") {
            console.log("SUCESSO: Sessão do token foi encerrada corretamente no Sankhya.");
        } else {
            console.warn(`FALHA: O Sankhya respondeu, mas a sessão não foi encerrada.`);
        }
        res.json(response.data);
    } catch (error) {
        console.error('ERRO: A chamada de logout para o Sankhya falhou:', error.response ? error.response.data : { message: error.message });
        res.status(500).json({ message: 'Erro na chamada de logout para o Sankhya' });
    }
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
    console.log(`   - Para acessar no celular (na mesma rede), use o IP do seu PC.`);
    console.log(`\n👉 Não é mais necessário usar o "Live Server".\n`);
});