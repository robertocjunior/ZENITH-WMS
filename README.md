# <h1 align="center">ZENITH-WMS</h1>

<img alt="gpt-oss-120" src="./docs/zenith.svg">

ZENITH-WMS é uma aplicação web moderna e responsiva (Progressive Web App - PWA) projetada para o gerenciamento de estoque em armazéns, com integração profunda ao sistema ERP Sankhya. Ele fornece uma interface mobile-first para que os operadores realizem tarefas comuns de armazenamento diretamente de qualquer dispositivo com um navegador web.

##  <h2 align="center">✨ Funcionalidades</h2>

*   **Autenticação Segura**: Login de usuário com credenciais do Sankhya, com proteção contra força bruta e autorização de dispositivos.
*   **Operações de Armazém**:
    *   **Consulta de Estoque**: Pesquise e visualize o estoque por endereço, código de produto ou descrição.
    *   **Baixa de Estoque**: Consuma ou dê baixa em produtos de um endereço específico.
    *   **Transferência de Estoque**: Mova produtos entre diferentes endereços, incluindo para áreas de picking designadas.
    *   **Correção de Quantidade**: Ajuste a quantidade de estoque em um endereço.
*   **Dados em Tempo Real**: Todas as operações são realizadas em tempo real no banco de dados do Sankhya.
*   **Histórico de Operações**: Visualize um registro de todas as operações realizadas pelo usuário durante o dia atual.
*   **PWA Responsivo**: Funciona em qualquer dispositivo (desktop, tablet, celular) e pode ser "instalado" na tela inicial para uma experiência semelhante a um aplicativo nativo.
*   **Permissões Baseadas em Funções**: O acesso às funcionalidades (baixa, transferência, etc.) é controlado por permissões de usuário configuradas no Sankhya.

## <h2 align="center">🏗️ Arquitetura</h2>

O projeto segue uma arquitetura cliente-servidor:

*   **Frontend**: Uma Single-Page Application (SPA) construída com HTML, CSS e JavaScript puros. Utiliza **Vite** para um processo de desenvolvimento e build eficiente.
*   **Backend**: Um servidor **Node.js** usando o framework **Express**. Ele atua como um proxy seguro entre a aplicação cliente e a API do Sankhya, tratando da lógica de negócios, autenticação e medidas de segurança como limitação de taxa (rate limiting) e Content Security Policy (CSP).
*   **Banco de Dados**: Interage diretamente com o banco de dados do ERP Sankhya (Oracle) através de tabelas e triggers personalizadas para garantir a integridade dos dados e a auditoria.

---

## <h2 align="center">🚀 Guia de Preparação do Ambiente</h2>

Siga estes passos para configurar e implantar a aplicação ZENITH-WMS.

### Pré-requisitos

*   Node.js (v18.0.0 ou superior)
*   npm (ou yarn)
*   Acesso ao sistema Sankhya com privilégios administrativos.
*   Acesso ao banco de dados do Sankhya (ex: usando um cliente como DBeaver ou SQL Developer).

### Passo 1: Configuração no Sankhya

Antes de implantar a aplicação, algumas configurações são necessárias dentro do ERP Sankhya.

1.  **Dicionário de Dados (Construtor de Telas):**
    *   Navegue até o "Construtor de Telas" no Sankhya.
    *   Acesse o dicionário da tabela `AD_IBXEND`.
    *   **Importe o campo `CODPROD` da tabela `TGFPRO`**. Isso garante que a relação entre a tabela de itens da transação (`AD_IBXEND`) e a tabela de produtos (`TGFPRO`) seja corretamente estabelecida nos metadados do Sankhya. Este passo é crucial para que os gatilhos e procedimentos do sistema funcionem corretamente.

2.  **Importação de Metadados de Tela (Construtor de Telas):**
    *   O projeto requer telas e configurações personalizadas no Sankhya. Você deve **importar os arquivos de metadados** localizados na pasta **`Telas Sankhya`** (esta pasta deve ser fornecida junto com o código-fonte do projeto) para o "Construtor de Telas".

### Passo 2: Configuração do Banco de Dados

Os seguintes gatilhos (triggers) devem ser criados no banco de dados do Sankhya. Eles são essenciais para a lógica da aplicação e a integridade dos dados. Execute os scripts encontrados no diretório `sql/` deste projeto.

