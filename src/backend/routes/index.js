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

// src/backend/routes/index.js
const express = require('express');
const { validate } = require('../validationSchemas');
const { loginSchema } = require('../validationSchemas');
const { login, logout } = require('../controllers/auth.controller');
const wmsRoutes = require('./wms.routes');
const { authenticateToken } = require('../middleware/authenticateToken');

const router = express.Router();

// Rotas públicas (autenticação)
router.post('/login', validate(loginSchema), login);
router.post('/logout', authenticateToken, logout); // Logout precisa de token para invalidar a sessão correta

// --- LINHA MODIFICADA ---
// Agora, todas as rotas de wmsRoutes são protegidas e exigem um token válido.
router.use('/', authenticateToken, wmsRoutes);

module.exports = router;