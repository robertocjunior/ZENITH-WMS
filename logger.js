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

// logger.js
const { createLogger, format, transports, addColors } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

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
    debug: 'white',
  }
};

// Adiciona as cores ao Winston para uso no console
addColors(logLevels.colors);

// Formato para o CONSOLE (colorido e simples)
const consoleFormat = format.combine(
  format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss' }),
  format.colorize({ all: true }),
  format.printf(
    (info) => `[${info.timestamp}] ${info.level}: ${info.message}`
  )
);

// Formato para os ARQUIVOS (sem cores, para ser puro texto)
const fileFormat = format.combine(
  format.timestamp({ format: 'DD-MM-YYYY HH:mm:ss' }),
  format.printf(
    (info) => `[${info.timestamp}] ${info.level.toUpperCase()}: ${info.message}`
  )
);

// Transportes (onde os logs serão salvos/exibidos)

const logTransports = [
  // 1. Sempre exibir no console
  new transports.Console({
    format: consoleFormat,
  }),
  
  // 2. Salvar todos os logs em um arquivo diário
  new DailyRotateFile({
    level: 'debug', // Salva desde o nível 'debug' (ou seja, tudo)
    filename: path.join('logs', 'all-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d', // Guarda os logs dos últimos 14 dias
    format: fileFormat,
  }),

  // 3. Salvar apenas os erros em um arquivo separado
  new DailyRotateFile({
    level: 'error', // Salva apenas 'error'
    filename: path.join('logs', 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d', // Guarda os logs de erro dos últimos 30 dias
    format: fileFormat,
  }),
];

// Cria a instância final do logger
const logger = createLogger({
  levels: logLevels.levels,
  transports: logTransports,
  exitOnError: false, // Não finaliza a aplicação em caso de erro no logger
});

module.exports = logger;