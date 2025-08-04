// logger.js
const { createLogger, format, transports, addColors } = require('winston');

// Define a ordem e o formato dos níveis de log (padrão do npm)
const logLevels = {
  levels: { 
    error: 0, 
    warn: 1, 
    info: 2, 
    http: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
  }
};

// Adiciona as cores ao Winston
addColors(logLevels.colors);

// Define o formato do log para o console
const logFormat = format.combine(
  format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss' }),
  format.colorize({ all: true }), // Aplica cores a todo o output do nível
  format.printf(
    (info) => `[${info.timestamp}] ${info.level}: ${info.message}`
  )
);

// Cria a instância do logger
const logger = createLogger({
  levels: logLevels.levels,
  format: logFormat,
  // O "transporte" é onde o log será exibido. Neste caso, o console.
  transports: [new transports.Console()],
});

module.exports = logger;