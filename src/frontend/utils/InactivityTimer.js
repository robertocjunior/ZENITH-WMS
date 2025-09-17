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

// src/frontend/utils/InactivityTimer.js

const TIMEOUT_MS = 3600 * 1000; // 1 hora
const THROTTLE_MS = 500; // Reseta o timer a cada 500ms no máximo

let timeoutID = null;
let throttleTimeout = null;
let onTimeoutCallback = null;

const activityEvents = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];

function forceLogout() {
    if (onTimeoutCallback) {
        onTimeoutCallback();
    }
}

function resetTimer() {
    clearTimeout(timeoutID);
    timeoutID = setTimeout(forceLogout, TIMEOUT_MS);
}

const throttledReset = () => {
    if (throttleTimeout) return;
    throttleTimeout = setTimeout(() => {
        resetTimer();
        throttleTimeout = null;
    }, THROTTLE_MS);
};

function setupActivityListeners() {
    activityEvents.forEach(event => window.addEventListener(event, throttledReset));
}

function removeActivityListeners() {
    activityEvents.forEach(event => window.removeEventListener(event, throttledReset));
}

export const InactivityTimer = {
    start: (onTimeout) => {
        onTimeoutCallback = onTimeout;
        removeActivityListeners(); // Garante que não haja listeners duplicados
        setupActivityListeners();
        resetTimer();
    },
    clear: () => {
        clearTimeout(timeoutID);
        removeActivityListeners();
        onTimeoutCallback = null;
    },
};