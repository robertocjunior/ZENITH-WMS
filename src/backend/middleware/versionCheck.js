/**
 * Copyright (c) 2025 Roberto Casali Junior. Todos os Direitos Reservados.
 * (Presumindo a manutenção do copyright)
 */

const semver = require('semver');
// Ajuste o caminho para o logger se server.js e logger.js estiverem na raiz
const logger = require('../../../logger'); 

// Pega a versão mínima do .env ou usa '1.0.0' como padrão
// Ex: MIN_APP_VERSION=1.0.13
const MIN_APP_VERSION = process.env.MIN_APP_VERSION || '1.0.0'; 

const checkAppVersion = (req, res, next) => {
    
    // Lista de rotas públicas que não precisam de verificação de versão (ex: o próprio login)
    const publicPaths = [
        '/login' 
        // Adicione outras rotas públicas se necessário, ex: '/status'
    ];

    // Deixa o login passar. A versão do login será checada na própria rota de login
    // se o appVersion for enviado (o que faremos), mas não será bloqueado aqui.
    if (publicPaths.includes(req.path)) {
        return next();
    }

    const appVersion = req.headers['x-app-version'];

    if (!appVersion) {
        logger.warn('Tentativa de acesso sem header X-App-Version.');
        // Retorna 400 Bad Request
        return res.status(400).json({ 
            message: 'Versão do aplicativo não informada (Header X-App-Version ausente).' 
        });
    }

    // Verifica se a versão enviada é válida
    if (!semver.valid(appVersion)) {
        logger.warn(`Versão de aplicativo inválida recebida: ${appVersion}`);
         return res.status(400).json({ 
            message: `Formato de versão inválido: ${appVersion}.`
        });
    }

    // Verifica se a versão enviada é MENOR que a versão mínima
    // semver.lt(a, b) -> true se a < b
    if (semver.lt(appVersion, MIN_APP_VERSION)) {
         logger.warn(`Aplicativo versão ${appVersion} bloqueado. Mínimo requerido: ${MIN_APP_VERSION}`);
         // Retorna 426 Upgrade Required
         return res.status(426).json({
             message: `Seu aplicativo está desatualizado (v${appVersion}). Por favor, atualize para a versão ${MIN_APP_VERSION} ou superior para continuar.`,
             requiredVersion: MIN_APP_VERSION,
             currentVersion: appVersion
         });
    }

    // Versão OK, continua
    next();
};

module.exports = { checkAppVersion };