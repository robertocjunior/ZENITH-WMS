// src/utils/eventEmitter.js

const events = {};

const on = (eventName, callback) => {
    if (!events[eventName]) {
        events[eventName] = [];
    }
    events[eventName].push(callback);
    // Retorna uma função para remover o listener
    return () => off(eventName, callback);
};

const emit = (eventName, data) => {
    if (events[eventName]) {
        events[eventName].forEach(callback => callback(data));
    }
};

const off = (eventName, callback) => {
    if (events[eventName]) {
        events[eventName] = events[eventName].filter(cb => cb !== callback);
    }
};

export default { on, emit, off };