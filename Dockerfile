# Dockerfile

# Usa a imagem oficial do Node.js baseada em Alpine
FROM node:18-alpine

# Instala o Git para poder clonar o repositório
RUN apk add --no-cache git

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Declara um argumento de build que receberá o token do GitHub
ARG GITHUB_TOKEN

# Clona o repositório privado usando o token e vai para a branch correta
# Se o GITHUB_TOKEN não for passado, o build irá falhar.
RUN git clone https://${GITHUB_TOKEN}@github.com/robertocjunior/ZENITH-WMS.git --branch container-docker .

# Instala as dependências do projeto
RUN npm install

# Expõe a porta que a aplicação vai utilizar
EXPOSE 3030

# Instala o PM2 globalmente e inicia a aplicação
RUN npm install pm2 -g
CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]