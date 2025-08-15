module.exports = {
  apps : [{
    name   : "wms-zenith",
    script : "server.js",
    
    // --- Melhorias para Produção ---

    // Habilita o modo cluster para usar todos os núcleos de CPU disponíveis
    instances: "max",
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
       "PORT": 3000
    }
  }]
};