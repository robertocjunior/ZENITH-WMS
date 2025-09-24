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

// src/backend/controllers/wms.controller.js
const { callSankhyaService, callSankhyaAsSystem } = require('../services/sankhya.service');
const logger = require('../../../logger');
const { sanitizeNumber, sanitizeStringForSql, formatDbDateToApi } = require('../utils/sanitizer');

const checkApiResponse = (data) => {
    if (!data || data.status !== '1') {
        const errorMessage = data?.statusMessage || 'Falha na comunicação com a API Sankhya.';
        throw new Error(errorMessage);
    }
};

const getWarehouses = async (req, res, next) => {
    const { username, numreg } = req.userSession;
    logger.http(`Usuário ${username} (NUMREG: ${numreg}) solicitou a lista de armazéns.`);
    try {
        const sql = `SELECT CODARM, CODARM || '-' || DESARM FROM AD_CADARM WHERE CODARM IN (SELECT CODARM FROM AD_PERMEND WHERE NUMREG = ${sanitizeNumber(numreg)}) ORDER BY CODARM`;
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        checkApiResponse(data);
        if (!data.responseBody) throw new Error('A resposta da API não contém o corpo de dados esperado (responseBody).');
        res.json(data.responseBody.rows || []);
    } catch (error) {
        logger.error(`Erro em getWarehouses para ${username}: ${error.message}`);
        next(error);
    }
};

