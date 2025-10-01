// src/backend/middleware/errorHandler.js
const logger = require('../../../logger');
const { ZodError } = require('zod');
const { sendErrorEmail } = require('../services/email.service');

const errorHandler = (err, req, res, next) => {
    logger.error(`Erro não tratado: ${err.message}\nStack: ${err.stack}`);

    // Clona o objeto de requisição para evitar modificar o original
    const sanitizedReq = {
        ...req,
        body: req.body ? { ...req.body } : {}
    };

    if (sanitizedReq.body.password) {
        sanitizedReq.body.password = '[REMOVIDO POR SEGURANÇA]';
    }

    // O errorHandler é o único que chama o serviço de e-mail.
    sendErrorEmail(err, sanitizedReq);

    // Trata erros de validação
    if (err instanceof ZodError) {
        return res.status(400).json({
            message: 'Dados da requisição inválidos.',
            errors: err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
    }
    
    // Trata especificamente o erro de sessão expirada do Sankhya para o cliente
    if (err.sankhyaResponse && err.message.includes('Não autorizado')) {
        return res.status(401).json({
            message: "Sua sessão no sistema Sankhya expirou. Por favor, faça o login novamente para continuar.",
            reauthRequired: true
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