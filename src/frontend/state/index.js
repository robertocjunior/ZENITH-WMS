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

// src/frontend/state/index.js

// Este objeto irá guardar o estado da aplicação em memória
let state = {
    currentUser: null,
    permissions: null,
    currentItem: null,
};

// Tenta carregar a sessão do usuário do sessionStorage ao iniciar
function loadSession() {
    try {
        const storedUser = sessionStorage.getItem('zenith_user_session');
        if (storedUser) {
            state.currentUser = JSON.parse(storedUser);
        }
    } catch (e) {
        console.error("Falha ao carregar sessão do usuário:", e);
        sessionStorage.removeItem('zenith_user_session');
    }
}

// Chama a função para carregar a sessão assim que o arquivo é lido
loadSession();

// Exporta o objeto AppState com todas as funções necessárias
export const AppState = {
    // Salva os dados do usuário no estado e no sessionStorage
    setUserSession(userData) {
        state.currentUser = userData;
        sessionStorage.setItem('zenith_user_session', JSON.stringify(userData));
    },

    // Limpa a sessão do usuário
    clearUserSession() {
        state.currentUser = null;
        state.permissions = null;
        state.currentItem = null;
        sessionStorage.removeItem('zenith_user_session');
    },

    // Retorna os dados do usuário logado
    getCurrentUser() {
        return state.currentUser;
    },

    // Verifica se há um usuário logado
    isUserLoggedIn() {
        return !!state.currentUser;
    },

    // Define e retorna as permissões
    setPermissions(perms) {
        state.permissions = perms;
    },
    getPermissions() {
        return state.permissions;
    },

    // Define e retorna o item selecionado (para a tela de detalhes)
    setCurrentItem(item) {
        state.currentItem = item;
    },
    getCurrentItem() {
        return state.currentItem;
    }
};