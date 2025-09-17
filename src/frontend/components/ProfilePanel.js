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

// src/frontend/components/ProfilePanel.js
import { AppState } from "../state/index.js";

function openProfilePanel() {
    // Acessa o estado para obter os dados mais recentes do usuário
    const user = AppState.getCurrentUser();
    
    // Verifica se o usuário existe e atualiza a interface
    if (user && user.nomeusu && user.codusu) {
        // CORREÇÃO: Usa 'nomeusu' para o nome completo e 'codusu' para o código.
        document.getElementById('profile-user-info').textContent = `${user.nomeusu} - ${user.codusu}`;
    } else {
        // Caso os dados não sejam encontrados, exibe um texto padrão
        document.getElementById('profile-user-info').textContent = 'Usuário não identificado';
    }
    
    document.getElementById('profile-overlay').classList.remove('hidden');
    document.getElementById('profile-panel').classList.add('active');
}

function closeProfilePanel() {
    document.getElementById('profile-overlay').classList.add('hidden');
    document.getElementById('profile-panel').classList.remove('active');
}

function initializeProfilePanelListeners(onLogout, onShowHistory) {
    document.getElementById('btn-open-profile').addEventListener('click', openProfilePanel);
    document.getElementById('btn-close-profile').addEventListener('click', closeProfilePanel);
    document.getElementById('profile-overlay').addEventListener('click', closeProfilePanel);

    document.getElementById('btn-history').addEventListener('click', () => {
        closeProfilePanel();
        onShowHistory();
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        closeProfilePanel();
        onLogout(false);
    });
}

export { initializeProfilePanelListeners };