const getPermissions = async (req, res, next) => {
    const { username, codusu } = req.userSession;
    logger.http(`Verificando permissões para o usuário ${username} (CODUSU: ${codusu}).`);
    try {
        const sql = `SELECT BAIXA, TRANSF, PICK, CORRE, BXAPICK, CRIAPICK FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        checkApiResponse(data);
        if (!data.responseBody?.rows?.length) {
            logger.warn(`Nenhuma permissão encontrada para o usuário ${username}. Retornando acesso negado.`);
            return res.json({ baixa: false, transfer: false, pick: false, corre: false, bxaPick: false, criaPick: false });
        }
        const perms = data.responseBody.rows[0];
        const permissions = {
            baixa: perms[0] === 'S', transfer: perms[1] === 'S', pick: perms[2] === 'S',
            corre: perms[3] === 'S', bxaPick: perms[4] === 'S', criaPick: perms[5] === 'S',
        };
        logger.info(`Permissões para ${username}: Baixa=${permissions.baixa}, Transfer=${permissions.transfer}, Pick=${permissions.pick}, Corre=${permissions.corre}, BxaPick=${permissions.bxaPick}, CriaPick=${permissions.criaPick}.`);
        res.json(permissions);
    } catch (error) {
        logger.error(`Erro em getPermissions para ${username}: ${error.message}`);
        next(error);
    }
};

const searchItems = async (req, res, next) => {
    const { codArm, filtro } = req.body;
    const { username } = req.userSession;
    logger.http(`Usuário ${username} buscou por '${filtro || 'todos'}' no armazém ${codArm}.`);
    try {
        // Usamos uma CTE (WITH clause) para primeiro calcular a DERIVACAO
        // e depois poder filtrar por ela no WHERE da consulta principal.
        let sql = `
            WITH ITENS_COM_DERIVACAO AS (
                SELECT
                    ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD,
                    PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC,
                    TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA,
                    (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = ENDE.CODPROD AND V.CODVOL = ENDE.CODVOL) AS DERIVACAO,
                    ENDE.CODARM
                FROM AD_CADEND ENDE
                JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD
            )
            SELECT * FROM ITENS_COM_DERIVACAO
            WHERE CODARM = ${sanitizeNumber(codArm)}
        `;

        let orderBy = ' ORDER BY ENDPIC DESC, DATVAL ASC';

        if (filtro) {
            const filtroLimpo = filtro.trim();
            if (/^\d+$/.test(filtroLimpo)) {
                const filtroNum = sanitizeNumber(filtroLimpo);
                sql += ` AND (SEQEND LIKE '${sanitizeStringForSql(filtroLimpo)}%' OR CODPROD = ${filtroNum} OR CODPROD = (SELECT CODPROD FROM AD_CADEND WHERE SEQEND = ${filtroNum} AND CODARM = ${sanitizeNumber(codArm)} AND ROWNUM = 1))`;
                orderBy = ` ORDER BY CASE WHEN SEQEND = ${filtroNum} THEN 0 ELSE 1 END, ENDPIC DESC, DATVAL ASC`;
            } else {
                const removerAcentos = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const palavrasChave = removerAcentos(filtroLimpo).split(' ').filter(p => p.length > 0);
                const condicoes = palavrasChave.map(palavra => {
                    const palavraUpper = sanitizeStringForSql(palavra.toUpperCase());
                    // Adicionamos a verificação no campo DERIVACAO
                    return `(
                        TRANSLATE(UPPER(DESCRPROD), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') LIKE '%${palavraUpper}%' OR
                        TRANSLATE(UPPER(MARCA), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') LIKE '%${palavraUpper}%' OR
                        TRANSLATE(UPPER(DERIVACAO), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') LIKE '%${palavraUpper}%'
                    )`;
                });
                if (condicoes.length > 0) sql += ` AND ${condicoes.join(' AND ')}`;
            }
        }

        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: sql + orderBy });
        checkApiResponse(data);
        if (!data.responseBody) throw new Error('A resposta da API não contém o corpo de dados esperado (responseBody).');
        res.json(data.responseBody.rows || []);
    } catch (error) {
        logger.error(`Erro em searchItems para ${username}: ${error.message}`);
        next(error);
    }
};

const getItemDetails = async (req, res, next) => {
    const { codArm, sequencia } = req.body;
    const { username } = req.userSession;
    logger.http(`Usuário ${username} solicitou detalhes da sequência ${sequencia} no armazém ${codArm}.`);
    try {
        const sql = `SELECT ENDE.CODARM, ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA, (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = ENDE.CODPROD AND V.CODVOL = ENDE.CODVOL) AS DERIVACAO FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${sanitizeNumber(codArm)} AND ENDE.SEQEND = ${sanitizeNumber(sequencia)}`;
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        checkApiResponse(data);
        if (!data.responseBody?.rows?.length) {
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
    logger.http(`Usuário ${username} solicitou locais de picking para o produto ${codprod}.`);
    try {
        const sql = `SELECT ENDE.SEQEND, PRO.DESCRPROD FROM AD_CADEND ENDE JOIN TGFPRO PRO ON ENDE.CODPROD = PRO.CODPROD WHERE ENDE.CODARM = ${sanitizeNumber(codarm)} AND ENDE.CODPROD = ${sanitizeNumber(codprod)} AND ENDE.ENDPIC = 'S' AND ENDE.SEQEND <> ${sanitizeNumber(sequencia)} ORDER BY ENDE.SEQEND`;
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        checkApiResponse(data);
        if (!data.responseBody) throw new Error('A resposta da API não contém o corpo de dados esperado (responseBody).');
        res.json(data.responseBody.rows || []);
    } catch (error) {
        logger.error(`Erro em getPickingLocations para ${username}: ${error.message}`);
        next(error);
    }
};

const getHistory = async (req, res, next) => {
    const { username, codusu } = req.userSession;
    logger.http(`Usuário ${username} solicitou seu histórico de hoje.`);
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
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        checkApiResponse(data);
        if (!data.responseBody) throw new Error('A resposta da API não contém o corpo de dados esperado (responseBody).');
        res.json(data.responseBody.rows || []);
    } catch (error) {
        logger.error(`Erro em getHistory para ${username}: ${error.message}`);
        next(error);
    }
};

const executeTransaction = async (req, res, next) => {
    const { type, payload } = req.body;
    const { username, codusu } = req.userSession;
    logger.http(`Usuário ${username} (CODUSU: ${codusu}) iniciou uma transação do tipo: ${type}.`);
    
    // Função para formatar a quantidade para o padrão da API
    const formatQuantityForSankhya = (quantity) => {
        // Converte para string e substitui vírgula por ponto para normalizar a entrada
        const normalizedString = String(quantity).replace(',', '.');
        const number = parseFloat(normalizedString);

        if (isNaN(number)) {
            // Se a entrada não for um número válido, retorna um padrão seguro com ponto
            return '0.000';
        }
        
        // ALTERADO: Retorna o número como string com 3 casas decimais e PONTO como separador
        return number.toFixed(3);
    };

    try {
        const permCheckSql = `SELECT BAIXA, TRANSF, PICK, CORRE, BXAPICK, CRIAPICK FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
        const permData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: permCheckSql });
        checkApiResponse(permData);
        if (!permData.responseBody.rows.length) {
            throw new Error('Você não tem permissão para esta ação.');
        }
        const perms = permData.responseBody.rows[0];
        const hasPermission =
            (type === 'baixa' && perms[0] === 'S') ||
            (type === 'transferencia' && perms[1] === 'S') ||
            (type === 'picking' && perms[2] === 'S') ||
            (type === 'correcao' && perms[3] === 'S');

        if (!hasPermission) {
            logger.warn(`Tentativa de execução de '${type}' bloqueada por falta de permissão para ${username}.`);
            return res.status(403).json({ message: 'Você não tem permissão para executar esta ação.' });
        }

        if (type === 'correcao') {
            const { codarm, sequencia, newQuantity } = payload;
            const itemSql = `SELECT DEND.CODPROD, DEND.CODVOL, DEND.DATENT, DEND.DATVAL, DEND.QTDPRO, PRO.MARCA, (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = DEND.CODPROD AND V.CODVOL = DEND.CODVOL) AS DERIVACAO FROM AD_CADEND DEND JOIN TGFPRO PRO ON DEND.CODPROD = PRO.CODPROD WHERE DEND.CODARM = ${sanitizeNumber(codarm)} AND DEND.SEQEND = ${sanitizeNumber(sequencia)}`;
            const itemData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: itemSql });
            checkApiResponse(itemData);
            if (!itemData.responseBody.rows.length) throw new Error('Item não encontrado para correção.');
            
            const [codprod, codvol, datent, datval, qtdAnterior, marca, derivacao] = itemData.responseBody.rows[0];
            const scriptRequestBody = { runScript: { actionID: "97", refreshType: "SEL", params: { param: [ { type: "S", paramName: "CODPROD", $: codprod }, { type: "S", paramName: "CODVOL", $: codvol || '' }, { type: "F", paramName: "QTDPRO", $: newQuantity }, { type: "D", paramName: "DATENT", $: formatDbDateToApi(datent) }, { type: "D", paramName: "DATVAL", $: formatDbDateToApi(datval) } ] }, rows: { row: [{ field: [ { fieldName: "CODARM", $: codarm.toString() }, { fieldName: "SEQEND", $: sequencia.toString() } ] }] } }, clientEventList: { clientEvent: [{ "$": "br.com.sankhya.actionbutton.clientconfirm" }] } };
            
            const result = await callSankhyaService('ActionButtonsSP.executeScript', scriptRequestBody);
            
            const histRecord = { entityName: 'AD_HISTENDAPP', fields: ['CODARM', 'SEQEND', 'CODPROD', 'CODVOL', 'MARCA', 'DERIV', 'QUANT', 'QATUAL', 'CODUSU'], records: [{ values: { 0: codarm, 1: sequencia, 2: codprod, 3: codvol, 4: marca, 5: derivacao, 6: qtdAnterior, 7: newQuantity, 8: codusu }}]};
            
            await callSankhyaService('DatasetSP.save', histRecord);
            
            logger.info(`Histórico de correção salvo para SEQEND ${sequencia}.`);
            return res.json({ message: result.statusMessage || 'Correção executada com sucesso!' });
        }

        const hoje = new Date().toLocaleDateString('pt-BR');
        
        const cabecalhoData = await callSankhyaService('DatasetSP.save', {
            entityName: 'AD_BXAEND',
            fields: ['SEQBAI', 'DATGER', 'USUGER'],
            records: [{ values: { 1: hoje, 2: codusu.toString() } }],
        });

        checkApiResponse(cabecalhoData);
        if (!cabecalhoData.responseBody.result?.[0]?.[0]) {
            throw new Error(cabecalhoData.statusMessage || 'Falha ao criar cabeçalho da transação.');
        }
        const seqBai = cabecalhoData.responseBody.result[0][0];
        logger.info(`Cabeçalho da transação ${seqBai} criado para o usuário ${username} (USUGER: ${codusu}).`);

        let recordsToSave = [];
        if (type === 'baixa') {
            recordsToSave.push({
                entityName: 'AD_IBXEND',
                fields: ['SEQITE', 'SEQBAI', 'CODARM', 'SEQEND', 'QTDPRO', 'APP'],
                values: { 2: payload.codarm.toString(), 3: payload.sequencia.toString(), 4: formatQuantityForSankhya(payload.quantidade), 5: 'S' },
            });
        } else if (type === 'transferencia' || type === 'picking') {
            const { codarm, sequencia, codprod } = payload.origem;
            const { armazemDestino, enderecoDestino, quantidade, criarPick } = payload.destino;
            const checkSql = `SELECT CODPROD, QTDPRO FROM AD_CADEND WHERE SEQEND = '${sanitizeStringForSql(enderecoDestino)}' AND CODARM = ${sanitizeNumber(armazemDestino)}`;
            const checkData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: checkSql });
            checkApiResponse(checkData);

            const destinationItem = checkData.responseBody.rows.length > 0 ? checkData.responseBody.rows[0] : null;
            if (destinationItem && destinationItem[0] === codprod) {
                recordsToSave.push({
                    entityName: 'AD_IBXEND',
                    fields: ['SEQITE', 'SEQBAI', 'CODARM', 'SEQEND', 'QTDPRO', 'APP'],
                    values: { 2: armazemDestino.toString(), 3: enderecoDestino, 4: formatQuantityForSankhya(destinationItem[1]), 5: 'S' },
                });
            }
            recordsToSave.push({
                entityName: 'AD_IBXEND',
                fields: ['SEQITE', 'SEQBAI', 'CODARM', 'SEQEND', 'ARMDES', 'ENDDES', 'QTDPRO', 'APP'],
                values: { 2: codarm.toString(), 3: sequencia.toString(), 4: armazemDestino.toString(), 5: enderecoDestino, 6: formatQuantityForSankhya(quantidade), 7: 'S' },
            });

            if (type === 'transferencia' && criarPick === true && perms[5] === 'S') {
                const updateResult = await callSankhyaService('DatasetSP.save', {
                    entityName: 'CADEND', standAlone: false, fields: ['CODARM', 'SEQEND', 'ENDPIC'],
                    records: [{ pk: { CODARM: armazemDestino.toString(), SEQEND: enderecoDestino }, values: { '2': 'S' }}]
                });
                if (updateResult.status !== '1') logger.warn(`Falha ao definir ENDPIC='S' no destino: ${updateResult.statusMessage}`);
                else logger.info(`Destino ${enderecoDestino} no armazém ${armazemDestino} foi definido como um local de picking.`);
            }
        }

        for (const record of recordsToSave) {
            record.values['1'] = seqBai;
            const itemData = await callSankhyaService('DatasetSP.save', {
                entityName: record.entityName, fields: record.fields, standAlone: false, records: [{ values: record.values }],
            });
            checkApiResponse(itemData);
        }
        logger.info(`${recordsToSave.length} item(ns) salvos para a transação ${seqBai}.`);

        const pollSql = `SELECT COUNT(*) FROM AD_IBXEND WHERE SEQBAI = ${seqBai} AND CODPROD IS NOT NULL`;
        let isPopulated = false;
        for (let i = 0; i < 10; i++) {
            const pollData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: pollSql });
            if (pollData.status === '1' && pollData.responseBody && parseInt(pollData.responseBody.rows[0][0], 10) >= recordsToSave.length) {
                isPopulated = true; break;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!isPopulated) throw new Error('Timeout: O sistema não populou o CODPROD a tempo.');
        logger.info(`Polling de CODPROD bem-sucedido para a transação ${seqBai}.`);

        const stpData = await callSankhyaService('ActionButtonsSP.executeSTP', {
            stpCall: {
                actionID: '20', procName: 'NIC_STP_BAIXA_END', rootEntity: 'AD_BXAEND',
                rows: { row: [{ field: [{ fieldName: 'SEQBAI', $: seqBai }] }] },
            },
        });

        if (stpData.status !== '1' && stpData.status !== '2') {
            throw new Error(stpData.statusMessage || 'Falha ao executar a procedure de baixa.');
        }
        logger.info(`Transação ${type} (SEQBAI: ${seqBai}) finalizada com sucesso para o usuário ${username}.`);
        res.json({ message: stpData.statusMessage || 'Operação concluída com sucesso!' });

    } catch (error) {
        logger.error(`Erro em /execute-transaction para o usuário ${username}: ${error.message}`);
        // --- LÓGICA DE ERRO MODIFICADA ---
        // Se o erro for "Não autorizado", instrui o frontend a refazer o login.
        if (error.message && error.message.includes('Não autorizado')) {
            return res.status(401).json({
                message: "Sua sessão no sistema Sankhya expirou. Por favor, faça o login novamente para continuar.",
                reauthRequired: true // Um sinalizador para o frontend saber o que fazer
            });
        }
        // Para todos os outros erros, continua com o fluxo normal.
        next(error);
    }
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