*   `TRG_AD_IBXEND_SET_CODPROD.SQL`: Preenche automaticamente o campo `CODPROD` na tabela `AD_IBXEND` quando um novo registro de transação é criado, com base no armazém e na sequência do endereço.
*   `TRG_BLOCK_DELETE_AD_HISTENDAPP.SQL`: Impede a exclusão de registros da tabela de histórico de operações (`AD_HISTENDAPP`) para manter uma trilha de auditoria completa.
*   `TRG_IMPEDE_DUPLICADO_CODARM.SQL`: Garante que um armazém só possa ser atribuído uma vez na tabela de permissões (`AD_PERMEND`).
*   `TRG_IMPEDE_DUPLICADO_CODUSU.SQL`: Garante que um usuário só possa ter um conjunto de permissões na tabela de permissões do aplicativo (`AD_APPPERM`).

### Passo 3: Usuário da API e Registro da Aplicação

O servidor backend precisa de suas próprias credenciais para se comunicar com a API do Sankhya.

1.  **Criar Usuário da API:** Crie um usuário dedicado dentro do Sankhya para a API. Este usuário precisa de permissões para fazer login via API e executar os serviços usados no `server.js` (ex: `DbExplorerSP.executeQuery`, `ActionButtonsSP.executeScript`, etc.).
2.  **Registrar Aplicação:** Registre uma nova aplicação na tela "Cadastro de Aplicativo" do Sankhya para obter uma **Chave de Aplicativo** (`appkey`) e um **Token** (`token`).

### Passo 4: Configuração do Servidor da Aplicação

1.  **Clone o Repositório:**
    ```bash
    git clone https://github.com/robertocjunior/ZENITH-WMS.git
    cd ZENITH-WMS
    ```

2.  **Instale as Dependências:**
    ```bash
    npm install
    ```

3.  **Crie o Arquivo de Configuração:**
    Crie um arquivo `.env` na raiz do projeto. Você pode copiar o arquivo `.env.example`:
    ```bash
    cp .env.example .env
    ```

4.  **Configure as Variáveis de Ambiente:**
    Abra o arquivo `.env` e preencha os valores obtidos nos passos anteriores.

    *   `SANKHYA_API_URL`: A URL base da sua API Sankhya (ex: `https://sankhya.minhaempresa.com/mge`).
    *   `SANKHYA_APPKEY`: A Chave de Aplicativo obtida do Sankhya.
    *   `SANKHYA_USERNAME`: O nome de usuário do usuário dedicado da API.
    *   `SANKHYA_PASSWORD`: A senha do usuário dedicado da API.
    *   `SANKHYA_TOKEN`: O Token obtido do Sankhya.
    *   `JWT_SECRET`: Uma string longa, aleatória e secreta para assinar os tokens de sessão. Você pode gerar uma usando o script Python incluído:
        ```bash
        python generatekeys.py
        # Escolha a opção 1 e copie a chave gerada
        ```
    *   `PORT`: A porta na qual o servidor será executado (o padrão é `3000`).
    *   `NODE_ENV`: Defina como `production` para implantação, ou `development` para testes locais.

### Passo 5: Executando a Aplicação

**Para Desenvolvimento:**
Para executar o servidor em modo de desenvolvimento:
```bash
npm start
```
O servidor será iniciado e você poderá acessar a aplicação em `http://localhost:3000`.

**Para Produção:**
O projeto está configurado para ser implantado usando o **PM2**, um gerenciador de processos para Node.js.

1.  **Compile o Frontend:**
    Este comando compila e minifica os arquivos do frontend na pasta `dist/`.
    ```bash
    npm run build
    ```

2.  **Implante com PM2:**
    O script `redeploy` cuida de tudo: ele limpa os logs antigos, deleta o processo anterior, compila o projeto novamente e inicia um novo processo em modo de produção usando o arquivo `ecosystem.config.js`.
    ```bash
    npm run redeploy
    ```

    Você pode gerenciar o processo usando comandos padrão do PM2:
    ```bash
    pm2 list
    pm2 stop wms-zenith
    pm2 restart wms-zenith
    pm2 logs wms-zenith
    ```