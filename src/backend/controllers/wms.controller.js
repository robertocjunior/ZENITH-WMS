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

// --- Início: Configuração do Cache ---
const warehouseCache = {}; // Cache para armazéns por numreg
const permissionCache = {}; // Cache para permissões por codusu
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutos de cache

const isCacheValid = (cacheEntry) => {
    return cacheEntry && cacheEntry.expiresAt > Date.now();
};
// --- Fim: Configuração do Cache ---

const checkApiResponse = (data) => {
    if (!data || data.status !== '1') {
        const errorMessage = data?.statusMessage || 'Falha na comunicação com a API Sankhya.';
        // Guarda a resposta original no erro para o errorHandler usar
        const error = new Error(errorMessage);
        error.sankhyaResponse = data;
        throw error;
    }
};

const getWarehouses = async (req, res, next) => {
    const { username, numreg } = req.userSession;
    logger.http(`Usuário ${username} (NUMREG: ${numreg}) solicitou a lista de armazéns.`);

    // --- Início: Lógica de Cache ---
    if (isCacheValid(warehouseCache[numreg])) {
        logger.info(`Retornando armazéns do cache para NUMREG ${numreg}.`);
        return res.json(warehouseCache[numreg].data);
    }
    // --- Fim: Lógica de Cache ---

    try {
        const sql = `SELECT CODARM, CODARM || '-' || DESARM FROM AD_CADARM WHERE CODARM IN (SELECT CODARM FROM AD_PERMEND WHERE NUMREG = ${sanitizeNumber(numreg)}) ORDER BY CODARM`;
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        checkApiResponse(data);
        if (!data.responseBody) throw new Error('A resposta da API não contém o corpo de dados esperado (responseBody).');

        const warehouses = data.responseBody.rows || [];

        // --- Início: Salvar no Cache ---
        warehouseCache[numreg] = {
            data: warehouses,
            expiresAt: Date.now() + CACHE_DURATION_MS
        };
        logger.info(`Armazéns para NUMREG ${numreg} salvos no cache.`);
        // --- Fim: Salvar no Cache ---

        res.json(warehouses);
    } catch (error) {
        logger.error(`Erro em getWarehouses para ${username}: ${error.message}`);
        next(error); // Passa o erro para o errorHandler
    }
};

