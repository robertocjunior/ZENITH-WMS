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

// src/backend/middleware/errorHandler.js
const logger = require('../../../logger');
const { ZodError } = require('zod');
const { sendErrorEmail } = require('../services/email.service');

const errorHandler = (err, req, res, next) => {
    logger.error(`Erro não tratado: ${err.message}\nStack: ${err.stack}`);

    // =================================================================
    // NOVO: Bloco de sanitização para remover dados sensíveis
    // =================================================================
    // Clona o objeto de requisição para evitar modificar o original
    const sanitizedReq = {
        ...req,
        // Clona o body para poder modificá-lo com segurança
        body: req.body ? { ...req.body } : {}
    };

    // Se houver um campo 'password' no corpo da requisição, ele será removido
    if (sanitizedReq.body.password) {
        sanitizedReq.body.password = '[REMOVIDO POR SEGURANÇA]';
    }
    // Você pode adicionar outras chaves para remover aqui no futuro (ex: token, etc.)
    // if (sanitizedReq.body.secretKey) {
    //     sanitizedReq.body.secretKey = '[REMOVIDO POR SEGURANÇA]';
    // }

    // Envia o e-mail de notificação com a requisição já sanitizada
    sendErrorEmail(err, sanitizedReq);
    // =================================================================


    // Zod validation errors
    if (err instanceof ZodError) {
        return res.status(400).json({
            message: 'Dados da requisição inválidos.',
            errors: err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
    }

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Ocorreu um erro interno no servidor.';

    if (res.headersSent) {
        return next(err);
    }

    res.status(statusCode).json({ message });
};

module.exports = { errorHandler };