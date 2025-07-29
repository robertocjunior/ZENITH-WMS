let currentItemDetails = null;

/**
 * Remove acentos de uma string.
 * @param {string} texto A string para processar.
 * @returns {string} A string sem acentos.
 */
function removerAcentos(texto) {
    if (!texto) return '';
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseSankhyaError(rawMessage) {
    if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.includes('<')) {
        return rawMessage || 'Ocorreu um erro desconhecido.';
    }
    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawMessage;
        const textContent = tempDiv.textContent || tempDiv.innerText;
        const motivoMatch = textContent.match(/Motivo:\s*([\s\S]+?)(?=Solução:|Informações para o Implantador|$)/);
        const solucaoMatch = textContent.match(/Solução:\s*([\s\S]+?)(?=Informações para o Implantador|$)/);
        const motivo = motivoMatch ? motivoMatch[1].trim() : '';
        const solucao = solucaoMatch ? solucaoMatch[1].trim() : '';
        if (motivo || solucao) {
            let formattedMessage = '';
            if (motivo) formattedMessage += `<p style="margin-bottom:10px;"><strong>Motivo:</strong> ${motivo}</p>`;
            if (solucao) formattedMessage += `<p><strong>Solução:</strong> ${solucao}</p>`;
            return formattedMessage;
        }
        const cleanedText = textContent.replace(/ORA-\d+.*|Regra Personalizada:/g, '').trim();
        return cleanedText || "Ocorreu um erro na operação.";
    } catch (e) {
        return rawMessage.replace(/<[^>]*>/g, ' ');
    }
}

// --- Funções dos Modais e UI ---
function openConfirmModal(message, title = 'Aviso') {
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-message').innerHTML = message;
    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirmModal() { document.getElementById('confirm-modal').classList.add('hidden'); }
function openBaixaModal() {
    if (!currentItemDetails) return openConfirmModal("Erro: Nenhum item selecionado.");
    const maxQtd = currentItemDetails.quantidade;
    const qtdInput = document.getElementById('modal-qtd-baixa');
    qtdInput.value = '';
    qtdInput.max = maxQtd;
    document.getElementById('modal-qtd-disponivel').textContent = currentItemDetails.qtdCompleta;
    document.getElementById('baixa-modal').classList.remove('hidden');
}
function closeBaixaModal() { document.getElementById('baixa-modal').classList.add('hidden'); }
function openTransferModal() {
    if (!currentItemDetails) return openConfirmModal("Erro: Nenhum item selecionado.");
    const maxQtd = currentItemDetails.quantidade;
    const qtdInput = document.getElementById('modal-qtd-transfer');
    qtdInput.value = '';
    qtdInput.max = maxQtd;
    document.getElementById('modal-qtd-disponivel-transfer').textContent = currentItemDetails.qtdCompleta;
    document.getElementById('modal-enddes-transfer').value = '';
    document.getElementById('transfer-modal').classList.remove('hidden');
}
function closeTransferModal() { document.getElementById('transfer-modal').classList.add('hidden'); }

// Funções para o Modal de Picking
async function openPickingModal() {
    if (!currentItemDetails) return openConfirmModal("Erro: Nenhum item selecionado.");

    const selectPicking = document.getElementById('modal-seqend-picking');
    selectPicking.innerHTML = '<option value="">Buscando locais...</option>';
    selectPicking.disabled = true;

    document.getElementById('modal-qtd-disponivel-picking').textContent = currentItemDetails.qtdCompleta;
    document.getElementById('modal-qtd-picking').value = '';
    document.getElementById('modal-qtd-picking').max = currentItemDetails.quantidade;
    document.getElementById('picking-modal').classList.remove('hidden');

    const success = await performSankhyaOperation(async (bearerToken) => {
        const { codarm, codprod, sequencia } = currentItemDetails;
        const sql = `SELECT ENDE.SEQEND, PRO.DESCRPROD FROM AD_CADEND ENDE JOIN TGFPRO PRO ON ENDE.CODPROD = PRO.CODPROD WHERE ENDE.CODARM = ${codarm} AND ENDE.CODPROD = ${codprod} AND ENDE.ENDPIC = 'S' AND ENDE.SEQEND <> ${sequencia} ORDER BY ENDE.SEQEND`;
        const apiRequestBody = { serviceName: "DbExplorerSP.executeQuery", requestBody: { sql } };

        const response = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...apiRequestBody })
        });
        const data = await response.json();
        if (data.status !== '1') throw new Error("Não foi possível carregar os locais de picking.");

        const locations = data.responseBody.rows;
        selectPicking.innerHTML = '';

        if (locations.length === 0) {
            selectPicking.innerHTML = '<option value="">Nenhum local de picking encontrado</option>';
            return;
        }

        selectPicking.innerHTML = '<option value="">Selecione um destino</option>';
        locations.forEach(location => {
            const [seqEnd, descrProd] = location;
            const option = document.createElement('option');
            option.value = seqEnd;
            option.textContent = `${seqEnd} - ${descrProd}`;
            selectPicking.appendChild(option);
        });
        selectPicking.disabled = false;
    });

    if (!success) {
        closePickingModal();
    }
}
function closePickingModal() { document.getElementById('picking-modal').classList.add('hidden'); }

