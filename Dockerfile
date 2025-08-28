# Dockerfile

# Usa uma imagem LTS mais recente e segura do Node.js
FROM node:20-alpine

# Instala o Git para poder clonar o repositório
RUN apk add --no-cache git

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Declara um argumento de build que receberá o token do GitHub
ARG GITHUB_TOKEN

# Clona o repositório, busca todas as alterações e atualiza para a versão mais recente da branch.
RUN git clone https://${GITHUB_TOKEN}@github.com/robertocjunior/ZENITH-WMS.git --branch main . && git fetch --all && git reset --hard origin/main

# Instala as dependências do projeto
RUN npm install

# Expõe a porta que a aplicação vai utilizar
EXPOSE 3080

# Instala o PM2 globalmente e inicia a aplicação
RUN npm install pm2 -g
CMD ["pm2-runtime", "ecosystem.config.js"]