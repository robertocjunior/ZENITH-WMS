// src/backend/controllers/wms.controller.js
const sankhya = require('../services/sankhya.service');
const logger = require('../../../logger');
const { sanitizeNumber, sanitizeStringForSql, formatDbDateToApi } = require('../utils/sanitizer');

// Função auxiliar para checar a resposta da API de forma padronizada
const checkApiResponse = (data) => {
    if (!data || data.status !== '1') {
        // Se a API retornar um status de erro, lança uma exceção com a mensagem dela
        const errorMessage = data?.statusMessage || 'Falha na comunicação com a API Sankhya.';
        throw new Error(errorMessage);
    }
    if (!data.responseBody) {
        // Se a API retornar sucesso mas não o corpo esperado, lança uma exceção
        throw new Error('A resposta da API não contém o corpo de dados esperado (responseBody).');
    }
};

const getWarehouses = async (req, res, next) => {
    const { username, numreg } = req.userSession;
    try {
        const sql = `SELECT CODARM, CODARM || '-' || DESARM FROM AD_CADARM WHERE CODARM IN (SELECT CODARM FROM AD_PERMEND WHERE NUMREG = ${sanitizeNumber(numreg)}) ORDER BY CODARM`;
        const data = await sankhya.callAsSystem('DbExplorerSP.executeQuery', { sql });
        
        // VERIFICAÇÃO DE SEGURANÇA ADICIONADA
        checkApiResponse(data);

        // Se 'rows' não existir, retorna um array vazio para evitar erros no frontend
        res.json(data.responseBody.rows || []);
    } catch (error) {
        logger.error(`Erro em getWarehouses para ${username}: ${error.message}`);
        next(error);
    }
};

