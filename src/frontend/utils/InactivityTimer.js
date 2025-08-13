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