// src/frontend/state/index.js

// Estado reativo simples da aplicação
const State = {
    username: localStorage.getItem('username') || null,
    codusu: localStorage.getItem('codusu') || null,
    numreg: localStorage.getItem('numreg') || null,
    currentItemDetails: null,
    permissions: {
        baixa: false,
        transfer: false,
        pick: false,
        corre: false,
        bxaPick: false,
        criaPick: false,
    },
};

export const AppState = {
    // Getter para verificar se o usuário está logado
    isUserLoggedIn: () => !!State.username,

    // Getters para dados do estado
    getCurrentUser: () => ({ username: State.username, codusu: State.codusu }),
    getCurrentItem: () => State.currentItemDetails,
    getPermissions: () => State.permissions,

    // Setters para modificar o estado
    setUserSession: (sessionData) => {
        State.username = sessionData.username;
        State.codusu = sessionData.codusu;
        State.numreg = sessionData.numreg;
        localStorage.setItem('username', sessionData.username);
        localStorage.setItem('codusu', sessionData.codusu);
        localStorage.setItem('numreg', sessionData.numreg);
    },
    
    clearUserSession: () => {
        State.username = null;
        State.codusu = null;
        State.numreg = null;
        State.currentItemDetails = null;
        localStorage.removeItem('username');
        localStorage.removeItem('codusu');
        localStorage.removeItem('numreg');
    },

    setCurrentItem: (item) => {
        State.currentItemDetails = item;
    },
    
    setPermissions: (perms) => {
        State.permissions = { ...State.permissions, ...perms };
    },
};