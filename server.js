// server.js (VERSÃO COMPLETA E CORRIGIDA)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Assumindo que você tem um arquivo logger.js na raiz. Se não, pode remover esta linha.
const logger = require('./logger'); 
const allRoutes = require('./src/backend/routes');
const { initializeSankhyaService } = require('./src/backend/services/sankhya.service');
const { errorHandler } = require('./src/backend/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3030;

// --- Middlewares de Segurança e Gerais ---
app.use(helmet({ contentSecurityPolicy: false })); // CSP desabilitado para facilitar o desenvolvimento
app.use(cors()); // Permite requisições de diferentes origens
app.set('trust proxy', 1); // Necessário se estiver atrás de um proxy reverso (NGINX, etc)
app.use(express.json()); // Essencial para o servidor entender o JSON enviado pelo Postman/frontend
app.use(cookieParser()); // Para ler cookies, como o seu sessionToken

// --- Limitador de Requisições (Rate Limiter) ---
// Protege contra ataques de força bruta
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 200, // Limita cada IP a 200 requisições por janela
    message: 'Muitas requisições para a API a partir deste IP, tente novamente após 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Rotas da API ---
// IMPORTANTE: Todas as suas rotas de API agora estão prefixadas com /api
// Exemplo: http://localhost:3030/api/login
app.use('/api', apiLimiter, allRoutes);

// --- Lógica para Servir Arquivos do Frontend ---

if (process.env.NODE_ENV === 'production') {
    // Em PRODUÇÃO, serve a pasta 'dist' gerada pelo build do seu framework (React, Vue, etc.)
    logger.info('Servidor em modo de PRODUÇÃO.');
    const buildPath = path.join(__dirname, 'dist');
    app.use(express.static(buildPath));
    // Rota "catch-all": Qualquer requisição que não seja para a API, serve o app React.
    app.get('*', (req, res) => {
        res.sendFile(path.join(buildPath, 'index.html'));
    });
} else {
    // Em DESENVOLVIMENTO, servimos os arquivos de forma mais direta e segura
    logger.info('Servidor em modo de DESENVOLVIMENTO.');

    // 1. Serve a pasta 'public' para assets como ícones e manifest.json
    app.use(express.static(path.join(__dirname, 'public')));

    // 2. Serve a pasta 'src' para que o navegador encontre '/src/frontend/main.js', etc.
    app.use('/src', express.static(path.join(__dirname, 'src')));

    // 3. Rota "catch-all": Se nenhuma rota anterior corresponder, serve o index.html principal.
    // Isso assume que você tem um `index.html` na raiz do projeto para desenvolvimento.
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
}

// --- Middleware de Tratamento de Erros ---
// Deve ser o último middleware a ser registrado para capturar erros de todas as rotas
app.use(errorHandler);

// --- Inicialização do Servidor ---
const startServer = async () => {
    try {
        // Inicializa serviços externos (como o Sankhya) antes de começar a ouvir requisições
        await initializeSankhyaService();
        app.listen(PORT, '0.0.0.0', () =>
            logger.info(`✅ Servidor rodando em http://localhost:${PORT}`)
        );
    } catch (error) {
        logger.error(`❌ Falha crítica ao iniciar o servidor: ${error.message}`);
        process.exit(1); // Encerra o processo se a inicialização falhar
    }
};

startServer();
