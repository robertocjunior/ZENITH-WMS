<h1 align="center">ZENITH-WMS</h1>
<p align="center">
<img alt="Zenith WMS Logo" src="./docs/zenith.svg">
</p>

<p align="center">
<img alt="Node.js" src="https://img.shields.io/badge/Node.js-18.x-green?style=for-the-badge&logo=node.js">
<img alt="Express" src="https://img.shields.io/badge/Express.js-4.x-black?style=for-the-badge&logo=express">
<img alt="Vite" src="https://img.shields.io/badge/Vite-5.x-purple?style=for-the-badge&logo=vite">
<img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES6+-yellow?style=for-the-badge&logo=javascript">
</p>

ZENITH-WMS é uma aplicação web moderna e responsiva (Progressive Web App - PWA) projetada para o gerenciamento de estoque em armazéns, com integração profunda ao sistema ERP Sankhya. Ele fornece uma interface mobile-first para que operadores realizem tarefas de armazenamento diretamente de qualquer dispositivo com um navegador web.

---

## ✨ Funcionalidades

- **Autenticação Segura**: Login com credenciais do Sankhya, proteção contra força bruta e autorização persistente por dispositivo.
- **Operações de Armazém**:
  - **Consulta de Estoque**: Pesquise por endereço, código de produto ou descrição.
  - **Baixa de Estoque**: Consuma produtos de um endereço específico.
  - **Transferência de Estoque**: Movimente produtos entre endereços, incluindo áreas de picking.
  - **Correção de Quantidade**: Ajuste a quantidade de estoque em um endereço.
- **Dados em Tempo Real**: Todas as operações refletem instantaneamente no banco do Sankhya.
- **Histórico de Operações**: Registro diário das ações do usuário.
- **PWA Responsivo**: Funciona em desktop, tablet e celular, podendo ser instalado na tela inicial.
- **Permissões Baseadas em Funções**: Controle de acesso integrado às permissões do Sankhya.

---

## 🔧 Arquitetura e Tecnologias

**Backend**
- **Node.js & Express**: Servidor robusto que atua como proxy seguro para a API do Sankhya.
- **PM2**: Gerenciador de processos para alta disponibilidade e modo cluster.
- **Autenticação via JWT**: Sessões seguras.
- **Segurança**: Helmet, rate limiting, validação de schemas com Zod.
- **Logging**: Logs persistentes com Winston.

**Frontend**
- **Vanilla JavaScript (ESM)**: SPA leve e moderna.
- **Vite**: Build rápido e otimização para produção.
- **HTML5 & CSS3**: Layout responsivo.

**Banco de Dados**
- Integração direta com o Oracle do Sankhya usando tabelas e triggers personalizadas.

---

## 🚀 Guia de Instalação e Execução

### 1. Pré-requisitos
- Node.js v18+
- npm
- PM2 instalado globalmente (`npm install pm2 -g`)
- Acesso administrativo ao Sankhya e seu banco de dados (Oracle).

### 2. Configuração no Sankhya
- **Dicionário de Dados**:
  - Importar `CODPROD` da tabela `TGFPRO` para `AD_IBXEND` como somente leitura.
  - Criar campo `APP` na `AD_IBXEND` como caixa de seleção, somente leitura (`VARCHAR2(1)`).
- **Importar Metadados de Tela**: Usar os arquivos da pasta `Telas Sankhya`.
- **Triggers**: Executar scripts SQL do diretório `sql/` para integridade e auditoria.
- **Usuário da API**: Criar usuário dedicado com permissões adequadas.
- **Registro da Aplicação**: Obter `appkey` e `token` no cadastro de aplicativo do Sankhya.

### 3. Configuração do Projeto
```bash
git clone https://github.com/robertocjunior/ZENITH-WMS.git
cd ZENITH-WMS
npm install
cp .env.example .env
```
Edite o `.env` com:
- `SANKHYA_API_URL`, `SANKHYA_APPKEY`, `SANKHYA_USERNAME`, `SANKHYA_PASSWORD`, `SANKHYA_TOKEN`, `JWT_SECRET`, `PORT`, `NODE_ENV`.

### 4. Execução

**Desenvolvimento**:
```bash
npm run dev
```
Acesse em `http://localhost:3000`.

**Produção**:
```bash
npm start
```
Gerenciar com:
```bash
pm2 list
npm run logs
npm run stop
npm run restart
```
Configurar reinicialização automática:
```bash
pm2 startup
pm2 save
```
