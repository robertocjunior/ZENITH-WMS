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