const loading = document.getElementById('loading');
const emptyState = document.getElementById('empty-state');
function showLoading(show) { loading.classList.toggle('hidden', !show); }
function showMainPage() {
    document.getElementById('main-page').classList.add('active');
    document.getElementById('details-page').classList.remove('active');
}
function showDetailsPage() {
    document.getElementById('main-page').classList.remove('active');
    document.getElementById('details-page').classList.add('active');
}

// --- LÓGICA DE API CENTRALIZADA ---
async function performSankhyaOperation(operation) {
    let bearerToken = null;
    showLoading(true);
    try {
        const loginResponse = await fetch(`${PROXY_URL}/login`, { method: 'POST' });
        if (!loginResponse.ok) throw new Error('Falha na autenticação.');
        const loginData = await loginResponse.json();
        bearerToken = loginData.bearerToken;
        if (!bearerToken) throw new Error('Não foi possível obter o Bearer Token.');
        await operation(bearerToken);
    } catch (error) {
        const friendlyMessage = parseSankhyaError(error.message);
        openConfirmModal(friendlyMessage, 'Falha na Operação');
        return false;
    } finally {
        if (bearerToken) {
            await fetch(`${PROXY_URL}/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bearerToken })
            });
            console.log("Sessão encerrada.");
        }
        showLoading(false);
    }
    return true;
}

// --- FUNÇÕES PRINCIPAIS ---

async function fetchAndPopulateWarehouses() {
    const success = await performSankhyaOperation(async (bearerToken) => {
        const sql = "SELECT CODARM, CODARM || '-' || DESARM FROM AD_CADARM ORDER BY CODARM";
        const apiRequestBody = { serviceName: "DbExplorerSP.executeQuery", requestBody: { sql } };
        const response = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...apiRequestBody })
        });
        const data = await response.json();
        if (data.status !== '1') throw new Error("Não foi possível carregar a lista de armazéns.");
        
        const armazens = data.responseBody.rows;
        const selectPrincipal = document.getElementById('armazem-select');
        const selectModal = document.getElementById('modal-armdes-transfer');
        
        selectPrincipal.innerHTML = '<option value="">Selecione um Armazém</option>';
        selectModal.innerHTML = '';

        armazens.forEach(armazem => {
            const [codArm, descArm] = armazem;
            const option = document.createElement('option');
            option.value = codArm;
            option.textContent = descArm;
            selectPrincipal.appendChild(option);
            selectModal.appendChild(option.cloneNode(true));
        });
    });

    if (!success) {
        document.getElementById('armazem-select').innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

async function handleConsulta() {
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = '';
    emptyState.classList.add('hidden');

    const codArm = document.getElementById('armazem-select').value;
    if (!codArm) {
        openConfirmModal("Por favor, selecione um armazém para iniciar a busca.");
        return;
    }

    await performSankhyaOperation(async (bearerToken) => {
        const filtroInput = document.getElementById('filtro-sequencia').value.trim();
        let sqlFinal = `SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm}`;
        let orderByClause = '';

        if (filtroInput) {
            if (/^\d+$/.test(filtroInput)) {
                sqlFinal += `
                    AND (
                        ENDE.SEQEND LIKE '${filtroInput}%' 
                        OR ENDE.CODPROD = ${filtroInput}
                        OR ENDE.CODPROD = (SELECT CODPROD FROM AD_CADEND WHERE SEQEND = ${filtroInput} AND CODARM = ${codArm} AND ROWNUM = 1)
                    )
                `;
                
                orderByClause = `
                    ORDER BY
                        CASE WHEN ENDE.SEQEND = ${filtroInput} THEN 0 ELSE 1 END,
                        ENDE.ENDPIC DESC,
                        ENDE.DATVAL ASC
                `;

            } else {
                const palavrasChave = removerAcentos(filtroInput).split(' ').filter(p => p.length > 0);
                const condicoes = palavrasChave.map(palavra => {
                    const palavraUpper = palavra.toUpperCase();
                    const cleanDescrprod = "TRANSLATE(UPPER(PRO.DESCRPROD), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')";
                    const cleanMarca = "TRANSLATE(UPPER(PRO.MARCA), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')";
                    return `(${cleanDescrprod} LIKE '%${palavraUpper}%' OR ${cleanMarca} LIKE '%${palavraUpper}%')`;
                });

                if (condicoes.length > 0) {
                    sqlFinal += ` AND ${condicoes.join(' AND ')}`;
                }
                orderByClause = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';
            }
        } else {
            orderByClause = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';
        }
        
        sqlFinal += orderByClause;
        
        const apiRequestBody = { serviceName: "DbExplorerSP.executeQuery", requestBody: { "sql": sqlFinal } };
        const queryResponse = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...apiRequestBody })
        });
        if (!queryResponse.ok) throw new Error(`Falha na consulta: ${queryResponse.statusText}`);
        const queryData = await queryResponse.json();
        if (queryData.status !== "1") throw new Error(queryData.statusMessage);
        renderizarCards(queryData.responseBody.rows);
    });
}


async function fetchAndShowDetails(sequencia) {
    const codArm = document.getElementById('armazem-select').value;
    const success = await performSankhyaOperation(async (bearerToken) => {
        const sql = `SELECT ENDE.CODARM, ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm} AND ENDE.SEQEND = ${sequencia}`;
        const apiRequestBody = { serviceName: "DbExplorerSP.executeQuery", requestBody: { "sql": sql } };
        const queryResponse = await fetch(`${PROXY_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bearerToken, ...apiRequestBody })
        });
        if (!queryResponse.ok) throw new Error('Falha na consulta de detalhes.');
        const queryData = await queryResponse.json();
        if (queryData.status === "1" && queryData.responseBody.rows.length > 0) {
            populateDetails(queryData.responseBody.rows[0]);
            showDetailsPage();
        } else {
            throw new Error('Produto não encontrado ou erro na consulta.');
        }
    });
    if (!success) showMainPage();
}

