let currentItemDetails = null;

// ======================================================
// GERENCIAMENTO DA SESSÃO (JWT)
// ======================================================
const Session = {
    getToken: () => localStorage.getItem('sessionToken'),
    saveToken: (token) => localStorage.setItem('sessionToken', token),
    clearToken: () => localStorage.removeItem('sessionToken'),
    getUsername: () => localStorage.getItem('username'),
    saveUsername: (username) => localStorage.setItem('username', username),
    clearUsername: () => localStorage.removeItem('username'),
};

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================
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

// ======================================================
// CONTROLE DE UI E MODAIS
// ======================================================

// CORRIGIDO: Função centralizada para trocar de tela
function switchView(viewName) {
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    const mainPage = document.getElementById('main-page');
    const detailsPage = document.getElementById('details-page');

    if (viewName === 'login') {
        loginPage.classList.add('active');
        loginPage.classList.remove('hidden');
        appContainer.classList.add('hidden');
    } else {
        // Mostra o container do app e esconde o login
        loginPage.classList.remove('active');
        loginPage.classList.add('hidden');
        appContainer.classList.remove('hidden');

        if (viewName === 'main') {
            mainPage.classList.add('active');
            detailsPage.classList.remove('active');
        } else if (viewName === 'details') {
            mainPage.classList.remove('active');
            detailsPage.classList.add('active');
        }
    }
}

function openConfirmModal(message, title = 'Aviso') {
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-message').innerHTML = parseSankhyaError(message);
    document.getElementById('confirm-modal').classList.remove('hidden');
}
function closeConfirmModal() { document.getElementById('confirm-modal').classList.add('hidden'); }
function openBaixaModal() {
    if (!currentItemDetails) return openConfirmModal("Erro: Nenhum item selecionado.");
    const maxQtd = currentItemDetails.quantidade;
    const qtdInput = document.getElementById('modal-qtd-baixa');
    qtdInput.value = maxQtd;
    qtdInput.max = maxQtd;
    document.getElementById('modal-qtd-disponivel').textContent = currentItemDetails.qtdCompleta;
    document.getElementById('baixa-modal').classList.remove('hidden');
}
function closeBaixaModal() { document.getElementById('baixa-modal').classList.add('hidden'); }
function openTransferModal() {
    if (!currentItemDetails) return openConfirmModal("Erro: Nenhum item selecionado.");
    const maxQtd = currentItemDetails.quantidade;
    const qtdInput = document.getElementById('modal-qtd-transfer');
    qtdInput.value = maxQtd;
    qtdInput.max = maxQtd;
    document.getElementById('modal-qtd-disponivel-transfer').textContent = currentItemDetails.qtdCompleta;
    document.getElementById('modal-enddes-transfer').value = '';
    document.getElementById('transfer-modal').classList.remove('hidden');
}
function closeTransferModal() { document.getElementById('transfer-modal').classList.add('hidden'); }
async function openPickingModal() {
    if (!currentItemDetails) return openConfirmModal("Erro: Nenhum item selecionado.");
    const selectPicking = document.getElementById('modal-seqend-picking');
    selectPicking.innerHTML = '<option value="">Buscando locais...</option>';
    selectPicking.disabled = true;
    document.getElementById('modal-qtd-disponivel-picking').textContent = currentItemDetails.qtdCompleta;
    const qtdInput = document.getElementById('modal-qtd-picking');
    qtdInput.value = currentItemDetails.quantidade;
    qtdInput.max = currentItemDetails.quantidade;
    document.getElementById('picking-modal').classList.remove('hidden');

    showLoading(true);
    try {
        const { codarm, codprod, sequencia } = currentItemDetails;
        const sql = `SELECT ENDE.SEQEND, PRO.DESCRPROD FROM AD_CADEND ENDE JOIN TGFPRO PRO ON ENDE.CODPROD = PRO.CODPROD WHERE ENDE.CODARM = ${codarm} AND ENDE.CODPROD = ${codprod} AND ENDE.ENDPIC = 'S' AND ENDE.SEQEND <> ${sequencia} ORDER BY ENDE.SEQEND`;
        const data = await authenticatedFetch("DbExplorerSP.executeQuery", { sql });

        if (data.status !== '1') throw new Error(data.statusMessage || "Não foi possível carregar os locais de picking.");

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
    } catch (error) {
        openConfirmModal(error.message, "Erro");
        closePickingModal();
    } finally {
        showLoading(false);
    }
}
function closePickingModal() { document.getElementById('picking-modal').classList.add('hidden'); }

const loading = document.getElementById('loading');
function showLoading(show) { loading.classList.toggle('hidden', !show); }

