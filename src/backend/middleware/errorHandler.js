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