const getPermissions = async (req, res, next) => {
    const { username, codusu } = req.userSession;
    try {
        const sql = `SELECT BAIXA, TRANSF, PICK, CORRE, BXAPICK, CRIAPICK FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
        const data = await sankhya.callAsSystem('DbExplorerSP.executeQuery', { sql });
        
        checkApiResponse(data);

        if (!data.responseBody.rows?.length) {
            // Se o usuário não tiver permissões cadastradas, retorna tudo como falso
            return res.json({ baixa: false, transfer: false, pick: false, corre: false, bxaPick: false, criaPick: false });
        }
        const perms = data.responseBody.rows[0];
        res.json({
            baixa: perms[0] === 'S',
            transfer: perms[1] === 'S',
            pick: perms[2] === 'S',
            corre: perms[3] === 'S',
            bxaPick: perms[4] === 'S',
            criaPick: perms[5] === 'S',
        });
    } catch (error) {
        logger.error(`Erro em getPermissions para ${username}: ${error.message}`);
        next(error);
    }
};

const searchItems = async (req, res, next) => {
    const { codArm, filtro } = req.body;
    const { username } = req.userSession;
    try {
        let sql = `SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA, (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = ENDE.CODPROD AND V.CODVOL = ENDE.CODVOL) AS DERIVACAO FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${sanitizeNumber(codArm)}`;
        let orderBy = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';

        if (filtro) {
            const filtroLimpo = filtro.trim();
            if (/^\d+$/.test(filtroLimpo)) {
                const filtroNum = sanitizeNumber(filtroLimpo);
                sql += ` AND (ENDE.SEQEND LIKE '${sanitizeStringForSql(filtroLimpo)}%' OR ENDE.CODPROD = ${filtroNum} OR ENDE.CODPROD = (SELECT CODPROD FROM AD_CADEND WHERE SEQEND = ${filtroNum} AND CODARM = ${sanitizeNumber(codArm)} AND ROWNUM = 1))`;
                orderBy = ` ORDER BY CASE WHEN ENDE.SEQEND = ${filtroNum} THEN 0 ELSE 1 END, ENDE.ENDPIC DESC, ENDE.DATVAL ASC`;
            } else {
                const removerAcentos = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const palavrasChave = removerAcentos(filtroLimpo).split(' ').filter(p => p.length > 0);
                const condicoes = palavrasChave.map(palavra => {
                    const palavraUpper = sanitizeStringForSql(palavra.toUpperCase());
                    return `(TRANSLATE(UPPER(PRO.DESCRPROD), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') LIKE '%${palavraUpper}%' OR TRANSLATE(UPPER(PRO.MARCA), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') LIKE '%${palavraUpper}%')`;
                });
                if (condicoes.length > 0) sql += ` AND ${condicoes.join(' AND ')}`;
            }
        }
        
        const data = await sankhya.callAsSystem('DbExplorerSP.executeQuery', { sql: sql + orderBy });
        
        checkApiResponse(data);

        res.json(data.responseBody.rows || []);
    } catch (error) {
        logger.error(`Erro em searchItems para ${username}: ${error.message}`);
        next(error);
    }
};

const getItemDetails = async (req, res, next) => {
    const { codArm, sequencia } = req.body;
    const { username } = req.userSession;
    try {
        const sql = `SELECT ENDE.CODARM, ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA, (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = ENDE.CODPROD AND V.CODVOL = ENDE.CODVOL) AS DERIVACAO FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${sanitizeNumber(codArm)} AND ENDE.SEQEND = ${sanitizeNumber(sequencia)}`;
        const data = await sankhya.callAsSystem('DbExplorerSP.executeQuery', { sql });
        
        checkApiResponse(data);

        if (!data.responseBody.rows?.length) {
            throw new Error('Produto não encontrado ou detalhes indisponíveis.');
        }
        res.json(data.responseBody.rows[0]);
    } catch (error) {
        logger.error(`Erro em getItemDetails para ${username}: ${error.message}`);
        next(error);
    }
};

const getPickingLocations = async (req, res, next) => {
    const { codarm, codprod, sequencia } = req.body;
    const { username } = req.userSession;
    try {
        const sql = `SELECT ENDE.SEQEND, PRO.DESCRPROD FROM AD_CADEND ENDE JOIN TGFPRO PRO ON ENDE.CODPROD = PRO.CODPROD WHERE ENDE.CODARM = ${sanitizeNumber(codarm)} AND ENDE.CODPROD = ${sanitizeNumber(codprod)} AND ENDE.ENDPIC = 'S' AND ENDE.SEQEND <> ${sanitizeNumber(sequencia)} ORDER BY ENDE.SEQEND`;
        const data = await sankhya.callAsSystem('DbExplorerSP.executeQuery', { sql });

        checkApiResponse(data);

        res.json(data.responseBody.rows || []);
    } catch (error) {
        logger.error(`Erro em getPickingLocations para ${username}: ${error.message}`);
        next(error);
    }
};

const getHistory = async (req, res, next) => {
    const { username, codusu } = req.userSession;
    try {
        const hoje = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const sql = `
            SELECT 'MOV' AS TIPO, BXA.DATGER, TO_CHAR(BXA.DATGER, 'HH24:MI:SS') AS HORA, IBX.CODARM, IBX.SEQEND, IBX.ARMDES, IBX.ENDDES, IBX.CODPROD, PRO.DESCRPROD, PRO.MARCA, (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = IBX.CODPROD AND V.CODVOL = PRO.CODVOL) AS DERIVACAO, NULL AS QUANT_ANT, NULL AS QTD_ATUAL, BXA.SEQBAI AS ID_OPERACAO, IBX.SEQITE
            FROM AD_BXAEND BXA JOIN AD_IBXEND IBX ON IBX.SEQBAI = BXA.SEQBAI LEFT JOIN TGFPRO PRO ON IBX.CODPROD = PRO.CODPROD
            WHERE BXA.USUGER = ${codusu} AND TRUNC(BXA.DATGER) = TO_DATE('${hoje}', 'DD/MM/YYYY')
            UNION ALL
            SELECT 'CORRECAO' AS TIPO, H.DTHOPER, TO_CHAR(H.DTHOPER, 'HH24:MI:SS') AS HORA, H.CODARM, H.SEQEND, NULL, NULL, H.CODPROD, (SELECT P.DESCRPROD FROM TGFPRO P WHERE P.CODPROD = H.CODPROD), H.MARCA, H.DERIV, H.QUANT, H.QATUAL, H.NUMUNICO, NULL
            FROM AD_HISTENDAPP H
            WHERE H.CODUSU = ${codusu} AND TRUNC(H.DTHOPER) = TO_DATE('${hoje}', 'DD/MM/YYYY')
            ORDER BY 2 DESC, 15 ASC`;
        const data = await sankhya.callAsSystem('DbExplorerSP.executeQuery', { sql });
        
        checkApiResponse(data);

        res.json(data.responseBody.rows || []);
    } catch (error) {
        logger.error(`Erro em getHistory para ${username}: ${error.message}`);
        next(error);
    }
};

// A função executeTransaction é muito complexa para ser incluída aqui sem o código original completo.
// Se precisar, posso ajudá-lo a refatorá-la também, mas ela precisaria de tratamento de erro similar
// em cada chamada à API sankhya.
const executeTransaction = async (req, res, next) => {
    const { type, payload } = req.body;
    const { username } = req.userSession;
    // O ideal é adicionar a validação "checkApiResponse" após cada chamada a `sankhya.call`
    // dentro da lógica original desta função.
    logger.info(`A função executeTransaction ainda precisa da refatoração de tratamento de erros internos.`);
    res.status(501).json({ message: 'Funcionalidade de transação ainda não totalmente implementada com o novo tratamento de erros.'});
};

module.exports = {
    getWarehouses,
    getPermissions,
    searchItems,
    getItemDetails,
    getPickingLocations,
    getHistory,
    executeTransaction
};