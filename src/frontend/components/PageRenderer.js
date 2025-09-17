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

    document.getElementById('btn-consultar').onclick = onSearchCallback;
    document.getElementById('filtro-sequencia').onkeyup = (e) => e.key === 'Enter' && onSearchCallback();
}

function renderSearchResults(items, onShowDetails) {
    onShowDetailsCallback = onShowDetails;
    renderCards(items, onShowDetailsCallback);
}

function renderDetailsPage(detailsArray) {
    // AQUI (Passo 1): Recebemos o array de dados da API e o transformamos em um objeto com nomes.
    const [codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta, derivacao] = detailsArray;
    const details = { codarm, sequencia, rua, predio, apto, codprod, descrprod, marca, datval, quantidade, endpic, qtdCompleta, derivacao };
    
    // AQUI (Passo 2): Salvamos este objeto no estado da aplicação. É daqui que o Modal.js vai ler.
    AppState.setCurrentItem(details);
    
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