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
    getCodUsu: () => localStorage.getItem('codusu'),
    saveCodUsu: (codusu) => localStorage.setItem('codusu', codusu),
    clearCodUsu: () => localStorage.removeItem('codusu'),
};

// ======================================================
// GERENCIAMENTO DE INATIVIDADE
// ======================================================
const InactivityTimer = {
    timeoutID: null,
    timeoutInMilliseconds: 3600 * 1000, // 1 hora
    start: function() {
        this.clear();
        this.timeoutID = setTimeout(() => this.forceLogout(), this.timeoutInMilliseconds);
    },
    reset: function() { this.start(); },
    clear: function() { if (this.timeoutID) clearTimeout(this.timeoutID); },
    forceLogout: function() { handleLogout(true); }
};
const activityEvents = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
let throttleTimeout = null;
const throttledReset = () => {
    if (throttleTimeout) return;
    throttleTimeout = setTimeout(() => {
        InactivityTimer.reset();
        throttleTimeout = null;
    }, 500);
};
function setupActivityListeners() { activityEvents.forEach(event => window.addEventListener(event, throttledReset)); }
function removeActivityListeners() { activityEvents.forEach(event => window.removeEventListener(event, throttledReset)); }

// ======================================================
// FUNÇÕES AUXILIARES E DE UI
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
function switchView(viewName) {
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    const mainPage = document.getElementById('main-page');
    const detailsPage = document.getElementById('details-page');
    const historyPage = document.getElementById('history-page'); 

    if (viewName === 'login') {
        loginPage.classList.add('active');
        loginPage.classList.remove('hidden');
        appContainer.classList.add('hidden');
    } else {
        loginPage.classList.remove('active');
        loginPage.classList.add('hidden');
        appContainer.classList.remove('hidden');

        mainPage.classList.remove('active');
        detailsPage.classList.remove('active');
        historyPage.classList.remove('active');

        if (viewName === 'main') {
            mainPage.classList.add('active');
        } else if (viewName === 'details') {
            detailsPage.classList.add('active');
        } else if (viewName === 'history') {
            historyPage.classList.add('active');
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

function openProfilePanel() {
    document.getElementById('profile-overlay').classList.remove('hidden');
    document.getElementById('profile-overlay').classList.add('active');
    document.getElementById('profile-panel').classList.add('active');
    
    const codUsu = Session.getCodUsu();
    const username = Session.getUsername();
    document.getElementById('profile-user-info').textContent = `${codUsu} - ${username}`;
    document.getElementById('session-hash').textContent = Session.getToken();
    feather.replace();
}
function closeProfilePanel() {
    document.getElementById('profile-overlay').classList.remove('active');
    document.getElementById('profile-panel').classList.remove('active');
    setTimeout(() => {
        document.getElementById('profile-overlay').classList.add('hidden');
    }, 300);
}

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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ serviceName, requestBody })
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
        handleLogout(true);
        throw new Error(data.message || "Sessão expirada. Por favor, faça login novamente.");
    }
    if (!response.ok) {
        throw new Error(data.statusMessage || data.message || "Erro na comunicação com o servidor.");
    }
    return data;
}

// ======================================================
// FUNÇÕES PRINCIPAIS
// ======================================================

async function handleLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) return openConfirmModal("Por favor, preencha o usuário e a senha.");
    
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
        
        const sql = `SELECT CODUSU FROM TSIUSU WHERE NOMEUSU = '${username.toUpperCase()}'`;
        const userData = await authenticatedFetch("DbExplorerSP.executeQuery", { sql });
        if (userData.status !== '1' || userData.responseBody.rows.length === 0) {
            throw new Error("Não foi possível encontrar o código de usuário (CODUSU).");
        }
        const codUsu = userData.responseBody.rows[0][0];
        Session.saveCodUsu(codUsu);

        switchView('main');
        setupActivityListeners();
        InactivityTimer.start();
        await fetchAndPopulateWarehouses();
        feather.replace();
    } catch (error) {
        Session.clearToken();
        Session.clearUsername();
        Session.clearCodUsu();
        openConfirmModal(error.message, "Falha no Login");
    } finally {
        showLoading(false);
        passwordInput.value = '';
    }
}

