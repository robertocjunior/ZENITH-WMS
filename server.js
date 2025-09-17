/**
 * Copyright (c) 2025 Roberto Casali Junior. Todos os Direitos Reservados.
 *
 * AVISO DE PROPRIEDADE E CONFIDENCIALIDADE
 *
 * Este código-fonte é propriedade intelectual confidencial e proprietária de
 * Roberto Casali Junior. Seu uso, cópia, modificação, distribuição ou execução
 * são estritamente proibidos sem a autorização prévia, expressa e por escrito
 * do autor.
 *
 * Este software é regido pelos termos e condições estabelecidos no Contrato de
 * Licença de Usuário Final (EULA) que o acompanha. A violação destes termos
 * constitui uma infração à lei de direitos autorais (Lei nº 9.610/98) e
 * sujeitará o infrator às sanções aplicáveis.
 */

// server.js (VERSÃO COM MODO API-ONLY)

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
const PORT = process.env.PORT || 3030;

// --- Middlewares de Segurança e Gerais ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());

// --- Limitador de Requisições (Rate Limiter) ---
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Muitas requisições para a API a partir deste IP, tente novamente após 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Rotas da API ---
app.use('/api', apiLimiter, allRoutes);

// --- Lógica para Servir Arquivos do Frontend ---
// Apenas ativa a interface web se a variável de ambiente API_ONLY_MODE não for 'true'
if (process.env.API_ONLY_MODE !== 'true') {
    if (process.env.NODE_ENV === 'production') {
        // Em PRODUÇÃO, serve a pasta 'dist' gerada pelo build do seu framework (React, Vue, etc.)
        logger.info('Servidor em modo de PRODUÇÃO, servindo interface web.');
        const buildPath = path.join(__dirname, 'dist');
        app.use(express.static(buildPath));
        // Rota "catch-all": Qualquer requisição que não seja para a API, serve o app React.
        app.get('*', (req, res) => {
            // Garante que requisições para a API não sejam capturadas aqui
            if (!req.originalUrl.startsWith('/api')) {
                res.sendFile(path.join(buildPath, 'index.html'));
            }
        });
    } else {
        // Em DESENVOLVIMENTO, servimos os arquivos de forma mais direta e segura
        logger.info('Servidor em modo de DESENVOLVIMENTO, servindo interface web.');
        app.use(express.static(path.join(__dirname, 'public')));
        app.use('/src', express.static(path.join(__dirname, 'src')));
        // Rota "catch-all": Se nenhuma rota anterior corresponder, serve o index.html principal.
        app.get('*', (req, res) => {
            // Garante que requisições para a API não sejam capturadas aqui
            if (!req.originalUrl.startsWith('/api')) {
                res.sendFile(path.join(__dirname, 'index.html'));
            }
        });
    }
} else {
    logger.info('Servidor em modo API_ONLY. A interface web está desativada.');
}


// --- Middleware de Tratamento de Erros ---
app.use(errorHandler);

// --- Inicialização do Servidor ---
const startServer = async () => {
    try {
        await initializeSankhyaService();
        app.listen(PORT, '0.0.0.0', () =>
            logger.info(`✅ Servidor rodando em http://localhost:${PORT}`)
        );
    } catch (error) {
        logger.error(`❌ Falha crítica ao iniciar o servidor: ${error.message}`);
        process.exit(1);
    }
};

startServer();