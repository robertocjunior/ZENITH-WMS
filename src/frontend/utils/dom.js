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

// src/frontend/utils/dom.js

export function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
}

export function openConfirmModal(message, title = 'Aviso') {
    document.getElementById('modal-confirm-title').textContent = title;
    document.getElementById('modal-confirm-message').innerHTML = `<p>${message.replace(/\n/g, '<br>')}</p>`;
    document.getElementById('confirm-modal').classList.remove('hidden');
    document.getElementById('btn-close-confirm').onclick = closeConfirmModal;
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.add('hidden');
}

export function formatData(dataString) {
    if (!dataString || typeof dataString !== 'string') return 'N/A';
    const parteData = dataString.split(' ')[0];
    if (parteData.length !== 8) return dataString; // Retorna original se não estiver no formato esperado
    return `${parteData.substring(0, 2)}/${parteData.substring(2, 4)}/${parteData.substring(4, 8)}`;
}