async function handleBaixa() {
    const qtdBaixarInput = document.getElementById('modal-qtd-baixa');
    const qtdBaixar = parseInt(qtdBaixarInput.value, 10);
    const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
    if (isNaN(qtdBaixar) || qtdBaixar <= 0 || qtdBaixar > qtdDisponivel) return openConfirmModal("Por favor, insira uma quantidade válida.");
    
    closeBaixaModal();
    const success = await performSankhyaOperation(async (bearerToken) => {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const cabecalhoBody = { serviceName: "DatasetSP.save", requestBody: { entityName: "AD_BXAEND", fields: ["SEQBAI", "DATGER"], records: [{ values: { "1": hoje } }] } };
        const cabecalhoRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...cabecalhoBody }) });
        const cabecalhoData = await cabecalhoRes.json();
        if (cabecalhoData.status !== "1" || !cabecalhoData.responseBody.result?.[0]?.[0]) throw new Error(cabecalhoData.statusMessage || 'Resposta inválida da API ao criar cabeçalho.');
        
        const seqBai = cabecalhoData.responseBody.result[0][0];
        const itemBody = {
            serviceName: "DatasetSP.save",
            requestBody: {
                entityName: "AD_IBXEND",
                fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
                records: [{ values: { "1": seqBai.toString(), "2": currentItemDetails.codarm.toString(), "3": currentItemDetails.sequencia.toString(), "4": qtdBaixar.toString() } }]
            }
        };
        const itemRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...itemBody }) });
        const itemData = await itemRes.json();
        if (itemData.status !== "1") throw new Error(itemData.statusMessage);

        const stpBody = { serviceName: "ActionButtonsSP.executeSTP", requestBody: { stpCall: { actionID: "20", procName: "NIC_STP_BAIXA_END", rootEntity: "AD_BXAEND", rows: { row: [{ field: [{ fieldName: "SEQBAI", "$": seqBai }] }] } } } };
        const stpRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...stpBody }) });
        const stpData = await stpRes.json();
        if (stpData.status !== "1" && stpData.status !== "2") throw new Error(stpData.statusMessage);
        if (stpData.statusMessage) openConfirmModal(stpData.statusMessage, 'Sucesso!');
    });
    if (success) {
        showMainPage();
        handleConsulta();
    }
}

