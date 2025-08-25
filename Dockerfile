# Usa a imagem oficial do Node.js baseada em Alpine, que é menor e mais segura
FROM node:18-alpine

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de pacotes para o diretório de trabalho
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install

# Copia todos os outros arquivos do projeto para o diretório de trabalho
COPY . .

# Expõe a porta que a aplicação vai utilizar
EXPOSE 3030

# Instala o PM2 globalmente e inicia a aplicação usando o pm2-runtime
RUN npm install pm2 -g
CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]