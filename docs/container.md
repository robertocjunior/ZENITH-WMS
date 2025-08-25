# Como Executar a Aplicação com Docker

Este guia explica como configurar e executar a aplicação `wms-zenith` em um ambiente de container usando Docker e Docker Compose.

## Pré-requisitos

Certifique-se de que o Docker e o Docker Compose estão instalados na sua máquina ou servidor.

## Estrutura de Arquivos

A configuração para o Docker é feita através de dois arquivos principais na raiz do projeto:

-   `Dockerfile`: Contém as instruções para construir a imagem da sua aplicação Node.js. Ele se baseia na imagem `node:18-alpine` para um ambiente leve e seguro, instala as dependências e configura a execução com PM2.

-   `docker-compose.yml`: Define o serviço de container, incluindo a construção da imagem, mapeamento de portas e, mais importante, o uso do arquivo `.env` para carregar as variáveis de ambiente.

## Configuração do Ambiente (`.env`)

Para rodar a aplicação, é necessário um arquivo `.env` com as variáveis de ambiente. Você pode criar este arquivo com base no `.env.example`.

Preencha os valores para as credenciais da API da Sankhya e a chave secreta JWT:

```dotenv
PORT=3030
NODE_ENV=production

JWT_SECRET=sua_chave_secreta_longa_e_aleatoria_aqui

SANKHYA_API_URL=https://api.sankhya.com.br
SANKHYA_APPKEY=sua_chave_do_aplicativo_sankhya
SANKHYA_USERNAME=seu_usuario_da_api_sankhya
SANKHYA_PASSWORD=sua_senha_do_usuario_da_api
SANKHYA_TOKEN=seu_token_do_aplicativo_sankhya
```

## Comandos Docker

A navegação e o gerenciamento da aplicação são feitos com os seguintes comandos:

### Construir e Iniciar a Aplicação

Este comando constrói a imagem e inicia o container em segundo plano.

```bash
docker-compose up -d
```

### Visualizar os Logs

Para ver os logs em tempo real, use este comando. Pressione `Ctrl + C` para sair dos logs.

```bash
docker-compose logs -f
```

### Parar a Aplicação

Este comando para e remove o container.

```bash
docker-compose down
```

### Gerenciar o Container em Execução

Você pode usar `docker exec` para rodar comandos PM2 dentro do container.

#### Reiniciar o sistema:

```bash
docker-compose exec app pm2 restart wms-zenith
```

#### Verificar o status:

```bash
docker-compose exec app pm2 status
```