async function handleTransfer() {
    const quantidade = parseInt(document.getElementById('modal-qtd-transfer').value, 10);
    const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
    const enderecoDestino = document.getElementById('modal-enddes-transfer').value.trim();
    const armazemDestino = document.getElementById('modal-armdes-transfer').value;

    if (isNaN(quantidade) || quantidade <= 0 || quantidade > qtdDisponivel) return openConfirmModal("Por favor, insira uma quantidade válida.");
    if (!armazemDestino) return openConfirmModal("Por favor, selecione um armazém de destino.");
    if (!enderecoDestino) return openConfirmModal("Por favor, insira o endereço de destino.");

    closeTransferModal();
    const success = await performSankhyaOperation(async (bearerToken) => {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const cabecalhoBody = { serviceName: "DatasetSP.save", requestBody: { entityName: "AD_BXAEND", fields: ["SEQBAI", "DATGER"], records: [{ values: { "1": hoje } }] } };
        const cabecalhoRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...cabecalhoBody }) });
        const cabecalhoData = await cabecalhoRes.json();
        if (cabecalhoData.status !== "1" || !cabecalhoData.responseBody.result?.[0]?.[0]) throw new Error(cabecalhoData.statusMessage || 'Resposta inválida da API.');
        const seqBai = cabecalhoData.responseBody.result[0][0];
        const sqlCheck = `SELECT CODPROD, QTDPRO FROM AD_CADEND WHERE SEQEND = ${enderecoDestino} AND CODARM = ${armazemDestino}`;
        const checkBody = { serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: sqlCheck } };
        const checkRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...checkBody }) });
        const checkData = await checkRes.json();
        if (checkData.status !== '1') throw new Error("Falha ao verificar o endereço de destino.");
        const destinationItem = checkData.responseBody.rows.length > 0 ? checkData.responseBody.rows[0] : null;
        const records = [];
        if (destinationItem && destinationItem[0] === currentItemDetails.codprod) {
            const [destCodProd, destQtd] = destinationItem;
            records.push({
                entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
                values: { "1": seqBai, "2": armazemDestino, "3": enderecoDestino, "4": destQtd.toString() }
            });
        }
        records.push({
            entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "ARMDES", "ENDDES", "QTDPRO"],
            values: { "1": seqBai, "2": currentItemDetails.codarm.toString(), "3": currentItemDetails.sequencia.toString(), "4": armazemDestino, "5": enderecoDestino, "6": quantidade.toString() }
        });
        for (const record of records) {
            const itemBody = { serviceName: "DatasetSP.save", requestBody: { entityName: record.entityName, standAlone: false, fields: record.fields, records: [{ values: record.values }] } };
            const itemRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...itemBody }) });
            const itemData = await itemRes.json();
            if (itemData.status !== "1") throw new Error(itemData.statusMessage || `Falha ao criar registro`);
        }
        const stpBody = { serviceName: "ActionButtonsSP.executeSTP", requestBody: { stpCall: { actionID: "20", procName: "NIC_STP_BAIXA_END", rootEntity: "AD_BXAEND", rows: { row: [{ field: [{ fieldName: "SEQBAI", "$": seqBai }] }] } } } };
        const stpRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...stpBody }) });
        const stpData = await stpRes.json();
        if (stpData.status !== "1" && stpData.status !== "2") throw new Error(stpData.statusMessage);
        if (stpData.statusMessage) openConfirmModal(stpData.statusMessage, 'Sucesso!');
    });
    if (success) {
        showMainPage();
        handleConsulta();
    }
}

