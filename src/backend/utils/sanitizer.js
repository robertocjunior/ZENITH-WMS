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