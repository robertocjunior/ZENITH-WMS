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

const errorHandler = (err, req, res, next) => {
    logger.error(`Erro não tratado: ${err.message}\nStack: ${err.stack}`);

    // Zod validation errors
    if (err.errors) {
        return res.status(400).json({
            message: 'Dados da requisição inválidos.',
            errors: err.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
    }

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Ocorreu um erro interno no servidor.';

    res.status(statusCode).json({ message });
};

module.exports = { errorHandler };