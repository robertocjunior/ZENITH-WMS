// src/backend/services/email.service.js
const nodemailer = require('nodemailer');
const logger = require('../../../logger');
const fs = require('fs');
const path = require('path');

const emailTemplatePath = path.join(__dirname, '..', 'templates', 'errorEmailTemplate.html');
let emailTemplate = '';
try {
    emailTemplate = fs.readFileSync(emailTemplatePath, 'utf8');
} catch (error) {
    logger.error('CRÍTICO: Template de e-mail de erro não encontrado em ' + emailTemplatePath);
}

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

const sendErrorEmail = async (error, req = {}) => {
    if (process.env.EMAIL_NOTIFICATIONS_ENABLED !== 'true') {
        return;
    }

    const recipients = process.env.EMAIL_RECIPIENTS;
    if (!recipients) {
        logger.warn('Nenhum destinatário de e-mail configurado em EMAIL_RECIPIENTS. O e-mail de erro não será enviado.');
        return;
    }

    try {
        const isTestEnvironment = process.env.SANKHYA_API_URL.includes('sandbox');
        const environmentName = isTestEnvironment ? 'TESTE (Sandbox)' : 'PRODUÇÃO';
        const environmentClass = isTestEnvironment ? 'env-teste' : 'env-prod';
        const environmentEmoji = isTestEnvironment ? '🧪' : '🚨';

        const user = req.userSession ? `${req.userSession.username} (CODUSU: ${req.userSession.codusu})` : 'N/A';
        const endpoint = req.originalUrl || 'N/A';
        const method = req.method || 'N/A';
        const body = req.body ? JSON.stringify(req.body, null, 2) : 'Nenhum';
        
        // NOVO: Captura a resposta do Sankhya do objeto de erro
        const sankhyaResponse = error.sankhyaResponse 
            ? JSON.stringify(error.sankhyaResponse, null, 2) 
            : 'Nenhuma resposta do ERP foi capturada.';

        let htmlBody = emailTemplate
            .replace('{{errorMessage}}', error.message || 'Erro desconhecido')
            .replace('{{timestamp}}', new Date().toLocaleString('pt-BR'))
            .replace('{{environment}}', environmentName)
            .replace('{{environmentClass}}', environmentClass)
            .replace('{{user}}', user)
            .replace('{{endpoint}}', `${method} ${endpoint}`)
            .replace('{{body}}', body)
            .replace('{{sankhyaResponse}}', sankhyaResponse) // NOVO: Adiciona a resposta do ERP ao corpo
            .replace('{{stackTrace}}', error.stack || 'Sem stack trace disponível');

        const mailOptions = {
            from: `"Alerta WMS Zenith" <${process.env.SMTP_USER}>`,
            to: recipients,
            subject: `${environmentEmoji} [${environmentName}] Erro no WMS: ${error.message.substring(0, 40)}`,
            html: htmlBody,
        };

        await transporter.sendMail(mailOptions);
        logger.info(`E-mail de notificação de erro enviado para: ${recipients}`);

    } catch (emailError) {
        logger.error('Falha CRÍTICA ao enviar e-mail de notificação de erro:', emailError);
    }
};

module.exports = { sendErrorEmail };