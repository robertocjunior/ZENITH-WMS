// src/frontend/api/index.js
import { AppState } from '../state/index.js';

const API_BASE_URL = '/api'; // PROXY_URL foi removido, o Vite cuida do proxy em dev

// Função genérica para chamadas autenticadas
async function authenticatedFetch(endpoint, body = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
        // Se a sessão expirar, o backend responderá com 401
        if (response.status === 401) {
            // A lógica de logout será acionada no `main.js` ou onde a função for chamada
        }
        throw new Error(data.message || 'Erro na comunicação com o servidor.');
    }
    
    // Para respostas sem conteúdo (ex: 204)
    if (response.status === 204 || !data) {
        return null;
    }

    return data;
}

// --- Funções de API Específicas ---

export async function login(username, password) {
    const deviceToken = localStorage.getItem('deviceToken');
    // Adicionado o prefixo /api para corresponder à rota do backend
    const response = await fetch('/api/login', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, deviceToken })
    });
    const data = await response.json();
    if (!response.ok) {
        if (data.deviceToken) {
            localStorage.setItem('deviceToken', data.deviceToken);
        }
        throw new Error(data.message || 'Erro desconhecido no login.');
    }
    if (data.deviceToken) {
        localStorage.setItem('deviceToken', data.deviceToken);
    }
    return data;
}

export async function logout() {
    try {
        await authenticatedFetch('/logout');
    } finally {
        localStorage.removeItem('deviceToken'); // Limpa o token do dispositivo no logout
    }
}

export function fetchWarehouses() {
    return authenticatedFetch('/get-warehouses');
}

export function fetchPermissions() {
    return authenticatedFetch('/get-permissions');
}

export function searchItems(codArm, filtro) {
    return authenticatedFetch('/search-items', { codArm, filtro });
}

export function fetchItemDetails(codArm, sequencia) {
    return authenticatedFetch('/get-item-details', { codArm, sequencia: String(sequencia) });
}

export function fetchHistory() {
    return authenticatedFetch('/get-history');
}

export function fetchPickingLocations(codarm, codprod, sequencia) {
    return authenticatedFetch('/get-picking-locations', { codarm, codprod, sequencia });
}

export function executeTransaction(type, payload) {
    return authenticatedFetch('/execute-transaction', { type, payload });
}