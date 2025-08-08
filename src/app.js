// src/app.js
import './style.css';
import { PROXY_URL } from './config.js';

let currentItemDetails = null;

const Session = {
    getUsername: () => localStorage.getItem('username'),
    saveUsername: (username) => localStorage.setItem('username', username),
    clearUsername: () => localStorage.removeItem('username'),
    getCodUsu: () => localStorage.getItem('codusu'),
    saveCodUsu: (codusu) => localStorage.setItem('codusu', codusu),
    clearCodUsu: () => localStorage.removeItem('codusu'),
    getNumReg: () => localStorage.getItem('numreg'),
    saveNumReg: (numreg) => localStorage.setItem('numreg', numreg),
    clearNumReg: () => localStorage.removeItem('numreg'),
};

const Device = {
    getToken: () => localStorage.getItem('deviceToken'),
    saveToken: (token) => localStorage.setItem('deviceToken', token),
    clearToken: () => localStorage.removeItem('deviceToken')
};

async function authenticatedFetch(endpoint, body = {}) {
    const response = await fetch(`${PROXY_URL}/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    // [CORREÇÃO] Lida melhor com o erro de validação para exibir uma mensagem clara
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) handleLogout(true);
        const errorData = await response.json();
        // Se houver uma lista de erros do Zod, formata para exibição
        if (errorData.errors) {
            const errorMessages = errorData.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
            throw new Error(`Dados inválidos:\n${errorMessages}`);
        }
        throw new Error(errorData.message || "Erro na comunicação com o servidor.");
    }
    
    // Se a resposta for OK mas vazia (código 204, por exemplo), retorna nulo.
    if (response.status === 204) {
        return null;
    }

    return response.json();
}

async function handleLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) return openConfirmModal("Por favor, preencha o usuário e a senha.");
    
    showLoading(true);
    try {
        const deviceToken = Device.getToken();
        const response = await fetch(`${PROXY_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, deviceToken })
        });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 403 && data.deviceToken) {
                Device.saveToken(data.deviceToken);
            }
            throw new Error(data.message);
        }
        
        Session.saveUsername(data.username);
        Session.saveCodUsu(data.codusu);
        Session.saveNumReg(data.numreg);
        Device.saveToken(data.deviceToken);

        switchView('main');
        setupActivityListeners();
        InactivityTimer.start();
        await fetchAndPopulateWarehouses();
    } catch (error) {
        Session.clearUsername(); 
        Session.clearCodUsu();
        Session.clearNumReg();
        openConfirmModal(error.message, "Falha no Login");
    } finally {
        showLoading(false);
        passwordInput.value = '';
    }
}

