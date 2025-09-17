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

// src/backend/utils/sanitizer.js

const sanitizeStringForSql = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/'/g, "''");
};

const sanitizeNumber = (num) => {
    const parsed = parseInt(num, 10);
    if (isNaN(parsed)) {
        throw new Error(`Parâmetro numérico inválido: ${num}`);
    }
    return parsed;
};

const formatDbDateToApi = (dbDate) => {
    if (!dbDate || typeof dbDate !== 'string') return null;
    const datePart = dbDate.split(' ')[0];
    if (datePart.length !== 8) return datePart;
    const day = datePart.substring(0, 2);
    const month = datePart.substring(2, 4);
    const year = datePart.substring(4, 8);
    return `${day}/${month}/${year}`;
};

module.exports = {
    sanitizeStringForSql,
    sanitizeNumber,
    formatDbDateToApi,
};