async function handleLogout(fromInactivity = false) {
    closeProfilePanel();
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
    Session.clearCodUsu();
    InactivityTimer.clear();
    removeActivityListeners();
    switchView('login');
    if (fromInactivity) {
        openConfirmModal("Sua sessão expirou por inatividade. Por favor, faça login novamente.", "Sessão Expirada");
    }
}

async function fetchAndPopulateWarehouses() {
    showLoading(true);
    try {
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
    } catch (error) {
        openConfirmModal(error.message, "Erro ao carregar Armazéns");
    } finally {
        showLoading(false);
    }
}

async function handleConsulta() {
    showLoading(true);
    try {
        const codArm = document.getElementById('armazem-select').value;
        if (!codArm) throw new Error("Por favor, selecione um armazém para iniciar a busca.");
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
    } catch(error) {
        openConfirmModal(error.message, "Erro na Consulta");
    } finally {
        showLoading(false);
    }
}

async function fetchAndShowDetails(sequencia) {
    showLoading(true);
    try {
        const codArm = document.getElementById('armazem-select').value;
        const sql = `SELECT ENDE.CODARM, ENDE.SEQEND, ENDE.CODRUA, ENDE.CODPRD, ENDE.CODAPT, ENDE.CODPROD, PRO.DESCRPROD, PRO.MARCA, ENDE.DATVAL, ENDE.QTDPRO, ENDE.ENDPIC, TO_CHAR(ENDE.QTDPRO) || ' ' || ENDE.CODVOL AS QTD_COMPLETA FROM AD_CADEND ENDE JOIN TGFPRO PRO ON PRO.CODPROD = ENDE.CODPROD WHERE ENDE.CODARM = ${codArm} AND ENDE.SEQEND = ${sequencia}`;
        const data = await authenticatedFetch("DbExplorerSP.executeQuery", { "sql": sql });
        if (data.status === "1" && data.responseBody.rows.length > 0) {
            populateDetails(data.responseBody.rows[0]);
            switchView('details');
        } else {
            throw new Error('Produto não encontrado ou erro na consulta.');
        }
    } catch (error) {
        openConfirmModal(error.message, "Erro");
    } finally {
        showLoading(false);
    }
}

async function showHistoryPage() {
    closeProfilePanel();
    showLoading(true);
    switchView('history');

    try {
        const codUsu = Session.getCodUsu();
        if (!codUsu) {
            throw new Error("Código do usuário não encontrado na sessão.");
        }
        const hoje = new Date().toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        const sql = `
            WITH RankedItems AS (
                SELECT 
                    BXA.SEQBAI,
                    TO_CHAR(BXA.DATGER, 'HH24:MI:SS') AS HORA,
                    BXA.DATGER,
                    IBX.CODARM,
                    IBX.SEQEND,
                    IBX.ARMDES,
                    IBX.ENDDES,
                    IBX.CODPROD,
                    IBX.SEQITE,
                    PRO.DESCRPROD,
                    ROW_NUMBER() OVER(PARTITION BY BXA.SEQBAI ORDER BY IBX.SEQITE DESC) as rn
                FROM AD_BXAEND BXA
                JOIN AD_IBXEND IBX ON IBX.SEQBAI = BXA.SEQBAI
                LEFT JOIN TGFPRO PRO ON IBX.CODPROD = PRO.CODPROD
                WHERE BXA.USUGER = ${codUsu}
                AND TRUNC(BXA.DATGER) = TO_DATE('${hoje}', 'DD/MM/YYYY')
            )
            SELECT
                SEQBAI,
                HORA,
                CODARM,
                SEQEND,
                ARMDES,
                ENDDES,
                CODPROD,
                DESCRPROD
            FROM RankedItems
            WHERE rn = 1
            ORDER BY DATGER DESC`;

        const data = await authenticatedFetch("DbExplorerSP.executeQuery", { sql });

        if (data.status !== "1") {
            throw new Error(data.statusMessage || "Falha ao carregar o histórico.");
        }

        renderHistoryCards(data.responseBody.rows);

    } catch (error) {
        openConfirmModal(error.message, "Erro ao carregar Histórico");
        switchView('main');
    } finally {
        showLoading(false);
    }
}

