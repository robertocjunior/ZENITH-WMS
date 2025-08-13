// server.js (VERSÃO CORRIGIDA)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const logger = require('./logger');
const allRoutes = require('./src/backend/routes');
const { initializeSankhyaService } = require('./src/backend/services/sankhya.service');
const { errorHandler } = require('./src/backend/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Middlewares de Segurança e Gerais
app.use(helmet({ contentSecurityPolicy: false })); // Simplificado para evitar bloqueios inesperados durante o debug
app.use(cors());
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

// Limitador de Requisições
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Muitas requisições para a API a partir deste IP.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Registrar Rotas da API (atrás do limiter)
app.use('/api', apiLimiter, allRoutes);

// --- LÓGICA DE SERVIR ARQUIVOS CORRIGIDA ---

// 1. Servir a pasta 'public' primeiro.
// Isso garante que pedidos para /icons/image.png sejam encontrados em /public/icons/image.png
app.use(express.static(path.join(__dirname, 'public')));

// 2. Lógica para servir a aplicação
if (process.env.NODE_ENV === 'production') {
    logger.info('Servidor em modo de PRODUÇÃO.');
    const buildPath = path.join(__dirname, 'dist');
    app.use(express.static(buildPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(buildPath, 'index.html'));
    });
} else {
    logger.info('Servidor em modo de DESENVOLVIMENTO.');
    // 3. Servir a raiz do projeto para que o navegador encontre /src/frontend/main.js
    app.use(express.static(__dirname));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
}

// Middleware de Tratamento de Erros (deve ser o último)
app.use(errorHandler);

const startServer = async () => {
    try {
        await initializeSankhyaService();
        app.listen(PORT, HOST, () =>
            logger.info(`✅ Servidor rodando em http://localhost:${PORT}`)
        );
    } catch (error) {
        logger.error(`Falha crítica ao iniciar o servidor: ${error.message}`);
        process.exit(1);
    }
};

startServer();