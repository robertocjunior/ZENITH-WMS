# <h1 align="center">ZENITH-WMS</h1>

<p align="center">
  <img alt="Zenith WMS Logo" src="./docs/zenith.svg" width="150">
</p>

<p align="center">
  <strong>ZENITH-WMS</strong> é uma aplicação web moderna e responsiva (PWA) para gerenciamento de estoque em armazéns, com integração profunda ao ERP Sankhya. Ele fornece uma interface mobile-first para que os operadores realizem tarefas comuns de armazenamento diretamente de qualquer dispositivo com um navegador.
</p>

---

## <h2 align="center">✨ Funcionalidades</h2>

* **Autenticação Segura**: Login com credenciais do Sankhya, autorização por dispositivo e proteção contra ataques de força bruta.
* **Operações de Armazém em Tempo Real**:
    * **Consulta de Estoque**: Pesquise por endereço, código de produto ou descrição.
    * **Baixa de Estoque**: Consuma produtos de um endereço.
    * **Transferência de Estoque**: Mova produtos entre endereços distintos.
    * **Picking**: Transfira produtos de uma área de armazenamento para uma área de picking designada.
    * **Correção de Quantidade**: Ajuste o saldo de estoque em um endereço específico.
* **Histórico de Operações**: Visualize um registro de todas as operações realizadas pelo usuário no dia.
* **Progressive Web App (PWA)**: Instale na tela inicial do dispositivo para uma experiência de aplicativo nativo.
* **Controle de Permissões**: O acesso a cada funcionalidade (baixa, transferência, etc.) é controlado por usuário no Sankhya.

## <h2 align="center">🏗️ Arquitetura</h2>

* **Frontend**: Uma Single-Page Application (SPA) construída com **HTML, CSS e JavaScript puros**, utilizando **Vite** para um processo de build otimizado e ofuscado.
* **Backend**: Um servidor **Node.js** com **Express**, que atua como um proxy seguro entre o cliente e a API do Sankhya. Ele gerencia a lógica de negócios, autenticação, logging com Winston, e segurança com Helmet e rate limiting.
* **Banco de Dados**: Interage em tempo real com o banco de dados do ERP Sankhya (Oracle) através de tabelas, procedures e triggers personalizadas para garantir a integridade e auditoria dos dados.

---

## <h2 align="center">🚀 Guia de Implantação e Configuração</h2>

Siga estes passos para configurar e implantar a aplicação ZENITH-WMS em um ambiente de produção.

### Pré-requisitos

* **Node.js** (v18.0.0 ou superior)
* **npm** (ou um gerenciador de pacotes compatível)
* **PM2** instalado globalmente (`npm install -g pm2`)
* Acesso de **administrador** ao sistema Sankhya.
* Acesso ao **banco de dados** do Sankhya (via DBeaver, SQL Developer, etc.).

### Passo 1: Configuração no Sankhya

1.  **Dicionário de Dados:**
    * No "Construtor de Telas", acesse o dicionário da tabela `AD_IBXEND`.
    * **Importe o campo `CODPROD` da tabela `TGFPRO`**. Este passo é crucial para que os gatilhos e procedures do sistema funcionem corretamente.

2.  **Metadados de Tela:**
    * Importe os arquivos de metadados (`.xml`) localizados na pasta `Telas Sankhya` (fornecida com o projeto) para o "Construtor de Telas".

### Passo 2: Configuração do Banco de Dados

Execute os seguintes scripts (localizados na pasta `sql/`) no banco de dados do Sankhya. Eles são essenciais para a lógica da aplicação e a integridade dos dados.

* `TRG_AD_IBXEND_SET_CODPROD.SQL`: Preenche o `CODPROD` na tabela de itens da transação.
* `TRG_BLOCK_DELETE_AD_HISTENDAPP.SQL`: Impede a exclusão de registros do histórico para auditoria.
* `TRG_IMPEDE_DUPLICADO_CODARM.SQL`: Garante que um armazém seja único na tabela de permissões.
* `TRG_IMPEDE_DUPLICADO_CODUSU.SQL`: Garante que um usuário seja único na tabela de permissões.

### Passo 3: Credenciais da API no Sankhya

1.  **Criar Usuário da API:** Crie um usuário dedicado no Sankhya que será usado pelo backend para se conectar à API.
2.  **Registrar Aplicação:** Na tela "Cadastro de Aplicativo", registre a aplicação para obter uma **Chave de Aplicativo (`appkey`)** e um **Token (`token`)**.

### Passo 4: Configuração do Servidor

1.  **Clone o Repositório:**
    ```bash
    git clone [https://github.com/robertocjunior/ZENITH-WMS.git](https://github.com/robertocjunior/ZENITH-WMS.git)
    cd ZENITH-WMS
    ```

2.  **Instale as Dependências:**
    ```bash
    npm install
    ```

3.  **Crie o Arquivo de Variáveis de Ambiente:**
    Copie o arquivo de exemplo `.env.example` para criar seu arquivo de configuração.
    ```bash
    cp .env.example .env
    ```

4.  **Configure o arquivo `.env`:**
    Abra o arquivo `.env` e preencha com as credenciais obtidas nos passos anteriores.

    ```env
    # URL da API Sankhya (Ex: [https://sankhya.suaempresa.com/mge](https://sankhya.suaempresa.com/mge))
    SANKHYA_API_URL=

    # Credenciais da Aplicação (obtidas no Passo 3)
    SANKHYA_APPKEY=
    SANKHYA_TOKEN=

    # Credenciais do Usuário de API (obtidas no Passo 3)
    SANKHYA_USERNAME=
    SANKHYA_PASSWORD=

    # Chave secreta para assinar os tokens de sessão (JWT)
    # Gere uma chave segura e aleatória.
    JWT_SECRET=

    # Porta e Ambiente do Servidor
    PORT=3000
    NODE_ENV=production
    ```

### Passo 5: Executando a Aplicação

#### Para Desenvolvimento

Use este comando para iniciar o servidor em modo de desenvolvimento. A aplicação estará disponível em `http://localhost:3000`.

```bash
npm start
```

#### Para Produção com PM2

Os scripts a seguir foram configurados no `package.json` para facilitar o gerenciamento do ciclo de vida da aplicação em produção.

1.  **Redeploy (Reimplantação Completa):**
    Este é o comando recomendado para a implantação inicial ou para atualizar a aplicação. Ele para a versão antiga, deleta o processo, constrói a nova versão e a inicia em modo cluster.
    ```bash
    npm run prod:redeploy
    ```

2.  **Comandos de Gerenciamento:**
    Use os seguintes scripts para gerenciar o serviço sem fazer um redeploy completo.

    * **Iniciar Serviço (se estiver parado):**
        ```bash
        npm run prod:start
        ```
    * **Parar Serviço:**
        ```bash
        npm run prod:stop
        ```
    * **Reiniciar Serviço (útil após alterar o `.env`):**
        ```bash
        npm run prod:restart
        ```
    * **Visualizar Logs em Tempo Real:**
        ```bash
        npm run prod:logs
        ```
    * **Remover Serviço da Lista do PM2:**
        ```bash
        npm run prod:delete
        