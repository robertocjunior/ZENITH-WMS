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

// src/frontend/components/Cards.js
import { formatData } from '../utils/dom.js';

function renderCards(rows, onShowDetails) {
    const resultsContainer = document.getElementById('results-container');
    const emptyState = document.getElementById('empty-state');
    resultsContainer.innerHTML = '';

    if (!rows || rows.length === 0) {
        emptyState.classList.remove('hidden');
        emptyState.querySelector('.material-icons').textContent = 'search_off';
        document.getElementById('empty-state-message').textContent = "Nenhum resultado encontrado";
        document.getElementById('empty-state-subtext').textContent = "Tente uma busca com termos diferentes.";
        return;
    }

    emptyState.classList.add('hidden');
    rows.forEach(row => {
        const [sequencia, rua, predio, , codprod, descrprod, marca, datval, , endpic, qtdCompleta, derivacao] = row;
        
        const card = document.createElement('div');
        card.className = 'result-card';
        if (endpic === 'S') card.classList.add('picking-area');

        let displayDesc = descrprod || 'Sem descrição';
        if (marca) displayDesc += ` - ${marca}`;
        if (derivacao) displayDesc += ` - ${derivacao}`;

        card.innerHTML = `
            <div class="card-header">
                <p>Seq: <span>${sequencia}</span></p>
                <p>Rua: <span>${rua}</span></p>
                <p>Prédio: <span>${predio}</span></p>
            </div>
            <div class="card-body">
                <p class="product-desc">${displayDesc}</p>
            </div>
            <div class="card-footer">
                <span class="product-code">Cód: ${codprod}</span>
                <span class="product-quantity">Qtd: <strong>${qtdCompleta}</strong></span>
                <span class="product-validity">Val: ${formatData(datval)}</span>
            </div>
        `;
        
        card.addEventListener('click', () => onShowDetails(sequencia));
        resultsContainer.appendChild(card);
    });
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

    const groupedOps = rows.reduce((acc, row) => {
        const opId = row[13]; // ID_OPERACAO
        if (!acc[opId]) acc[opId] = [];
        acc[opId].push(row);
        return acc;
    }, {});

    Object.values(groupedOps).forEach(group => {
        const firstRow = group[0];
        const [tipo, , hora, , , , , codprod, descrprod, marca, derivacao, quantAnt, qtdAtual, idOperacao] = firstRow;

        const card = document.createElement('div');
        card.className = `history-card ${tipo === 'CORRECAO' ? 'correction-type' : ''}`;
        
        let productDisplay = descrprod || 'Produto';
        if (marca) productDisplay += ` - ${marca}`;
        if (derivacao) productDisplay += ` - ${derivacao}`;

        let bodyHtml = '';
        if (tipo === 'CORRECAO') {
            const [, , , codarm, seqend] = firstRow;
            bodyHtml = `
                <div class="product-info">
                    ${productDisplay}<span class="product-code">Cód: ${codprod}</span>
                </div>
                <div class="history-location">
                    <div class="location"><div class="label">Local da Correção</div><div>${codarm} &rarr; ${seqend}</div></div>
                </div>
                <div class="history-movement">
                    <div class="origin"><div class="label">Qtd. Anterior</div><div>${quantAnt}</div></div>
                    <span class="material-icons arrow">trending_flat</span>
                    <div class="destination"><div class="label">Qtd. Corrigida</div><div>${qtdAtual}</div></div>
                </div>
            `;
        } else { // 'MOV'
            let actionsHtml = group.map(actionRow => {
                const [, , , codarm, seqend, armdes, enddes] = actionRow;
                if (armdes && enddes) { // Transferência
                    return `<div class="history-movement">
                                <div class="origin"><div class="label">Origem</div><div>${codarm} &rarr; ${seqend}</div></div>
                                <span class="material-icons arrow">trending_flat</span>
                                <div class="destination"><div class="label">Destino</div><div>${armdes} &rarr; ${enddes}</div></div>
                            </div>`;
                } else { // Baixa
                    return `<div class="history-location">
                                <div class="location"><div class="label">Local da Baixa</div><div>${codarm} &rarr; ${seqend}</div></div>
                            </div>`;
                }
            }).join('');

            bodyHtml = `
                <div class="product-info">
                    ${productDisplay}<span class="product-code">Cód: ${codprod}</span>
                </div>
                ${actionsHtml}
            `;
        }

        card.innerHTML = `
            <div class="card-header">
                <p>${tipo === 'CORRECAO' ? 'Correção' : 'Operação'}: <span>${idOperacao}</span></p>
                <p>${hora}</p>
            </div>
            <div class="card-body">${bodyHtml}</div>
        `;
        container.appendChild(card);
    });
}


export { renderCards, renderHistoryCards };