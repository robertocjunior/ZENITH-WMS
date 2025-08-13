// src/frontend/components/ProfilePanel.js
import { AppState } from "../state/index.js";

function openProfilePanel() {
    // Acessa o estado para obter os dados mais recentes do usuário
    const user = AppState.getCurrentUser();
    if (user) {
        document.getElementById('profile-user-info').textContent = `${user.codusu} - ${user.username}`;
    }
    document.getElementById('profile-overlay').classList.remove('hidden');
    document.getElementById('profile-panel').classList.add('active');
}

function closeProfilePanel() {
    document.getElementById('profile-overlay').classList.add('hidden');
    document.getElementById('profile-panel').classList.remove('active');
}

// NOME DA FUNÇÃO CORRIGIDO
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

// EXPORTAÇÃO CORRIGIDA
export { initializeProfilePanelListeners };