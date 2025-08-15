// src/frontend/components/Modals.js
import { AppState } from '../state/index.js';
import { showLoading, openConfirmModal } from '../utils/dom.js';
import * as api from '../api/index.js';

let transactionCallback = null;

// --- Abertura e Preenchimento dos Modais ---

function openBaixaModal() {
    const item = AppState.getCurrentItem();
    if (!item) return;

    // AQUI: Este código preenche a quantidade disponível e o campo de texto no pop-up.
    document.getElementById('modal-qtd-disponivel').textContent = item.qtdCompleta;
    const qtdInput = document.getElementById('modal-qtd-baixa');
    qtdInput.value = item.quantidade; 
    
    qtdInput.max = item.quantidade;
    document.getElementById('baixa-modal').classList.remove('hidden');
}

function openTransferModal() {
    const item = AppState.getCurrentItem();
    const perms = AppState.getPermissions();
    if (!item) return;

    // AQUI: Preenche a quantidade no pop-up de transferência.
    document.getElementById('modal-qtd-disponivel-transfer').textContent = item.qtdCompleta;
    const qtdInput = document.getElementById('modal-qtd-transfer');
    qtdInput.value = item.quantidade; 

    qtdInput.max = item.quantidade;
    document.getElementById('modal-enddes-transfer').value = '';
    
    const criarPickingContainer = document.getElementById('criar-picking-container');
    criarPickingContainer.style.display = perms.criaPick ? 'block' : 'none';
    document.getElementById('checkbox-criar-picking').checked = false;

    document.getElementById('transfer-modal').classList.remove('hidden');
}

async function openPickingModal() {
    const item = AppState.getCurrentItem();
    if (!item) return;

    // AQUI: Preenche a quantidade no pop-up de picking.
    document.getElementById('modal-qtd-disponivel-picking').textContent = item.qtdCompleta;
    const qtdInput = document.getElementById('modal-qtd-picking');
    qtdInput.value = item.quantidade; 

    qtdInput.max = item.quantidade;

    const selectPicking = document.getElementById('modal-seqend-picking');
    selectPicking.innerHTML = '<option value="">Buscando locais...</option>';
    selectPicking.disabled = true;
    document.getElementById('picking-modal').classList.remove('hidden');

    showLoading(true);
    try {
        const { codarm, codprod, sequencia } = item;
        const locations = await api.fetchPickingLocations(Number(codarm), Number(codprod), Number(sequencia));
        
        selectPicking.innerHTML = locations.length ? '<option value="">Selecione um destino</option>' : '<option value="">Nenhum local de picking encontrado</option>';
        locations.forEach(([seqEnd, descrProd]) => {
            selectPicking.add(new Option(`${seqEnd} - ${descrProd}`, seqEnd));
        });
        selectPicking.disabled = false;
    } catch (error) {
        openConfirmModal(error.message, "Erro");
        closePickingModal();
    } finally {
        showLoading(false);
    }
}

function openCorrecaoModal() {
    const item = AppState.getCurrentItem();
    if (!item) return;

    // AQUI: Preenche a quantidade no pop-up de correção.
    document.getElementById('modal-qtd-disponivel-correcao').textContent = item.qtdCompleta;
    document.getElementById('modal-qtd-correcao').value = '';
    document.getElementById('correcao-modal').classList.remove('hidden');
}

// --- Funções de Fechamento ---
const closeBaixaModal = () => document.getElementById('baixa-modal').classList.add('hidden');
const closeTransferModal = () => document.getElementById('transfer-modal').classList.add('hidden');
const closePickingModal = () => document.getElementById('picking-modal').classList.add('hidden');
const closeCorrecaoModal = () => document.getElementById('correcao-modal').classList.add('hidden');

// --- Lógica de Ações ---

function updateActionButtonsVisibility() {
    const item = AppState.getCurrentItem();
    const perms = AppState.getPermissions();
    if (!item || !perms) return;

    const showBaixa = (item.endpic === 'S') ? perms.bxaPick : perms.baixa;
    const showPicking = perms.pick && item.endpic !== 'S';

    document.querySelector('.btn-baixar').style.display = showBaixa ? 'flex' : 'none';
    document.querySelector('.btn-transferir').style.display = perms.transfer ? 'flex' : 'none';
    document.querySelector('.btn-picking').style.display = showPicking ? 'flex' : 'none';
    document.querySelector('.btn-correcao').style.display = perms.corre ? 'flex' : 'none';
    
    const hasAnyAction = showBaixa || perms.transfer || showPicking || perms.corre;
    document.querySelector('.action-buttons').style.display = hasAnyAction ? 'flex' : 'none';
}

