// src/frontend/main.js
import { AppState } from './state/index.js';
import { PageRenderer } from './components/PageRenderer.js';
import { InactivityTimer } from './utils/InactivityTimer.js';
import { initializeModalEventListeners } from './components/Modals.js';
import { initializeProfilePanelListeners } from './components/ProfilePanel.js'; // IMPORT CORRIGIDO
import { showLoading, openConfirmModal } from './utils/dom.js';
import * as api from './api/index.js';

// Função principal de inicialização
async function main() {
    // Registrar todos os event listeners globais e de componentes
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    document.getElementById('login-password').addEventListener('keyup', (e) => e.key === 'Enter' && handleLogin());
    
    initializeModalEventListeners(handleTransaction);
    initializeProfilePanelListeners(handleLogout, showHistoryPage); // CHAMADA CORRIGIDA

    // Verifica se já existe uma sessão ativa (ex: após recarregar a página)
    if (AppState.isUserLoggedIn()) {
        PageRenderer.switchView('main');
        InactivityTimer.start(() => handleLogout(true));
        await setupMainPage();
    } else {
        PageRenderer.switchView('login');
    }
}

// Lida com o processo de login
async function handleLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        return openConfirmModal("Por favor, preencha o usuário e a senha.");
    }
    showLoading(true);
    
    try {
        // A principal mudança está aqui: passamos o 'username' para a função de login da API.
        const response = await api.login(username, password);
        
        AppState.setUserSession(response);
        
        PageRenderer.switchView('main');
        InactivityTimer.start(() => handleLogout(true));
        await setupMainPage();
    } catch (error) {
        AppState.clearUserSession();
        openConfirmModal(error.message, "Falha no Login");
    } finally {
        passwordInput.value = '';
        showLoading(false);
    }
}

// Lida com o logout
async function handleLogout(fromInactivity = false) {
    try {
        await api.logout();
    } catch (error) {
        console.error("Falha ao notificar servidor do logout:", error.message);
    } finally {
        AppState.clearUserSession();
        InactivityTimer.clear();
        PageRenderer.resetUI();
        PageRenderer.switchView('login');
        if (fromInactivity) {
            openConfirmModal("Sua sessão expirou por inatividade.", "Sessão Expirada");
        }
    }
}

// Configura a página principal após o login
async function setupMainPage() {
    showLoading(true);
    try {
        // As chamadas para a API são feitas em paralelo para mais performance
        const [warehouses, permissions] = await Promise.all([
            api.fetchWarehouses(),
            api.fetchPermissions()
        ]);
        
        AppState.setPermissions(permissions);
        PageRenderer.populateWarehouses(warehouses, handleSearch);
    } catch (error) {
        openConfirmModal(error.message, "Erro ao carregar dados iniciais");
        handleLogout();
    } finally {
        showLoading(false);
    }
}

// Lida com a busca de itens
async function handleSearch() {
    showLoading(true);
    try {
        const codArm = document.getElementById('armazem-select').value;
        const filtro = document.getElementById('filtro-sequencia').value;
        if (!codArm) {
            // Não joga erro, apenas avisa que precisa selecionar
            return openConfirmModal("Por favor, selecione um armazém para buscar.");
        }

        const items = await api.searchItems(codArm, filtro);
        PageRenderer.renderSearchResults(items, handleShowDetails);
    } catch (error) {
        openConfirmModal(error.message, "Erro na Busca");
        PageRenderer.renderSearchResults([]); // Limpa resultados em caso de erro
    } finally {
        showLoading(false);
    }
}

// Lida com a exibição da página de detalhes
async function handleShowDetails(sequencia) {
    showLoading(true);
    try {
        const codArm = document.getElementById('armazem-select').value;
        const details = await api.fetchItemDetails(codArm, sequencia);
        AppState.setCurrentItem(details);
        PageRenderer.renderDetailsPage(details);
    } catch (error) {
        openConfirmModal(error.message, "Erro ao carregar detalhes");
        PageRenderer.switchView('main');
    } finally {
        showLoading(false);
    }
}

// Lida com a exibição da página de histórico
async function showHistoryPage() {
    showLoading(true);
    try {
        const history = await api.fetchHistory();
        PageRenderer.renderHistoryPage(history);
    } catch (error) {
        openConfirmModal(error.message, "Erro ao carregar histórico");
        PageRenderer.switchView('main');
    } finally {
        showLoading(false);
    }
}

// Lida com todas as transações (baixa, transferência, etc.)
async function handleTransaction(type, payload) {
    showLoading(true);
    try {
        const result = await api.executeTransaction(type, payload);
        openConfirmModal(result.message, 'Sucesso!');
        PageRenderer.switchView('main');
        await handleSearch(); // Atualiza a lista principal após voltar
    } catch (error) {
        openConfirmModal(error.message, `Falha na Operação`);
    } finally {
        showLoading(false);
    }
}

// Inicia a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', main);