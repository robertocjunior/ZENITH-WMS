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