// --- Tratamento dos Eventos de Confirmação ---

function handleConfirmBaixa() {
    const item = AppState.getCurrentItem();
    const qtd = parseInt(document.getElementById('modal-qtd-baixa').value, 10);
    if (isNaN(qtd) || qtd <= 0 || qtd > item.quantidade) {
        return openConfirmModal("Quantidade para baixa é inválida.");
    }
    closeBaixaModal();
    const payload = { codarm: item.codarm, sequencia: item.sequencia, quantidade: qtd };
    transactionCallback('baixa', payload);
}

function handleConfirmTransfer() {
    const item = AppState.getCurrentItem();
    const qtd = parseInt(document.getElementById('modal-qtd-transfer').value, 10);
    const armDest = document.getElementById('modal-armdes-transfer').value;
    const endDest = document.getElementById('modal-enddes-transfer').value.trim();
    const criarPick = document.getElementById('checkbox-criar-picking').checked;
    
    if (isNaN(qtd) || qtd <= 0 || qtd > item.quantidade) return openConfirmModal("Quantidade inválida.");
    if (!armDest) return openConfirmModal("Selecione um armazém de destino.");
    if (!endDest) return openConfirmModal("Insira o endereço de destino.");
    
    closeTransferModal();
    const payload = {
        origem: item,
        destino: { armazemDestino: armDest, enderecoDestino: endDest, quantidade: qtd, criarPick }
    };
    transactionCallback('transferencia', payload);
}

function handleConfirmPicking() {
    const item = AppState.getCurrentItem();
    const qtd = parseInt(document.getElementById('modal-qtd-picking').value, 10);
    const endDest = document.getElementById('modal-seqend-picking').value;

    if (isNaN(qtd) || qtd <= 0 || qtd > item.quantidade) return openConfirmModal("Quantidade inválida.");
    if (!endDest) return openConfirmModal("Selecione um endereço de destino.");

    closePickingModal();
    const payload = {
        origem: item,
        destino: { armazemDestino: item.codarm.toString(), enderecoDestino: endDest, quantidade: qtd }
    };
    transactionCallback('picking', payload);
}

function handleConfirmCorrecao() {
    const item = AppState.getCurrentItem();
    const novaQtd = parseFloat(document.getElementById('modal-qtd-correcao').value);
    if (isNaN(novaQtd) || novaQtd < 0) {
        return openConfirmModal("A nova quantidade inserida é inválida.");
    }
    closeCorrecaoModal();
    const payload = { codarm: item.codarm, sequencia: item.sequencia, newQuantity: novaQtd };
    transactionCallback('correcao', payload);
}

// --- Inicializador de Eventos ---

function initializeModalEventListeners(onTransaction) {
    transactionCallback = onTransaction;

    document.querySelector('.btn-baixar').addEventListener('click', openBaixaModal);
    document.querySelector('.btn-transferir').addEventListener('click', openTransferModal);
    document.querySelector('.btn-picking').addEventListener('click', openPickingModal);
    document.querySelector('.btn-correcao').addEventListener('click', openCorrecaoModal);

    document.getElementById('btn-confirmar-baixa').addEventListener('click', handleConfirmBaixa);
    document.getElementById('btn-confirmar-transfer').addEventListener('click', handleConfirmTransfer);
    document.getElementById('btn-confirmar-picking').addEventListener('click', handleConfirmPicking);
    document.getElementById('btn-confirmar-correcao').addEventListener('click', handleConfirmCorrecao);

    document.getElementById('btn-cancelar-baixa').addEventListener('click', closeBaixaModal);
    document.getElementById('btn-cancelar-transfer').addEventListener('click', closeTransferModal);
    document.getElementById('btn-cancelar-picking').addEventListener('click', closePickingModal);
    document.getElementById('btn-cancelar-correcao').addEventListener('click', closeCorrecaoModal);
}

export { initializeModalEventListeners, updateActionButtonsVisibility };