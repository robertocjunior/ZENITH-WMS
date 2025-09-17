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

module.exports = {
  apps : [{
    name   : "wms-zenith",
    script : "server.js",
    
    // --- Melhorias para Produção ---

    // Habilita o modo cluster para usar todos os núcleos de CPU disponíveis
    instances: -1,
    exec_mode: "cluster",

    // Reinicia a aplicação se ela atingir 1GB de memória (previne vazamentos de memória)
    max_memory_restart: '1G',

    // Adiciona timestamps aos logs gerados pelo PM2
    log_date_format: 'DD-MM-YYYY HH:mm:ss',

    // Caminho para os arquivos de log
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',

    // Configuração do ambiente de produção
    env_production: {
       "NODE_ENV": "production",
       // Você pode adicionar outras variáveis de ambiente aqui se precisar
       // Ex: "PORT": 8080
    }
  }]
};