const getPermissions = async (req, res, next) => {
    const { username, codusu } = req.userSession;
    logger.http(`Verificando permissões para o usuário ${username} (CODUSU: ${codusu}).`);

    // --- Início: Lógica de Cache ---
    if (isCacheValid(permissionCache[codusu])) {
        logger.info(`Retornando permissões do cache para CODUSU ${codusu}.`);
        return res.json(permissionCache[codusu].data);
    }
    // --- Fim: Lógica de Cache ---

    try {
        const sql = `SELECT BAIXA, TRANSF, PICK, CORRE, BXAPICK, CRIAPICK FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql });
        checkApiResponse(data);

        let permissions;
        if (!data.responseBody?.rows?.length) {
            logger.warn(`Nenhuma permissão encontrada para o usuário ${username}. Definindo como negadas.`);
            permissions = { baixa: false, transfer: false, pick: false, corre: false, bxaPick: false, criaPick: false };
        } else {
            const perms = data.responseBody.rows[0];
            permissions = {
                baixa: perms[0] === 'S', transfer: perms[1] === 'S', pick: perms[2] === 'S',
                corre: perms[3] === 'S', bxaPick: perms[4] === 'S', criaPick: perms[5] === 'S',
            };
            logger.info(`Permissões consultadas para ${username}: Baixa=${permissions.baixa}, Transfer=${permissions.transfer}, Pick=${permissions.pick}, Corre=${permissions.corre}, BxaPick=${permissions.bxaPick}, CriaPick=${permissions.criaPick}.`);
        }

        // --- Início: Salvar no Cache ---
        permissionCache[codusu] = {
            data: permissions,
            expiresAt: Date.now() + CACHE_DURATION_MS
        };
        logger.info(`Permissões para CODUSU ${codusu} salvas no cache.`);
        // --- Fim: Salvar no Cache ---

        res.json(permissions);
    } catch (error) {
        logger.error(`Erro em getPermissions para ${username}: ${error.message}`);
        next(error); // Passa o erro para o errorHandler
    }
};


const searchItems = async (req, res, next) => {
    const { codArm, filtro } = req.body;
    const { username } = req.userSession;
    logger.http(`Usuário ${username} buscou por '${filtro || 'todos'}' no armazém ${codArm}.`);
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
                    return `(
                        TRANSLATE(UPPER(PRO.DESCRPROD), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') LIKE '%${palavraUpper}%' OR
                        TRANSLATE(UPPER(PRO.MARCA), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÇ', 'AAAAAEEEEIIIIOOOOOUUUUC') LIKE '%${palavraUpper}%'
                    )`;
                });
                if (condicoes.length > 0) sql += ` AND ${condicoes.join(' AND ')}`;
            }
        }

        const data = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: sql + orderBy });
        checkApiResponse(data);
        if (!data.responseBody) throw new Error('A resposta da API não contém o corpo de dados esperado (responseBody).');
        res.json(data.responseBody.rows || []);
    } catch (error){
        logger.error(`Erro em searchItems para ${username}: ${error.message}`);
        next(error);
    }
};

const getItemDetails = async (req, res, next) => {
    const { codArm, sequencia } = req.body;
    const { username } = req.userSession;
    logger.http(`Usuário ${username} solicitou detalhes da sequência ${sequencia} no armazém ${codArm}.`);
    try {
        const sql = `SELECT * FROM V_WMS_ITEM_DETALHES WHERE CODARM = ${sanitizeNumber(codArm)} AND SEQEND = ${sanitizeNumber(sequencia)}`;
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
    const { username, codusu } = req.userSession; // codusu aqui é do usuário LOGADO NO APP (ex: 219)
    logger.http(`Usuário ${username} (CODUSU: ${codusu}) iniciou uma transação do tipo: ${type}.`);

    const formatQuantityForSankhya = (quantity) => {
        const normalizedString = String(quantity).replace(',', '.');
        const number = parseFloat(normalizedString);
        return isNaN(number) ? '0.000' : number.toFixed(3);
    };

    try {
        // Verifica permissão (agora usa cache, se disponível)
        let permissions;
        if (isCacheValid(permissionCache[codusu])) { // Reutiliza cache se válido
             permissions = permissionCache[codusu].data;
        } else {
            // Consulta permissões se não houver cache válido
             const permCheckSql = `SELECT BAIXA, TRANSF, PICK, CORRE, BXAPICK, CRIAPICK FROM AD_APPPERM WHERE CODUSU = ${sanitizeNumber(codusu)}`;
             const permData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: permCheckSql });
             checkApiResponse(permData);
             if (!permData.responseBody.rows.length) {
                 permissions = { baixa: false, transfer: false, pick: false, corre: false, bxaPick: false, criaPick: false };
             } else {
                  const perms = permData.responseBody.rows[0];
                  permissions = {
                     baixa: perms[0] === 'S', transfer: perms[1] === 'S', pick: perms[2] === 'S',
                     corre: perms[3] === 'S', bxaPick: perms[4] === 'S', criaPick: perms[5] === 'S',
                 };
             }
             permissionCache[codusu] = { data: permissions, expiresAt: Date.now() + CACHE_DURATION_MS }; // Salva no cache
        }

        const hasPermission =
            (type === 'baixa' && permissions.baixa) ||
            (type === 'transferencia' && permissions.transfer) ||
            (type === 'picking' && permissions.pick) ||
            (type === 'correcao' && permissions.corre);

        if (!hasPermission) {
            logger.warn(`Tentativa de execução de '${type}' bloqueada por falta de permissão para ${username}.`);
            return res.status(403).json({ message: 'Você não tem permissão para executar esta ação.' });
        }


        if (type === 'correcao') {
            // Lógica de correção mantida como antes - não usa AD_IBXEND batch
             const { codarm, sequencia, newQuantity } = payload;
             const itemSql = `SELECT DEND.CODPROD, DEND.CODVOL, DEND.DATENT, DEND.DATVAL, DEND.QTDPRO, PRO.MARCA, (SELECT MAX(V.DESCRDANFE) FROM TGFVOA V WHERE V.CODPROD = DEND.CODPROD AND V.CODVOL = DEND.CODVOL) AS DERIVACAO FROM AD_CADEND DEND JOIN TGFPRO PRO ON DEND.CODPROD = PRO.CODPROD WHERE DEND.CODARM = ${sanitizeNumber(codarm)} AND DEND.SEQEND = ${sanitizeNumber(sequencia)}`;
             const itemData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: itemSql });
             checkApiResponse(itemData);
             if (!itemData.responseBody.rows.length) throw new Error('Item não encontrado para correção.');

             const [codprod, codvol, datent, datval, qtdAnterior, marca, derivacao] = itemData.responseBody.rows[0];
             const scriptRequestBody = { runScript: { actionID: "97", refreshType: "SEL", params: { param: [ { type: "S", paramName: "CODPROD", $: codprod }, { type: "S", paramName: "CODVOL", $: codvol || '' }, { type: "F", paramName: "QTDPRO", $: newQuantity }, { type: "D", paramName: "DATENT", $: formatDbDateToApi(datent) }, { type: "D", paramName: "DATVAL", $: formatDbDateToApi(datval) } ] }, rows: { row: [{ field: [ { fieldName: "CODARM", $: codarm.toString() }, { fieldName: "SEQEND", $: sequencia.toString() } ] }] } }, clientEventList: { clientEvent: [{ "$": "br.com.sankhya.actionbutton.clientconfirm" }] } };

             const result = await callSankhyaService('ActionButtonsSP.executeScript', scriptRequestBody);
             checkApiResponse(result); // Verifica se o script rodou com sucesso

             const histRecord = { entityName: 'AD_HISTENDAPP', fields: ['CODARM', 'SEQEND', 'CODPROD', 'CODVOL', 'MARCA', 'DERIV', 'QUANT', 'QATUAL', 'CODUSU'], records: [{ values: { 0: codarm, 1: sequencia, 2: codprod, 3: codvol, 4: marca, 5: derivacao, 6: qtdAnterior, 7: newQuantity, 8: codusu }}]};

             await callSankhyaService('DatasetSP.save', histRecord);

             logger.info(`Histórico de correção salvo para SEQEND ${sequencia}.`);
             return res.json({ message: result.statusMessage || 'Correção executada com sucesso!' });
        }

        // --- Lógica para Baixa, Transferência e Picking ---
        const hoje = new Date().toLocaleDateString('pt-BR');

        // 1. Cria o cabeçalho AD_BXAEND usando callSankhyaAsSystem
        const cabecalhoPayload = {
            entityName: 'AD_BXAEND',
            fields: ['DATGER', 'USUGER'],
            records: [{ values: { '0': hoje, '1': codusu.toString() } }], // Usa o codusu do usuário logado no app
        };

        // ****** LINHA ALTERADA ******
        // Tenta usar callSankhyaAsSystem em vez de callSankhyaService
        const cabecalhoData = await callSankhyaAsSystem('DatasetSP.save', cabecalhoPayload);
        // ***************************

        checkApiResponse(cabecalhoData);
        // A lógica para obter o seqBai pode variar dependendo da resposta de callSankhyaAsSystem
        // Ajuste conforme necessário. Supondo que a estrutura da resposta seja similar:
         if (!cabecalhoData.responseBody.result?.[0]?.[0] && !cabecalhoData.responseBody.pk?.SEQBAI) { // Verifica se pk.SEQBAI existe
             const errorMsg = cabecalhoData.statusMessage || 'Falha ao criar cabeçalho da transação. ID (SEQBAI) não retornado.';
             logger.error(errorMsg + ` Resposta: ${JSON.stringify(cabecalhoData)}`);
             throw new Error(errorMsg);
         }
         // Tenta pegar o SEQBAI da propriedade 'pk' se 'result' não estiver presente
         const seqBai = cabecalhoData.responseBody.result?.[0]?.[0] || cabecalhoData.responseBody.pk?.SEQBAI;

        logger.info(`Cabeçalho da transação ${seqBai} criado para o usuário ${username} (USUGER definido como ${codusu}).`);


        // --- Início: Preparação do Batch AD_IBXEND ---
        const batchRecords = []; // Array para guardar os 'values' de cada item
        // Ordem dos campos DEVE corresponder aos índices ('0', '1', ...) nos 'values' abaixo
        const itemFields = ['SEQBAI', 'CODARM', 'SEQEND', 'ARMDES', 'ENDDES', 'QTDPRO', 'APP'];

        if (type === 'baixa') {
             // Verifica permissão BXAPICK se a origem for área de picking
             if (payload.origem?.endpic === 'S' && !permissions.bxaPick) {
                  logger.warn(`Tentativa de baixa de picking (SEQEND: ${payload.sequencia}) bloqueada por falta de permissão BXAPICK para ${username}.`);
                  throw new Error('Você não tem permissão para baixar itens de uma área de picking.');
             }
            batchRecords.push({
                values: {
                    '0': seqBai.toString(),                     // SEQBAI
                    '1': payload.codarm.toString(),           // CODARM
                    '2': payload.sequencia.toString(),        // SEQEND
                    '3': null,                                // ARMDES (null para baixa)
                    '4': null,                                // ENDDES (null para baixa)
                    '5': formatQuantityForSankhya(payload.quantidade), // QTDPRO
                    '6': 'S'                                  // APP
                }
            });
        } else if (type === 'transferencia' || type === 'picking') {
            const { codarm, sequencia, codprod, endpic: origemEndpic } = payload.origem; // Pega endpic da origem
            const { armazemDestino, enderecoDestino, quantidade, criarPick } = payload.destino;

            // Verifica permissão BXAPICK se a origem for picking (mesmo para transferir/mover para picking)
             if (origemEndpic === 'S' && !permissions.bxaPick) {
                  logger.warn(`Tentativa de ${type} originada de picking (SEQEND: ${sequencia}) bloqueada por falta de permissão BXAPICK para ${username}.`);
                  throw new Error('Você não tem permissão para mover itens de uma área de picking.');
             }

            const canCreatePick = criarPick === true && permissions.criaPick;

            // Verifica se o destino já tem o mesmo produto (código original mantido)
            const checkSql = `SELECT CODPROD, QTDPRO FROM AD_CADEND WHERE SEQEND = '${sanitizeStringForSql(enderecoDestino)}' AND CODARM = ${sanitizeNumber(armazemDestino)}`;
            const checkData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: checkSql });
            checkApiResponse(checkData);
            const destinationItem = checkData.responseBody.rows.length > 0 ? checkData.responseBody.rows[0] : null;

            // Se o destino já tem o mesmo produto, adiciona um registro para ele também (lógica original mantida)
            if (destinationItem && destinationItem[0] === codprod) {
                batchRecords.push({
                    values: {
                        '0': seqBai.toString(),                     // SEQBAI
                        '1': armazemDestino.toString(),           // CODARM (do destino)
                        '2': enderecoDestino,                     // SEQEND (do destino)
                        '3': null,                                // ARMDES (null pois é linha de destino)
                        '4': null,                                // ENDDES (null pois é linha de destino)
                        '5': formatQuantityForSankhya(destinationItem[1]), // QTDPRO (qtd anterior no destino)
                        '6': 'S'                                  // APP
                    }
                });
            }

            // Registro principal da transferência/picking (origem -> destino)
            batchRecords.push({
                values: {
                    '0': seqBai.toString(),                     // SEQBAI
                    '1': codarm.toString(),                   // CODARM (origem)
                    '2': sequencia.toString(),                // SEQEND (origem)
                    '3': armazemDestino.toString(),           // ARMDES
                    '4': enderecoDestino,                     // ENDDES
                    '5': formatQuantityForSankhya(quantidade), // QTDPRO (a ser movida)
                    '6': 'S'                                  // APP
                }
            });

             // Atualiza o ENDPIC do destino se for transferência e o usuário tiver permissão
             if (type === 'transferencia' && canCreatePick) {
                 logger.info(`Tentando marcar o destino ${armazemDestino}-${enderecoDestino} como picking.`);
                 // Usar callSankhyaService pode ser mais apropriado aqui, dependendo das permissões para alterar CADEND
                 const updateResult = await callSankhyaService('DatasetSP.save', {
                     entityName: 'CADEND', standAlone: false, fields: ['CODARM', 'SEQEND', 'ENDPIC'],
                     records: [{ pk: { CODARM: armazemDestino.toString(), SEQEND: enderecoDestino }, values: { '2': 'S' }}]
                 });
                  if (updateResult.status !== '1') {
                     logger.warn(`Falha ao definir ENDPIC='S' no destino: ${updateResult.statusMessage}`);
                  } else {
                      logger.info(`Destino ${enderecoDestino} no armazém ${armazemDestino} foi definido como um local de picking.`);
                  }
             } else if (type === 'transferencia' && criarPick === true && !permissions.criaPick) {
                  logger.warn(`Usuário ${username} tentou marcar destino como picking sem permissão CRIAPICK. A flag ENDPIC não será alterada.`);
             }
        }
        // --- Fim: Preparação do Batch AD_IBXEND ---

        // 2. Salva todos os itens AD_IBXEND em uma única chamada (usando callSankhyaService, pois callSankhyaAsSystem pode ter restrições também)
        if (batchRecords.length > 0) {
            const batchSavePayload = {
                entityName: 'AD_IBXEND',
                fields: itemFields, // Usa a lista de campos definida
                standAlone: false,
                records: batchRecords // Passa o array de 'values'
            };
            logger.debug(`Enviando batch save para AD_IBXEND com ${batchRecords.length} registros para SEQBAI ${seqBai}.`);
            // É importante usar callSankhyaService aqui se callSankhyaAsSystem também falhar para AD_IBXEND
            const batchResult = await callSankhyaService('DatasetSP.save', batchSavePayload);
            checkApiResponse(batchResult);
            logger.info(`${batchRecords.length} item(ns) AD_IBXEND salvos via batch para a transação ${seqBai}.`);
        } else {
             logger.warn(`Nenhum registro AD_IBXEND para salvar na transação ${seqBai}.`);
             // Considerar se deve prosseguir ou retornar erro aqui.
             // Por ora, vamos permitir prosseguir para que a STP rode, caso necessário.
        }


        // 3. Polling para esperar a trigger popular CODPROD (mantido)
        const pollSql = `SELECT COUNT(*) FROM AD_IBXEND WHERE SEQBAI = ${seqBai} AND CODPROD IS NOT NULL`;
        let isPopulated = false;
        const expectedCount = batchRecords.length; // Espera que todos os registros do batch sejam populados
        for (let i = 0; i < 10; i++) { // Tenta por 5 segundos
            const pollData = await callSankhyaAsSystem('DbExplorerSP.executeQuery', { sql: pollSql });
            // Verifica se status é 1 E se tem responseBody E se a contagem é suficiente
            if (pollData.status === '1' && pollData.responseBody?.rows?.[0]?.[0] !== undefined && parseInt(pollData.responseBody.rows[0][0], 10) >= expectedCount) {
                isPopulated = true; break;
            }
            logger.debug(`Polling AD_IBXEND para SEQBAI ${seqBai}: Encontrado ${pollData.responseBody?.rows?.[0]?.[0] ?? 'erro/vazio'} / Esperado >= ${expectedCount}`);
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!isPopulated) {
             logger.error(`Timeout no polling para SEQBAI ${seqBai}. Trigger TRG_AD_IBXEND_SET_CODPROD pode não ter populado CODPROD a tempo.`);
             throw new Error('Timeout: O sistema não populou os dados da transação a tempo.');
        }
        logger.info(`Polling de CODPROD bem-sucedido para a transação ${seqBai}.`);

        // 4. Executa a procedure de baixa/transferência (mantido, usando callSankhyaService)
        const stpData = await callSankhyaService('ActionButtonsSP.executeSTP', {
            stpCall: {
                actionID: '20', procName: 'NIC_STP_BAIXA_END', rootEntity: 'AD_BXAEND',
                rows: { row: [{ field: [{ fieldName: 'SEQBAI', $: seqBai }] }] },
            },
        });

        // Verifica o status da procedure
        if (stpData.status !== '1' && stpData.status !== '2') { // Status 1 ou 2 são sucesso
             const stpError = new Error(stpData.statusMessage || 'Falha ao executar a procedure de baixa/transferência.');
             stpError.sankhyaResponse = stpData; // Anexa a resposta para o errorHandler
             throw stpError;
        }

        logger.info(`Transação ${type} (SEQBAI: ${seqBai}) finalizada com sucesso para o usuário ${username}.`);
        res.json({ message: stpData.statusMessage || 'Operação concluída com sucesso!' });

    } catch (error) {
        // Passa o erro para o errorHandler centralizado
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