function renderHistoryCards(rows) {
    const container = document.getElementById('history-container');
    const emptyState = document.getElementById('history-empty-state');
    container.innerHTML = '';

    if (!rows || rows.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    rows.forEach(row => {
        const [seqbai, hora, codarm, seqend, armdes, enddes, codprod, descrprod] = row;

        const card = document.createElement('div');
        card.className = 'history-card';

        let productHtml = `
            <div class="product-info">
                ${descrprod || 'Produto ' + codprod}
                <span class="product-code">Cód: ${codprod}</span>
            </div>`;
        
        let movementHtml = '';
        if (armdes && enddes) {
            // É uma transferência
            movementHtml = `
                <div class="history-movement">
                    <div class="origin">
                        <div class="label">Origem</div>
                        <div>${codarm} &rarr; ${seqend}</div>
                    </div>
                    <i data-feather="arrow-right" class="arrow"></i>
                    <div class="destination">
                        <div class="label">Destino</div>
                        <div>${armdes} &rarr; ${enddes}</div>
                    </div>
                </div>`;
        } else {
            // É uma baixa simples
            movementHtml = `
                <div class="history-location">
                    <div class="location">
                        <div class="label">Local da Baixa</div>
                        <div>${codarm} &rarr; ${seqend}</div>
                    </div>
                </div>`;
        }

        card.innerHTML = `
            <div class="card-header">
                <p>Operação: <span>${seqbai}</span></p>
                <p>${hora}</p>
            </div>
            <div class="card-body">
                ${codprod ? productHtml : ''}
                ${movementHtml}
            </div>
        `;
        container.appendChild(card);
    });

    feather.replace(); // Atualiza os ícones do Feather
}


async function pollForCodProdUpdate(seqBai, expectedRecords, timeout = 20000, interval = 500) {
    const startTime = Date.now();
    const sql = `SELECT COUNT(*) FROM AD_IBXEND WHERE SEQBAI = ${seqBai} AND CODPROD IS NOT NULL`;

    while (Date.now() - startTime < timeout) {
        try {
            const data = await authenticatedFetch("DbExplorerSP.executeQuery", { sql });
            if (data.status === '1' && data.responseBody.rows.length > 0) {
                const populatedCount = parseInt(data.responseBody.rows[0][0], 10);
                if (populatedCount >= expectedRecords) {
                    console.log(`Campo CODPROD populado com sucesso após ${Date.now() - startTime}ms.`);
                    return true;
                }
            }
        } catch (error) {
            console.error("Erro durante a verificação (polling) do CODPROD:", error);
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error("O sistema não populou o CODPROD a tempo (timeout). A operação pode não ter sido concluída corretamente.");
}

async function doTransaction(records) {
    const hoje = new Date().toLocaleDateString('pt-BR');
    const codUsu = Session.getCodUsu();
    if (!codUsu) throw new Error("Código do usuário não encontrado na sessão. Faça login novamente.");

    const cabecalhoBody = { 
        entityName: "AD_BXAEND", 
        fields: ["SEQBAI", "DATGER", "USUGER"], 
        records: [{ values: { "1": hoje, "2": codUsu } }] 
    };
    const cabecalhoData = await authenticatedFetch("DatasetSP.save", cabecalhoBody);
    if (cabecalhoData.status !== "1" || !cabecalhoData.responseBody.result?.[0]?.[0]) {
        throw new Error(cabecalhoData.statusMessage || "Falha ao criar cabeçalho da baixa.");
    }
    const seqBai = cabecalhoData.responseBody.result[0][0];

    for (const record of records) {
        record.values["1"] = seqBai;
        const itemBody = { 
            entityName: record.entityName, 
            standAlone: false, 
            fields: record.fields, 
            records: [{ values: record.values }] 
        };
        const itemData = await authenticatedFetch("DatasetSP.save", itemBody);
        if (itemData.status !== "1") {
            throw new Error(itemData.statusMessage || "Falha ao inserir item da baixa.");
        }
    }

    try {
        await pollForCodProdUpdate(seqBai, records.length);
    } catch (error) {
        openConfirmModal(error.message, "Falha na Sincronização");
        return; 
    }

    const stpBody = { 
        stpCall: { 
            actionID: "20", 
            procName: "NIC_STP_BAIXA_END", 
            rootEntity: "AD_BXAEND", 
            rows: { row: [{ field: [{ fieldName: "SEQBAI", "$": seqBai }] }] } 
        } 
    };
    const stpData = await authenticatedFetch("ActionButtonsSP.executeSTP", stpBody);
    if (stpData.status !== "1" && stpData.status !== "2") {
        throw new Error(stpData.statusMessage || "Falha ao executar a procedure de baixa.");
    }
    
    if (stpData.statusMessage) {
        openConfirmModal(stpData.statusMessage, 'Sucesso!');
    }
}

async function handleBaixa() {
    showLoading(true);
    try {
        const qtdBaixar = parseInt(document.getElementById('modal-qtd-baixa').value, 10);
        const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
        if (isNaN(qtdBaixar) || qtdBaixar <= 0 || qtdBaixar > qtdDisponivel) throw new Error("Quantidade para baixa é inválida.");
        closeBaixaModal();
        const baixaRecord = {
            entityName: "AD_IBXEND",
            fields: ["SEQITE", "SEQBAI", "CODARM", "SEQEND", "QTDPRO"],
            values: { "2": currentItemDetails.codarm.toString(), "3": currentItemDetails.sequencia.toString(), "4": qtdBaixar.toString() }
        };
        await doTransaction([baixaRecord]);
        switchView('main');
        await handleConsulta();
    } catch (error) {
        openConfirmModal(error.message, "Falha na Baixa");
    } finally {
        showLoading(false);
    }
}

async function handleTransfer() {
    showLoading(true);
    try {
        const quantidade = parseInt(document.getElementById('modal-qtd-transfer').value, 10);
        const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
        const enderecoDestino = document.getElementById('modal-enddes-transfer').value.trim();
        const armazemDestino = document.getElementById('modal-armdes-transfer').value;
        if (isNaN(quantidade) || quantidade <= 0 || quantidade > qtdDisponivel) throw new Error("Quantidade para transferência é inválida.");
        if (!armazemDestino) throw new Error("Selecione um armazém de destino.");
        if (!enderecoDestino) throw new Error("Insira o endereço de destino.");
        closeTransferModal();
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
    } catch (error) {
        openConfirmModal(error.message, "Falha na Transferência");
    } finally {
        showLoading(false);
    }
}

async function handlePicking() {
    showLoading(true);
    try {
        const quantidade = parseInt(document.getElementById('modal-qtd-picking').value, 10);
        const qtdDisponivel = parseInt(currentItemDetails.quantidade, 10);
        const enderecoDestino = document.getElementById('modal-seqend-picking').value;
        if (isNaN(quantidade) || quantidade <= 0 || quantidade > qtdDisponivel) throw new Error("Quantidade para picking é inválida.");
        if (!enderecoDestino) throw new Error("Selecione um endereço de destino.");
        closePickingModal();
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
    } catch (error) {
        openConfirmModal(error.message, "Falha na Operação de Picking");
    } finally {
        showLoading(false);
    }
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
    // Buttons and Listeners
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('btn-logout').addEventListener('click', () => handleLogout(false));
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
    document.getElementById('btn-open-profile').addEventListener('click', openProfilePanel);
    document.getElementById('btn-close-profile').addEventListener('click', closeProfilePanel);
    document.getElementById('profile-overlay').addEventListener('click', closeProfilePanel);
    document.getElementById('btn-history').addEventListener('click', showHistoryPage);
    document.getElementById('btn-history-voltar').addEventListener('click', () => switchView('main'));


    // Startup Logic
    if (Session.getToken()) {
        switchView('main');
        setupActivityListeners();
        InactivityTimer.start();
        fetchAndPopulateWarehouses();
        feather.replace();
    } else {
        switchView('login');
    }
});