function resetUIState() {
    document.getElementById('armazem-select').innerHTML = '<option value="">Selecione um Armazém</option>';
    document.getElementById('filtro-sequencia').value = '';
    document.getElementById('results-container').innerHTML = '';
    
    const emptyState = document.getElementById('empty-state');
    emptyState.classList.remove('hidden');
    emptyState.querySelector('.material-icons').textContent = 'warehouse';
    emptyState.querySelector('p').textContent = "Nenhum resultado para exibir";
    emptyState.querySelector('span').textContent = "Selecione um armazém para começar";

    document.getElementById('details-content').innerHTML = '';
    currentItemDetails = null;
    document.getElementById('history-container').innerHTML = '';
    document.getElementById('history-empty-state').classList.add('hidden');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

async function handleLogout(fromInactivity = false) {
    closeProfilePanel();
    const token = Session.getToken();
    if (token) {
        try {
            await authenticatedFetch('/logout');
        } catch (e) {
            console.error("Falha ao notificar servidor do logout:", e.message);
        }
    }
    Session.clearUsername();
    Session.clearCodUsu();
    Session.clearNumReg();
    InactivityTimer.clear();
    removeActivityListeners();
    resetUIState();
    switchView('login');
    if (fromInactivity) {
        openConfirmModal("Sua sessão expirou por inatividade.", "Sessão Expirada");
    }
}

async function fetchAndPopulateWarehouses() {
    showLoading(true);
    try {
        const armazens = await authenticatedFetch('/get-warehouses');
        const selectPrincipal = document.getElementById('armazem-select');
        const selectModal = document.getElementById('modal-armdes-transfer');
        
        if (armazens.length === 0) {
            selectPrincipal.innerHTML = '<option value="">Nenhum armazém permitido</option>';
            document.getElementById('btn-consultar').disabled = true;
        } else {
            selectPrincipal.innerHTML = '<option value="">Selecione um Armazém</option>';
            document.getElementById('btn-consultar').disabled = false;
        }

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
        document.getElementById('armazem-select').innerHTML = '<option value="">Erro ao carregar</option>';
        document.getElementById('btn-consultar').disabled = true;
    } finally {
        showLoading(false);
    }
}

async function handleConsulta() {
    showLoading(true);
    document.getElementById('results-container').innerHTML = '';
    document.getElementById('empty-state').classList.add('hidden');
    try {
        const codArm = document.getElementById('armazem-select').value;
        if (!codArm) throw new Error("Por favor, selecione um armazém para iniciar a busca.");
        const filtro = document.getElementById('filtro-sequencia').value;
        const rows = await authenticatedFetch('/search-items', { codArm, filtro });
        renderizarCards(rows);
    } catch(error) {
        openConfirmModal(error.message, "Erro na Consulta");
    } finally {
        showLoading(false);
    }
}

async function fetchAndShowDetails(sequencia) {
    showLoading(true);
    updateActionButtonsVisibility({ transfer: false, baixa: false, pick: false, corre: false });
    try {
        const codArm = document.getElementById('armazem-select').value;
        
        const [details, permissions] = await Promise.all([
            authenticatedFetch('/get-item-details', { codArm, sequencia: String(sequencia) }),
            authenticatedFetch('/get-permissions')
        ]);
        
        populateDetails(details);
        updateActionButtonsVisibility(permissions);
        
        switchView('details');
    } catch (error) {
        openConfirmModal(error.message, "Erro");
        switchView('main');
    } finally {
        showLoading(false);
    }
}

async function showHistoryPage() {
    closeProfilePanel();
    showLoading(true);
    switchView('history');
    try {
        const rows = await authenticatedFetch('/get-history');
        renderHistoryCards(rows);
    } catch (error) {
        openConfirmModal(error.message, "Erro ao carregar Histórico");
        switchView('main');
    } finally {
        showLoading(false);
    }
}

async function handleBaixa() {
    const qtdBaixar = parseInt(document.getElementById('modal-qtd-baixa').value, 10);
    if (isNaN(qtdBaixar) || qtdBaixar <= 0 || qtdBaixar > currentItemDetails.quantidade) {
        return openConfirmModal("Quantidade para baixa é inválida.");
    }
    closeBaixaModal();
    showLoading(true);
    try {
        const payload = {
            codarm: currentItemDetails.codarm,
            sequencia: currentItemDetails.sequencia,
            quantidade: qtdBaixar
        };
        const result = await authenticatedFetch('/execute-transaction', { type: 'baixa', payload });
        openConfirmModal(result.message, 'Sucesso!');
        switchView('main');
        await handleConsulta();
    } catch (error) {
        openConfirmModal(error.message, "Falha na Baixa");
    } finally {
        showLoading(false);
    }
}

async function handleTransfer() {
    const quantidade = parseInt(document.getElementById('modal-qtd-transfer').value, 10);
    const armazemDestino = document.getElementById('modal-armdes-transfer').value;
    const enderecoDestino = document.getElementById('modal-enddes-transfer').value.trim();

    if (isNaN(quantidade) || quantidade <= 0 || quantidade > currentItemDetails.quantidade) return openConfirmModal("Quantidade inválida.");
    if (!armazemDestino) return openConfirmModal("Selecione um armazém de destino.");
    if (!enderecoDestino) return openConfirmModal("Insira o endereço de destino.");
    
    closeTransferModal();
    showLoading(true);
    try {
        const payload = {
            origem: currentItemDetails,
            destino: { armazemDestino, enderecoDestino, quantidade }
        };
        const result = await authenticatedFetch('/execute-transaction', { type: 'transferencia', payload });
        openConfirmModal(result.message, 'Sucesso!');
        switchView('main');
        await handleConsulta();
    } catch (error) {
        openConfirmModal(error.message, "Falha na Transferência");
    } finally {
        showLoading(false);
    }
}

async function handlePicking() {
    const quantidade = parseInt(document.getElementById('modal-qtd-picking').value, 10);
    const enderecoDestino = document.getElementById('modal-seqend-picking').value;

    if (isNaN(quantidade) || quantidade <= 0 || quantidade > currentItemDetails.quantidade) return openConfirmModal("Quantidade inválida.");
    if (!enderecoDestino) return openConfirmModal("Selecione um endereço de destino.");

    closePickingModal();
    showLoading(true);
    try {
        const payload = {
            origem: currentItemDetails,
            destino: { 
                armazemDestino: currentItemDetails.codarm.toString(), 
                enderecoDestino: enderecoDestino, 
                quantidade: quantidade 
            }
        };
        const result = await authenticatedFetch('/execute-transaction', { type: 'picking', payload });
        openConfirmModal(result.message, 'Sucesso!');
        switchView('main');
        await handleConsulta();
    } catch (error) {
        openConfirmModal(error.message, "Falha na Operação de Picking");
    } finally {
        showLoading(false);
    }
}

async function handleCorrecao() {
    const newQuantityInput = document.getElementById('modal-qtd-correcao');
    const newQuantity = parseFloat(newQuantityInput.value);

    if (isNaN(newQuantity) || newQuantity < 0) {
        return openConfirmModal("A nova quantidade inserida é inválida.");
    }
    
    closeCorrecaoModal();
    showLoading(true);

    try {
        const payload = {
            codarm: currentItemDetails.codarm,
            sequencia: currentItemDetails.sequencia,
            newQuantity: newQuantity
        };
        const result = await authenticatedFetch('/execute-transaction', { type: 'correcao', payload });
        openConfirmModal(result.message, 'Sucesso!');
        switchView('main');
        await handleConsulta();
    } catch (error) {
        openConfirmModal(error.message, "Falha na Correção");
    } finally {
        showLoading(false);
    }
}

async function openPickingModal() {
    if (!currentItemDetails) return;
    document.getElementById('modal-qtd-disponivel-picking').textContent = currentItemDetails.qtdCompleta;
    const qtdInput = document.getElementById('modal-qtd-picking');
    qtdInput.value = currentItemDetails.quantidade;
    qtdInput.max = currentItemDetails.quantidade;
    const selectPicking = document.getElementById('modal-seqend-picking');
    selectPicking.innerHTML = '<option value="">Buscando locais...</option>';
    selectPicking.disabled = true;
    document.getElementById('picking-modal').classList.remove('hidden');
    
    showLoading(true);
    try {
        // [CORREÇÃO] Garante que os dados numéricos sejam enviados como números
        const { codarm, codprod, sequencia } = currentItemDetails;
        const locations = await authenticatedFetch('/get-picking-locations', { 
            codarm: Number(codarm), 
            codprod: Number(codprod), 
            sequencia: Number(sequencia)
        });
        
        selectPicking.innerHTML = locations.length ? '<option value="">Selecione um destino</option>' : '<option value="">Nenhum local de picking encontrado</option>';
        locations.forEach(([seqEnd, descrProd]) => {
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

function renderizarCards(rows) {
    const resultsContainer = document.getElementById('results-container');
    const emptyState = document.getElementById('empty-state');
    resultsContainer.innerHTML = '';
    if (!rows || rows.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('.material-icons').textContent = 'search_off';
        emptyState.querySelector('p').textContent = "Nenhum resultado encontrado";
        emptyState.querySelector('span').textContent = "Tente uma busca com termos diferentes.";
        return;
    }
    emptyState.classList.add('hidden');
    rows.forEach(row => {
        const [sequencia, rua, predio, apto, codprod, descrprod, marca, datval, qtd, endpic, qtdCompleta, derivacao] = row;
        const card = document.createElement('div');
        card.className = 'result-card';
        if (endpic === 'S') card.classList.add('picking-area');

        let displayDesc = descrprod || 'Sem descrição';
        if (marca) displayDesc += ` - ${marca}`;
        if (derivacao) displayDesc += ` - ${derivacao}`;

        card.innerHTML = `<div class="card-header"><p>Seq: <span>${sequencia}</span></p><p>Rua: <span>${rua}</span></p><p>Prédio: <span>${predio}</span></p></div><div class="card-body"><p class="product-desc">${displayDesc}</p></div><div class="card-footer"><span class="product-code">Cód: ${codprod}</span><span class="product-quantity">Qtd: <strong>${qtdCompleta}</strong></span><span class="product-validity">Val: ${formatarData(datval)}</span></div>`;
        card.addEventListener('click', () => fetchAndShowDetails(sequencia));
        resultsContainer.appendChild(card);
    });
}
function populateDetails(detailsArray) {
    const [codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta, derivacao] = detailsArray;
    currentItemDetails = { codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta, derivacao };
    const detailsContent = document.getElementById('details-content');
    const pickingClass = endpic === 'S' ? 'picking-area' : '';

    let mainDesc = descrprod || 'Produto sem descrição';
    if (marca) mainDesc += ` - ${marca}`;

    detailsContent.innerHTML = `<div class="detail-hero ${pickingClass}"><h3 class="product-desc">${mainDesc}</h3><div class="product-code">Cód. Prod.: ${codprod}</div></div><div class="details-section"><h4 class="details-section-title">Informações</h4><div class="details-grid"><div class="detail-item"><div class="label">Derivação</div><div class="value">${derivacao || 'N/A'}</div></div><div class="detail-item"><div class="label">Validade</div><div class="value">${formatarData(datval)}</div></div><div class="detail-item"><div class="label">Quantidade</div><div class="value">${qtdCompleta || 0}</div></div></div></div><div class="details-section"><h4 class="details-section-title">Localização</h4><div class="details-grid"><div class="detail-item"><div class="label">Armazém</div><div class="value">${codarm}</div></div><div class="detail-item"><div class="label">Rua</div><div class="value">${rua}</div></div><div class="detail-item"><div class="label">Prédio</div><div class="value">${predio}</div></div><div class="detail-item"><div class="label">Sequência</div><div class="value">${sequencia}</div></div><div class="detail-item"><div class="label">Apto</div><div class="value">${apto}</div></div></div></div>`;
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
        const [tipo, dataOrdem, hora, codarm, seqend, armdes, enddes, codprod, descrprod, marca, derivacao, quantAnt, qtdAtual, idOperacao] = row;
        
        const card = document.createElement('div');
        card.className = 'history-card';

        let productDisplay = descrprod || 'Produto';
        if (marca) productDisplay += ` - ${marca}`;
        if (derivacao) productDisplay += ` - ${derivacao}`;
        let productHtml = descrprod ? `<div class="product-info">${productDisplay}<span class="product-code">Cód: ${codprod}</span></div>` : '';
        
        let movementHtml = '';
        let opTypeLabel = '';

        if (tipo === 'CORRECAO') {
            card.classList.add('correction-type');
            opTypeLabel = 'Correção';
            movementHtml = `
                <div class="history-location">
                    <div class="location">
                        <div class="label">Local da Correção</div>
                        <div>${codarm} &rarr; ${seqend}</div>
                    </div>
                </div>
                <div class="history-movement">
                    <div class="origin"><div class="label">Qtd. Anterior</div><div>${quantAnt}</div></div>
                    <span class="material-icons arrow">trending_flat</span>
                    <div class="destination"><div class="label">Qtd. Corrigida</div><div>${qtdAtual}</div></div>
                </div>
            `;
        } else { // tipo 'MOV'
            opTypeLabel = 'Operação';
            if (armdes && enddes) {
                movementHtml = `<div class="history-movement"><div class="origin"><div class="label">Origem</div><div>${codarm} &rarr; ${seqend}</div></div><span class="material-icons arrow">trending_flat</span><div class="destination"><div class="label">Destino</div><div>${armdes} &rarr; ${enddes}</div></div></div>`;
            } else {
                movementHtml = `<div class="history-location"><div class="location"><div class="label">Local da Baixa</div><div>${codarm} &rarr; ${seqend}</div></div></div>`;
            }
        }

        card.innerHTML = `<div class="card-header"><p>${opTypeLabel}: <span>${idOperacao}</span></p><p>${hora}</p></div><div class="card-body">${productHtml}${movementHtml}</div>`;
        container.appendChild(card);
    });
}

function updateActionButtonsVisibility(permissions) {
    const actionButtonsContainer = document.querySelector('.action-buttons');
    const btnBaixar = document.querySelector('.btn-baixar');
    const btnTransferir = document.querySelector('.btn-transferir');
    const btnPicking = document.querySelector('.btn-picking');
    const btnCorrecao = document.querySelector('.btn-correcao');

    const hasAnyPermission = permissions.baixa || permissions.transfer || permissions.pick || permissions.corre;

    if (actionButtonsContainer) {
        actionButtonsContainer.style.display = hasAnyPermission ? 'flex' : 'none';
    }

    if (btnBaixar) btnBaixar.style.display = permissions.baixa ? 'flex' : 'none';
    if (btnTransferir) btnTransferir.style.display = permissions.transfer ? 'flex' : 'none';
    if (btnPicking) btnPicking.style.display = permissions.pick ? 'flex' : 'none';
    if (btnCorrecao) btnCorrecao.style.display = permissions.corre ? 'flex' : 'none';
}


function formatarData(dataString) {
    if (!dataString || typeof dataString !== 'string') return '';
    const parteData = dataString.split(' ')[0];
    return parteData.length !== 8 ? dataString : `${parteData.substring(0, 2)}/${parteData.substring(2, 4)}/${parteData.substring(4, 8)}`;
}

function switchView(viewName) {
    document.querySelectorAll('#app-container .page').forEach(p => p.classList.remove('active'));
    
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');

    if (viewName === 'login') {
        loginPage.classList.remove('hidden');
        appContainer.classList.add('hidden');
    } else {
        loginPage.classList.add('hidden');
        appContainer.classList.remove('hidden');
        
        const activePage = document.getElementById(`${viewName}-page`);
        if (activePage) {
            activePage.classList.add('active');
        }
    }
}

function openConfirmModal(message, title = 'Aviso') { document.getElementById('modal-confirm-title').textContent = title; document.getElementById('modal-confirm-message').innerHTML = `<p>${message.replace(/\n/g, '<br>')}</p>`; document.getElementById('confirm-modal').classList.remove('hidden'); }
function closeConfirmModal() { document.getElementById('confirm-modal').classList.add('hidden'); }
function openBaixaModal() {
    if (!currentItemDetails) return;
    document.getElementById('modal-qtd-disponivel').textContent = currentItemDetails.qtdCompleta;
    const qtdInput = document.getElementById('modal-qtd-baixa');
    qtdInput.value = currentItemDetails.quantidade;
    qtdInput.max = currentItemDetails.quantidade;
    document.getElementById('baixa-modal').classList.remove('hidden');
}
function closeBaixaModal() { document.getElementById('baixa-modal').classList.add('hidden'); }
function openTransferModal() {
    if (!currentItemDetails) return;
    document.getElementById('modal-qtd-disponivel-transfer').textContent = currentItemDetails.qtdCompleta;
    const qtdInput = document.getElementById('modal-qtd-transfer');
    qtdInput.value = currentItemDetails.quantidade;
    qtdInput.max = currentItemDetails.quantidade;
    document.getElementById('modal-enddes-transfer').value = '';
    document.getElementById('transfer-modal').classList.remove('hidden');
}
function closeTransferModal() { document.getElementById('transfer-modal').classList.add('hidden'); }
function closePickingModal() { document.getElementById('picking-modal').classList.add('hidden'); }

function openCorrecaoModal() {
    if (!currentItemDetails) return;
    document.getElementById('modal-qtd-disponivel-correcao').textContent = currentItemDetails.qtdCompleta;
    const qtdInput = document.getElementById('modal-qtd-correcao');
    qtdInput.value = ''; 
    document.getElementById('correcao-modal').classList.remove('hidden');
}
function closeCorrecaoModal() { 
    document.getElementById('correcao-modal').classList.add('hidden'); 
}

const loading = document.getElementById('loading');
function showLoading(show) { loading.classList.toggle('hidden', !show); }
function openProfilePanel() { document.getElementById('profile-overlay').classList.remove('hidden'); document.getElementById('profile-panel').classList.add('active'); document.getElementById('profile-user-info').textContent = `${Session.getCodUsu()} - ${Session.getUsername()}`;}
function closeProfilePanel() { document.getElementById('profile-overlay').classList.add('hidden'); document.getElementById('profile-panel').classList.remove('active'); }
const InactivityTimer = { timeoutID: null, timeoutInMilliseconds: 3600 * 1000, start: function() { this.clear(); this.timeoutID = setTimeout(() => this.forceLogout(), this.timeoutInMilliseconds); }, reset: function() { this.start(); }, clear: function() { if (this.timeoutID) clearTimeout(this.timeoutID); }, forceLogout: function() { handleLogout(true); }};
const activityEvents = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
let throttleTimeout = null;
const throttledReset = () => { if (throttleTimeout) return; throttleTimeout = setTimeout(() => { InactivityTimer.reset(); throttleTimeout = null; }, 500); };
function setupActivityListeners() { activityEvents.forEach(event => window.addEventListener(event, throttledReset)); }
function removeActivityListeners() { activityEvents.forEach(event => window.removeEventListener(event, throttledReset)); }

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('login-password').addEventListener('keyup', (e) => e.key === 'Enter' && handleLogin());
    document.getElementById('btn-logout').addEventListener('click', () => handleLogout(false));
    document.getElementById('btn-consultar').addEventListener('click', handleConsulta);
    document.getElementById('filtro-sequencia').addEventListener('keyup', (e) => e.key === 'Enter' && handleConsulta());
    document.getElementById('btn-voltar').addEventListener('click', () => switchView('main'));
    document.getElementById('btn-history-voltar').addEventListener('click', () => switchView('main'));
    document.querySelector('.btn-baixar').addEventListener('click', openBaixaModal);
    document.querySelector('.btn-transferir').addEventListener('click', openTransferModal);
    document.querySelector('.btn-picking').addEventListener('click', openPickingModal);
    document.querySelector('.btn-correcao').addEventListener('click', openCorrecaoModal);
    document.getElementById('btn-confirmar-baixa').addEventListener('click', handleBaixa);
    document.getElementById('btn-confirmar-transfer').addEventListener('click', handleTransfer);
    document.getElementById('btn-confirmar-picking').addEventListener('click', handlePicking);
    document.getElementById('btn-confirmar-correcao').addEventListener('click', handleCorrecao);
    document.getElementById('btn-cancelar-baixa').addEventListener('click', closeBaixaModal);
    document.getElementById('btn-cancelar-transfer').addEventListener('click', closeTransferModal);
    document.getElementById('btn-cancelar-picking').addEventListener('click', closePickingModal);
    document.getElementById('btn-cancelar-correcao').addEventListener('click', closeCorrecaoModal);
    document.getElementById('btn-close-confirm').addEventListener('click', closeConfirmModal);
    document.getElementById('btn-open-profile').addEventListener('click', openProfilePanel);
    document.getElementById('btn-close-profile').addEventListener('click', closeProfilePanel);
    document.getElementById('profile-overlay').addEventListener('click', closeProfilePanel);
    document.getElementById('btn-history').addEventListener('click', showHistoryPage);

    if (Session.getToken()) {
        switchView('main');
        setupActivityListeners();
        InactivityTimer.start();
        fetchAndPopulateWarehouses();
    } else {
        switchView('login');
    }
});