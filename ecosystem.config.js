module.exports = {
  apps : [{
    name   : "wms-zenith",
    script : "server.js",
    env_production: {
       "NODE_ENV": "production"
    }
  }]
};