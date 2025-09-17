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

// src/backend/middleware/authenticateToken.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
    let token;
    const authHeader = req.headers['authorization'];

    // 1. Tenta pegar o token do cabeçalho 'Authorization' (formato "Bearer TOKEN") para a API
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    // 2. Se não encontrou no cabeçalho, tenta pegar do cookie (para a interface web)
    if (!token && req.cookies && req.cookies.sessionToken) {
        token = req.cookies.sessionToken;
    }

    // 3. Se, depois de ambas as verificações, não houver token, retorna o erro
    if (!token) {
        return res.status(401).json({ message: "Acesso negado. Nenhum token fornecido." });
    }

    // 4. Verifica a validade do token encontrado
    jwt.verify(token, JWT_SECRET, (err, userSession) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ message: "Sessão expirada. Por favor, faça login novamente." });
            }
            // Se o token for inválido por qualquer outro motivo
            return res.status(403).json({ message: "Token inválido." });
        }
        
        // Se o token for válido, anexa os dados do usuário à requisição e continua
        req.userSession = userSession;
        next();
    });
};

module.exports = { authenticateToken };