async function handlePicking() {
    const quantidade = parseInt(document.getElementById('modal-qtd-picking').value, 10);
    const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
    const enderecoDestino = document.getElementById('modal-seqend-picking').value;
    const armazemDestino = currentItemDetails.codarm;

    if (isNaN(quantidade) || quantidade <= 0 || quantidade > qtdDisponivel) return openConfirmModal("Por favor, insira uma quantidade válida.");
    if (!enderecoDestino) return openConfirmModal("Por favor, selecione um endereço de destino.");

    closePickingModal();
    const success = await performSankhyaOperation(async (bearerToken) => {
        const hoje = new Date().toLocaleDateString('pt-BR');
        const cabecalhoBody = { serviceName: "DatasetSP.save", requestBody: { entityName: "AD_BXAEND", fields: ["SEQBAI", "DATGER"], records: [{ values: { "1": hoje } }] } };
        const cabecalhoRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...cabecalhoBody }) });
        const cabecalhoData = await cabecalhoRes.json();
        if (cabecalhoData.status !== "1" || !cabecalhoData.responseBody.result?.[0]?.[0]) throw new Error(cabecalhoData.statusMessage || 'Resposta inválida da API.');
        
        const seqBai = cabecalhoData.responseBody.result[0][0];
        const sqlCheck = `SELECT CODPROD, QTDPRO FROM AD_CADEND WHERE SEQEND = ${enderecoDestino} AND CODARM = ${armazemDestino}`;
        const checkBody = { serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: sqlCheck } };
        const checkRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...checkBody }) });
        const checkData = await checkRes.json();
        if (checkData.status !== '1') throw new Error("Falha ao verificar o endereço de destino.");
        const destinationItem = checkData.responseBody.rows.length > 0 ? checkData.responseBody.rows[0] : null;
        const records = [];
        if (destinationItem && destinationItem[0] === currentItemDetails.codprod) {
            const [destCodProd, destQtd] = destinationItem;
            records.push({
                entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
                values: { "1": seqBai, "2": armazemDestino.toString(), "3": enderecoDestino, "4": destQtd.toString() }
            });
        }
        
        records.push({
            entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "ARMDES", "ENDDES", "QTDPRO"],
            values: { "1": seqBai, "2": currentItemDetails.codarm.toString(), "3": currentItemDetails.sequencia.toString(), "4": armazemDestino.toString(), "5": enderecoDestino, "6": quantidade.toString() }
        });
        
        for (const record of records) {
            const itemBody = { serviceName: "DatasetSP.save", requestBody: { entityName: record.entityName, standAlone: false, fields: record.fields, records: [{ values: record.values }] } };
            const itemRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...itemBody }) });
            const itemData = await itemRes.json();
            if (itemData.status !== "1") throw new Error(itemData.statusMessage || `Falha ao criar registro`);
        }
        
        const stpBody = { serviceName: "ActionButtonsSP.executeSTP", requestBody: { stpCall: { actionID: "20", procName: "NIC_STP_BAIXA_END", rootEntity: "AD_BXAEND", rows: { row: [{ field: [{ fieldName: "SEQBAI", "$": seqBai }] }] } } } };
        const stpRes = await fetch(`${PROXY_URL}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bearerToken, ...stpBody }) });
        const stpData = await stpRes.json();
        if (stpData.status !== "1" && stpData.status !== "2") throw new Error(stpData.statusMessage);
        if (stpData.statusMessage) openConfirmModal(stpData.statusMessage, 'Sucesso!');
    });
    if (success) {
        showMainPage();
        handleConsulta();
    }
}

// --- Funções de Renderização e Inicialização ---
function renderizarCards(rows) {
    const resultsContainer = document.getElementById('results-container');
    if (!rows || rows.length === 0) {
        const emptyMessage = document.querySelector('#empty-state span');
        emptyMessage.textContent = "Nenhum resultado encontrado para esta busca.";
        return emptyState.classList.remove('hidden');
    }
    
    rows.forEach(row => {
        const [sequencia, rua, predio, apto, codprod, descrprod, marca, datval, qtd, endpic, qtdCompleta] = row;
        const card = document.createElement('div');
        card.className = 'result-card';

        if (endpic === 'S') {
            card.classList.add('picking-area');
        }

        let displayDesc = descrprod || 'Sem descrição';
        if (marca) {
            displayDesc += ` - ${marca}`;
        }

        card.innerHTML = `
            <div class="card-header"><p>Seq: <span>${sequencia}</span></p><p>Rua: <span>${rua}</span></p><p>Prédio: <span>${predio}</span></p></div>
            <div class="card-body"><p class="product-desc">${displayDesc}</p></div>
            <div class="card-footer">
                <span class="product-code">Cód: ${codprod}</span>
                <span class="product-quantity">Qtd: <strong>${qtdCompleta}</strong></span>
                <span class="product-validity">Val: ${formatarData(datval)}</span>
            </div>
        `;
        card.addEventListener('click', () => fetchAndShowDetails(sequencia));
        resultsContainer.appendChild(card);
    });
}

function populateDetails(details) {
    const [codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta] = details;
    currentItemDetails = { codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta };
    
    const detailsContent = document.getElementById('details-content');
    const pickingClass = endpic === 'S' ? 'picking-area' : '';

    detailsContent.innerHTML = `
        <div class="detail-hero ${pickingClass}"><h3 class="product-desc">${descrprod || 'Produto sem descrição'}</h3><div class="product-code">Cód. Prod.: ${codprod}</div></div>
        <div class="details-section"><h4 class="details-section-title">Informações</h4><div class="details-grid">
            <div class="detail-item"><div class="label">Marca</div><div class="value">${marca || 'N/A'}</div></div>
            <div class="detail-item"><div class="label">Validade</div><div class="value">${formatarData(datval)}</div></div>
            <div class="detail-item"><div class="label">Quantidade</div><div class="value">${qtdCompleta || 0}</div></div>
        </div></div>
        <div class="details-section"><h4 class="details-section-title">Localização</h4><div class="details-grid">
            <div class="detail-item"><div class="label">Armazém</div><div class="value">${codarm}</div></div>
            <div class="detail-item"><div class="label">Rua</div><div class="value">${rua}</div></div>
            <div class="detail-item"><div class="label">Prédio</div><div class="value">${predio}</div></div>
            <div class="detail-item"><div class="label">Sequência</div><div class="value">${sequencia}</div></div>
            <div class="detail-item"><div class="label">Apto</div><div class="value">${apto}</div></div>
        </div></div>
    `;
    feather.replace();
}

function formatarData(dataString) {
    if (!dataString || typeof dataString !== 'string') return '';
    const parteData = dataString.split(' ')[0];
    return parteData.length !== 8 ? dataString : `${parteData.substring(0, 2)}/${parteData.substring(2, 4)}/${parteData.substring(4, 8)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-consultar').addEventListener('click', handleConsulta);
    document.getElementById('filtro-sequencia').addEventListener('keyup', (event) => { if (event.key === 'Enter') handleConsulta(); });
    document.getElementById('btn-voltar').addEventListener('click', showMainPage);
    document.querySelector('.btn-baixar').addEventListener('click', openBaixaModal);
    document.querySelector('.btn-transferir').addEventListener('click', openTransferModal);
    document.querySelector('.btn-picking').addEventListener('click', openPickingModal);
    document.getElementById('btn-cancelar-baixa').addEventListener('click', closeBaixaModal);
    document.getElementById('btn-confirmar-baixa').addEventListener('click', handleBaixa);
    document.getElementById('btn-cancelar-transfer').addEventListener('click', closeTransferModal);
    document.getElementById('btn-confirmar-transfer').addEventListener('click', handleTransfer);
    document.getElementById('btn-cancelar-picking').addEventListener('click', closePickingModal);
    document.getElementById('btn-confirmar-picking').addEventListener('click', handlePicking);
    document.getElementById('btn-close-confirm').addEventListener('click', closeConfirmModal);

    fetchAndPopulateWarehouses();
});