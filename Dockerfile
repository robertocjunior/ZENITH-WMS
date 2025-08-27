# Usa a imagem oficial do Node.js baseada em Alpine [cite: 1]
FROM node:18-alpine

# Define o diretório de trabalho dentro do container [cite: 1]
WORKDIR /app

# Copia os arquivos de definição de pacotes primeiro
# Isso otimiza o cache do Docker, para não reinstalar tudo a cada build
COPY package*.json ./

# Instala as dependências do projeto [cite: 1]
RUN npm install

# Copia todo o resto do código do projeto para o diretório de trabalho
COPY . .

# Expõe a porta que a aplicação vai utilizar 
EXPOSE 3030

# Instala o PM2 globalmente e inicia a aplicação 
RUN npm install pm2 -g
CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]