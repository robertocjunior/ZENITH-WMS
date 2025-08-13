// src/frontend/components/PageRenderer.js
import { AppState } from '../state/index.js';
import { renderCards, renderHistoryCards } from './Cards.js';
import { updateActionButtonsVisibility } from './Modals.js';
import { formatData } from '../utils/dom.js';

let onSearchCallback = null;
let onShowDetailsCallback = null;

function populateWarehouses(warehouses, onSearch) {
    onSearchCallback = onSearch;
    const selectPrincipal = document.getElementById('armazem-select');
    const selectModal = document.getElementById('modal-armdes-transfer');
    const btnConsultar = document.getElementById('btn-consultar');
    
    selectPrincipal.innerHTML = '';
    selectModal.innerHTML = '';

    if (warehouses.length === 0) {
        selectPrincipal.innerHTML = '<option value="">Nenhum armazém permitido</option>';
        btnConsultar.disabled = true;
    } else {
        selectPrincipal.innerHTML = '<option value="">Selecione um Armazém</option>';
        btnConsultar.disabled = false;
        
        warehouses.forEach(([codArm, descArm]) => {
            const option = new Option(descArm, codArm);
            selectPrincipal.add(option);
            selectModal.add(option.cloneNode(true));
        });
    }

    // Adiciona os listeners de busca aqui, uma vez que os elementos estão prontos
    document.getElementById('btn-consultar').onclick = onSearchCallback;
    document.getElementById('filtro-sequencia').onkeyup = (e) => e.key === 'Enter' && onSearchCallback();
}

function renderSearchResults(items, onShowDetails) {
    onShowDetailsCallback = onShowDetails;
    renderCards(items, onShowDetailsCallback);
}

function renderDetailsPage(detailsArray) {
    const [codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta, derivacao] = detailsArray;
    const details = { codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta, derivacao };
    
    const detailsContent = document.getElementById('details-content');
    detailsContent.innerHTML = '';

    const pickingClass = endpic === 'S' ? 'picking-area' : '';
    let mainDesc = descrprod || 'Produto sem descrição';
    if (marca) mainDesc += ` - ${marca}`;

    detailsContent.innerHTML = `
        <div class="detail-hero ${pickingClass}">
            <h3 class="product-desc">${mainDesc}</h3>
            <div class="product-code">Cód. Prod.: ${codprod}</div>
        </div>
        <div class="details-section">
            <h4 class="details-section-title">Informações</h4>
            <div class="details-grid">
                <div class="detail-item"><div class="label">Derivação</div><div class="value">${derivacao || 'N/A'}</div></div>
                <div class="detail-item"><div class="label">Validade</div><div class="value">${formatData(datval)}</div></div>
                <div class="detail-item"><div class="label">Quantidade</div><div class="value">${qtdCompleta || 0}</div></div>
            </div>
        </div>
        <div class="details-section">
            <h4 class="details-section-title">Localização</h4>
            <div class="details-grid">
                <div class="detail-item"><div class="label">Armazém</div><div class="value">${codarm}</div></div>
                <div class="detail-item"><div class="label">Rua</div><div class="value">${rua}</div></div>
                <div class="detail-item"><div class="label">Prédio</div><div class="value">${predio}</div></div>
                <div class="detail-item"><div class="label">Sequência</div><div class="value">${sequencia}</div></div>
                <div class="detail-item"><div class="label">Apto</div><div class="value">${apto}</div></div>
            </div>
        </div>
    `;

    updateActionButtonsVisibility();
    switchView('details');
    
    document.getElementById('btn-voltar').onclick = () => switchView('main');
}

function renderHistoryPage(historyItems) {
    renderHistoryCards(historyItems);
    switchView('history');
    document.getElementById('btn-history-voltar').onclick = () => switchView('main');
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
        document.getElementById(`${viewName}-page`)?.classList.add('active');
    }
}

function resetUI() {
    document.getElementById('armazem-select').innerHTML = '<option value="">Selecione um Armazém</option>';
    document.getElementById('filtro-sequencia').value = '';
    document.getElementById('results-container').innerHTML = '';
    const emptyState = document.getElementById('empty-state');
    emptyState.classList.remove('hidden');
    document.getElementById('empty-state-message').textContent = "Nenhum resultado para exibir";
    document.getElementById('empty-state-subtext').textContent = "Selecione um armazém para começar";
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
}

export const PageRenderer = {
    populateWarehouses,
    renderSearchResults,
    renderDetailsPage,
    renderHistoryPage,
    switchView,
    resetUI,
};