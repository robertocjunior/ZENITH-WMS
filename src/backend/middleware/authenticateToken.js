// src/backend/middleware/authenticateToken.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = (req, res, next) => {
    const token = req.cookies.sessionToken;
    if (!token) {
        return res.status(401).json({ message: "Acesso negado. Nenhum token fornecido." });
    }

    jwt.verify(token, JWT_SECRET, (err, userSession) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ message: "Sessão expirada. Por favor, faça login novamente." });
            }
            return res.status(403).json({ message: "Token inválido." });
        }
        req.userSession = userSession;
        next();
    });
};

module.exports = { authenticateToken };