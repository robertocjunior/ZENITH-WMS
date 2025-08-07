module.exports = {
  apps : [{
    name   : "wms-zenith",
    script : "./server.js",
    instances: "max", // Executa uma instância por núcleo de CPU
    exec_mode: "cluster", // Ativa o modo cluster para melhor performance e resiliência
    autorestart: true, // Reinicia automaticamente se a aplicação falhar
    watch: false, // Desativado, pois o build é manual
    max_memory_restart: '1G', // Reinicia se a aplicação usar mais de 1GB de RAM
    env_production: {
      "NODE_ENV": "production",
      "PORT": 3000
    },
    env_development: {
      "NODE_ENV": "development"
    }
  }]
};