// ======================================================
// LÓGICA DE API
// ======================================================
async function authenticatedFetch(serviceName, requestBody) {
    const token = Session.getToken();
    if (!token) {
        handleLogout();
        throw new Error("Sessão inválida. Por favor, faça login novamente.");
    }
    const response = await fetch(`${PROXY_URL}/api`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ serviceName, requestBody })
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
        handleLogout();
        throw new Error(data.message || "Sessão expirada. Por favor, faça login novamente.");
    }
    if (!response.ok) {
        throw new Error(data.statusMessage || data.message || "Erro na comunicação com o servidor.");
    }
    return data;
}

async function runOperation(operationFunc) {
    showLoading(true);
    try {
        await operationFunc();
        return true;
    } catch (error) {
        openConfirmModal(error.message, "Falha na Operação");
        return false;
    } finally {
        showLoading(false);
    }
}

// ======================================================
// FUNÇÕES PRINCIPAIS
// ======================================================

async function handleLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        return openConfirmModal("Por favor, preencha o usuário e a senha.");
    }

    showLoading(true);
    try {
        const response = await fetch(`${PROXY_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        Session.saveToken(data.sessionToken);
        Session.saveUsername(data.username);
        
        switchView('main');
        document.getElementById('user-info').textContent = `Usuário: ${data.username}`;
        await fetchAndPopulateWarehouses();
        feather.replace();

    } catch (error) {
        openConfirmModal(error.message, "Falha no Login");
    } finally {
        showLoading(false);
        passwordInput.value = '';
    }
}

async function handleLogout() {
    const token = Session.getToken();
    if (token) {
        try {
            await fetch(`${PROXY_URL}/logout`, { 
                method: 'POST', 
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch(e) { console.error("Falha ao notificar servidor do logout:", e); }
    }
    Session.clearToken();
    Session.clearUsername();
    switchView('login');
}

async function fetchAndPopulateWarehouses() {
    await runOperation(async () => {
        const sql = "SELECT CODARM, CODARM || '-' || DESARM FROM AD_CADARM ORDER BY CODARM";
        const data = await authenticatedFetch("DbExplorerSP.executeQuery", { sql });
        if (data.status !== '1') throw new Error(data.statusMessage);
        
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
}

async function handleConsulta() {
    const codArm = document.getElementById('armazem-select').value;
    if (!codArm) return openConfirmModal("Por favor, selecione um armazém para iniciar a busca.");

    await runOperation(async () => {
        const resultsContainer = document.getElementById('results-container');
        resultsContainer.innerHTML = '';
        document.getElementById('empty-state').classList.add('hidden');

        const filtroInput = document.getElementById('filtro-sequencia').value.trim();
        let sqlFinal = `SELECT ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm}`;
        let orderByClause = '';

        if (filtroInput) {
            if (/^\d+$/.test(filtroInput)) {
                sqlFinal += ` AND (ENDE.SEQEND LIKE '${filtroInput}%' OR ENDE.CODPROD = ${filtroInput} OR ENDE.CODPROD = (SELECT CODPROD FROM AD_CADEND WHERE SEQEND = ${filtroInput} AND CODARM = ${codArm} AND ROWNUM = 1))`;
                orderByClause = ` ORDER BY CASE WHEN ENDE.SEQEND = ${filtroInput} THEN 0 ELSE 1 END, ENDE.ENDPIC DESC, ENDE.DATVAL ASC`;
            } else {
                const palavrasChave = removerAcentos(filtroInput).split(' ').filter(p => p.length > 0);
                const condicoes = palavrasChave.map(palavra => {
                    const palavraUpper = palavra.toUpperCase();
                    const cleanDescrprod = "TRANSLATE(UPPER(PRO.DESCRPROD), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')";
                    const cleanMarca = "TRANSLATE(UPPER(PRO.MARCA), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC')";
                    return `(${cleanDescrprod} LIKE '%${palavraUpper}%' OR ${cleanMarca} LIKE '%${palavraUpper}%')`;
                });
                if (condicoes.length > 0) sqlFinal += ` AND ${condicoes.join(' AND ')}`;
                orderByClause = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';
            }
        } else {
            orderByClause = ' ORDER BY ENDE.ENDPIC DESC, ENDE.DATVAL ASC';
        }
        
        sqlFinal += orderByClause;
        
        const data = await authenticatedFetch("DbExplorerSP.executeQuery", { "sql": sqlFinal });
        if (data.status !== "1") throw new Error(data.statusMessage);
        renderizarCards(data.responseBody.rows);
    });
}

async function fetchAndShowDetails(sequencia) {
    await runOperation(async () => {
        const codArm = document.getElementById('armazem-select').value;
        const sql = `SELECT ENDE.CODARM, ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm} AND ENDE.SEQEND = ${sequencia}`;
        const data = await authenticatedFetch("DbExplorerSP.executeQuery", { "sql": sql });

        if (data.status === "1" && data.responseBody.rows.length > 0) {
            populateDetails(data.responseBody.rows[0]);
            switchView('details');
        } else {
            throw new Error('Produto não encontrado ou erro na consulta.');
        }
    });
}

async function doTransaction(records) {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const cabecalhoBody = { entityName: "AD_BXAEND", fields: ["SEQBAI", "DATGER"], records: [{ values: { "1": hoje } }] };
    const cabecalhoData = await authenticatedFetch("DatasetSP.save", cabecalhoBody);
    if (cabecalhoData.status !== "1" || !cabecalhoData.responseBody.result?.[0]?.[0]) throw new Error(cabecalhoData.statusMessage);
    
    const seqBai = cabecalhoData.responseBody.result[0][0];

    for (const record of records) {
        record.values["1"] = seqBai;
        const itemBody = { entityName: record.entityName, standAlone: false, fields: record.fields, records: [{ values: record.values }] };
        const itemData = await authenticatedFetch("DatasetSP.save", itemBody);
        if (itemData.status !== "1") throw new Error(itemData.statusMessage);
    }
    
    const stpBody = { stpCall: { actionID: "20", procName: "NIC_STP_BAIXA_END", rootEntity: "AD_BXAEND", rows: { row: [{ field: [{ fieldName: "SEQBAI", "$": seqBai }] }] } } };
    const stpData = await authenticatedFetch("ActionButtonsSP.executeSTP", stpBody);
    if (stpData.status !== "1" && stpData.status !== "2") throw new Error(stpData.statusMessage);
    if (stpData.statusMessage) openConfirmModal(stpData.statusMessage, 'Sucesso!');
}

async function handleBaixa() {
    const qtdBaixar = parseInt(document.getElementById('modal-qtd-baixa').value, 10);
    const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
    if (isNaN(qtdBaixar) || qtdBaixar <= 0 || qtdBaixar > qtdDisponivel) return openConfirmModal("Por favor, insira uma quantidade válida.");
    closeBaixaModal();

    const success = await runOperation(async () => {
        const baixaRecord = {
            entityName: "AD_IBXEND",
            fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
            values: { "2": currentItemDetails.codarm.toString(), "3": currentItemDetails.sequencia.toString(), "4": qtdBaixar.toString() }
        };
        await doTransaction([baixaRecord]);
        switchView('main');
        await handleConsulta();
    });
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

    const success = await runOperation(async () => {
        const sqlCheck = `SELECT CODPROD, QTDPRO FROM AD_CADEND WHERE SEQEND = ${enderecoDestino} AND CODARM = ${armazemDestino}`;
        const checkData = await authenticatedFetch("DbExplorerSP.executeQuery", { sql: sqlCheck });
        if (checkData.status !== '1') throw new Error("Falha ao verificar o endereço de destino.");
        const destinationItem = checkData.responseBody.rows.length > 0 ? checkData.responseBody.rows[0] : null;
        
        const records = [];
        if (destinationItem && destinationItem[0] === currentItemDetails.codprod) {
            const [destCodProd, destQtd] = destinationItem;
            records.push({
                entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
                values: { "2": armazemDestino, "3": enderecoDestino, "4": destQtd.toString() }
            });
        }
        records.push({
            entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "ARMDES", "ENDDES", "QTDPRO"],
            values: { "2": currentItemDetails.codarm.toString(), "3": currentItemDetails.sequencia.toString(), "4": armazemDestino, "5": enderecoDestino, "6": quantidade.toString() }
        });

        await doTransaction(records);
        switchView('main');
        await handleConsulta();
    });
}

async function handlePicking() {
    const quantidade = parseInt(document.getElementById('modal-qtd-picking').value, 10);
    const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
    const enderecoDestino = document.getElementById('modal-seqend-picking').value;
    if (isNaN(quantidade) || quantidade <= 0 || quantidade > qtdDisponivel) return openConfirmModal("Por favor, insira uma quantidade válida.");
    if (!enderecoDestino) return openConfirmModal("Por favor, selecione um endereço de destino.");
    closePickingModal();

    const success = await runOperation(async () => {
        const armazemDestino = currentItemDetails.codarm.toString();
        const sqlCheck = `SELECT CODPROD, QTDPRO FROM AD_CADEND WHERE SEQEND = ${enderecoDestino} AND CODARM = ${armazemDestino}`;
        const checkData = await authenticatedFetch("DbExplorerSP.executeQuery", { sql: sqlCheck });
        if (checkData.status !== '1') throw new Error("Falha ao verificar o endereço de destino.");
        const destinationItem = checkData.responseBody.rows.length > 0 ? checkData.responseBody.rows[0] : null;
        
        const records = [];
        if (destinationItem && destinationItem[0] === currentItemDetails.codprod) {
            const [destCodProd, destQtd] = destinationItem;
            records.push({
                entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
                values: { "2": armazemDestino, "3": enderecoDestino, "4": destQtd.toString() }
            });
        }
        records.push({
            entityName: "AD_IBXEND", fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "ARMDES", "ENDDES", "QTDPRO"],
            values: { "2": currentItemDetails.codarm.toString(), "3": currentItemDetails.sequencia.toString(), "4": armazemDestino, "5": enderecoDestino, "6": quantidade.toString() }
        });

        await doTransaction(records);
        switchView('main');
        await handleConsulta();
    });
}

// --- Funções de Renderização e Inicialização ---
function renderizarCards(rows) {
    const resultsContainer = document.getElementById('results-container');
    const emptyState = document.getElementById('empty-state');
    if (!rows || rows.length === 0) {
        resultsContainer.innerHTML = '';
        emptyState.classList.remove('hidden');
        emptyState.querySelector('span').textContent = "Nenhum resultado encontrado para esta busca.";
        return;
    }
    emptyState.classList.add('hidden');
    resultsContainer.innerHTML = '';
    
    rows.forEach(row => {
        const [sequencia, rua, predio, apto, codprod, descrprod, marca, datval, qtd, endpic, qtdCompleta] = row;
        const card = document.createElement('div');
        card.className = 'result-card';
        if (endpic === 'S') card.classList.add('picking-area');
        let displayDesc = descrprod || 'Sem descrição';
        if (marca) displayDesc += ` - ${marca}`;
        card.innerHTML = `<div class="card-header"><p>Seq: <span>${sequencia}</span></p><p>Rua: <span>${rua}</span></p><p>Prédio: <span>${predio}</span></p></div><div class="card-body"><p class="product-desc">${displayDesc}</p></div><div class="card-footer"><span class="product-code">Cód: ${codprod}</span><span class="product-quantity">Qtd: <strong>${qtdCompleta}</strong></span><span class="product-validity">Val: ${formatarData(datval)}</span></div>`;
        card.addEventListener('click', () => fetchAndShowDetails(sequencia));
        resultsContainer.appendChild(card);
    });
}
function populateDetails(details) {
    const [codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta] = details;
    currentItemDetails = { codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta };
    
    const detailsContent = document.getElementById('details-content');
    const pickingClass = endpic === 'S' ? 'picking-area' : '';

    detailsContent.innerHTML = `<div class="detail-hero ${pickingClass}"><h3 class="product-desc">${descrprod || 'Produto sem descrição'}</h3><div class="product-code">Cód. Prod.: ${codprod}</div></div><div class="details-section"><h4 class="details-section-title">Informações</h4><div class="details-grid"><div class="detail-item"><div class="label">Marca</div><div class="value">${marca || 'N/A'}</div></div><div class="detail-item"><div class="label">Validade</div><div class="value">${formatarData(datval)}</div></div><div class="detail-item"><div class="label">Quantidade</div><div class="value">${qtdCompleta || 0}</div></div></div></div><div class="details-section"><h4 class="details-section-title">Localização</h4><div class="details-grid"><div class="detail-item"><div class="label">Armazém</div><div class="value">${codarm}</div></div><div class="detail-item"><div class="label">Rua</div><div class="value">${rua}</div></div><div class="detail-item"><div class="label">Prédio</div><div class="value">${predio}</div></div><div class="detail-item"><div class="label">Sequência</div><div class="value">${sequencia}</div></div><div class="detail-item"><div class="label">Apto</div><div class="value">${apto}</div></div></div></div>`;
    feather.replace();
}
function formatarData(dataString) {
    if (!dataString || typeof dataString !== 'string') return '';
    const parteData = dataString.split(' ')[0];
    return parteData.length !== 8 ? dataString : `${parteData.substring(0, 2)}/${parteData.substring(2, 4)}/${parteData.substring(4, 8)}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // Listeners de Login/Logout
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('login-password').addEventListener('keyup', (event) => { if (event.key === 'Enter') handleLogin(); });

    document.getElementById('btn-consultar').addEventListener('click', handleConsulta);
    document.getElementById('filtro-sequencia').addEventListener('keyup', (event) => { if (event.key === 'Enter') handleConsulta(); });
    document.getElementById('btn-voltar').addEventListener('click', () => switchView('main'));
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

    // Verifica se já existe uma sessão
    if (Session.getToken()) {
        switchView('main');
        document.getElementById('user-info').textContent = `Usuário: ${Session.getUsername()}`;
        fetchAndPopulateWarehouses();
        feather.replace();
    } else {
        switchView('login');
    }
});