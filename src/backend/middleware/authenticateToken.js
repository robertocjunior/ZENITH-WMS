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