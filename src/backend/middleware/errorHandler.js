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
const { ZodError } = require('zod'); // Importa o ZodError para uma verificação mais segura
const { sendErrorEmail } = require('../services/email.service'); // Importa o nosso novo serviço

const errorHandler = (err, req, res, next) => {
    logger.error(`Erro não tratado: ${err.message}\nStack: ${err.stack}`);

    // NOVO: Envia o e-mail de notificação em segundo plano
    // A função é 'async' mas não usamos 'await' para não bloquear a resposta ao usuário
    sendErrorEmail(err, req);

    // Erro de validação do Zod
    if (err instanceof ZodError) {
        return res.status(400).json({
            message: 'Dados da requisição inválidos.',
            errors: err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
    }

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Ocorreu um erro interno no servidor.';

    // Evita enviar uma nova resposta se uma já foi enviada
    if (res.headersSent) {
        return next(err);
    }

    res.status(statusCode).json({ message });
};

module.exports = { errorHandler };