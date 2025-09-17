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
    // 1. Constrói a chave de armazenamento específica para o usuário.
    const userTokenKey = `deviceToken_${username.toUpperCase()}`;
    
    // 2. Procura por um token que já pertença a este usuário neste navegador.
    const deviceToken = localStorage.getItem(userTokenKey);

    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, deviceToken })
    });
    
    const data = await response.json();

    if (!response.ok) {
        // Se a resposta contiver um novo token (após o registro do dispositivo)...
        if (data.deviceToken) {
            // 3. Salva o novo token usando a chave específica do usuário.
            localStorage.setItem(userTokenKey, data.deviceToken);
        }
        throw new Error(data.message || 'Erro desconhecido no login.');
    }
    
    // Se o login for bem-sucedido e a resposta contiver um token...
    if (data.deviceToken) {
        // 4. Salva (ou atualiza) o token na chave específica do usuário.
        localStorage.setItem(userTokenKey, data.deviceToken);
    }

    return data;
}

export async function logout() {
    await authenticatedFetch('/logout');
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