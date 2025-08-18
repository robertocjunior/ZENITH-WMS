# Documentação da API - ZENITH WMS

Esta é a documentação para a API do sistema ZENITH-WMS. A API é utilizada para autenticação de usuários e para a realização de operações de estoque, comunicando-se diretamente com o ERP Sankhya.

**URL Base da API:** `http://localhost:3030/api`

---

## 1. Autenticação

A autenticação é baseada em sessão, utilizando um cookie `sessionToken` (JWT) que é gerado após um login bem-sucedido.

### Login de Usuário

Autentica um usuário com base nas credenciais do Sankhya e registra/valida o dispositivo.

- **Endpoint:** `POST /login`
- **URL Completa:** `http://localhost:3030/api/login`

**Corpo da Requisição (`application/json`)**

```json
{
    "username": "seu_usuario_sankhya",
    "password": "sua_senha_sankhya",
    "deviceToken": "um_identificador_unico_do_dispositivo"
}
```

**Parâmetros do Corpo**

| Parâmetro   | Tipo   | Obrigatório | Descrição                                                 |
| :---------- | :----- | :---------- | :-------------------------------------------------------- |
| `username`  | string | Sim         | Nome de usuário do Sankhya.                               |
| `password`  | string | Sim         | Senha do usuário do Sankhya.                              |
| `deviceToken`| string | Sim         | Um hash ou ID único que identifica o dispositivo.         |

**Respostas**

- **`200 OK` (Sucesso)**
  - O login foi bem-sucedido.
  - Um cookie `sessionToken` será enviado no cabeçalho da resposta (`Set-Cookie`). Clientes como o Postman ou navegadores irão armazená-lo e enviá-lo automaticamente nas próximas requisições.

- **`401 Unauthorized` (Credenciais Inválidas)**
  ```json
  {
      "message": "Usuário ou senha inválidos."
  }
  ```

- **`403 Forbidden` (Dispositivo Inativo)**
  ```json
  {
      "message": "Este dispositivo está registrado, mas não está ativo.",
      "deviceToken": "o_device_token_enviado"
  }
  ```

### Logout de Usuário

Invalida a sessão atual do usuário.

- **Endpoint:** `POST /logout`
- **URL Completa:** `http://localhost:3030/api/logout`
- **Autenticação:** Requer o envio do cookie `sessionToken` obtido no login.
- **Corpo da Requisição:** Vazio.

**Resposta**

- **`200 OK` (Sucesso)**
  ```json
  {
      "message": "Logout realizado com sucesso."
  }
  ```
  - O cookie `sessionToken` será removido do navegador/cliente.

---

## 2. Operações de Armazém

Todas as rotas a seguir são protegidas e exigem que o cookie `sessionToken` seja enviado na requisição.

*(Nota: Os endpoints exatos abaixo são exemplos baseados nas funcionalidades do sistema. Adapte-os conforme os nomes definidos no seu arquivo `wms.routes.js`)*

### Consultar Estoque

Busca informações de estoque em um determinado armazém.

- **Endpoint:** `GET /estoque`
- **Exemplo de URL:** `http://localhost:3030/api/estoque?armazem=1&busca=produto`

**Parâmetros de Query**

| Parâmetro | Obrigatório | Descrição                                                       |
| :-------- | :---------- | :---------------------------------------------------------------- |
| `armazem` | Sim         | ID do armazém a ser consultado.                                   |
| `busca`   | Não         | Termo para filtrar por descrição ou código do produto/endereço. |

**Resposta de Sucesso (`200 OK`)**

```json
[
    {
        "endereco": "A01-B02-C03",
        "codProd": 1010,
        "descricao": "PRODUTO EXEMPLO A",
        "estoque": 150.0
    },
    {
        "endereco": "A01-B02-C04",
        "codProd": 1011,
        "descricao": "PRODUTO EXEMPLO B",
        "estoque": 75.5
    }
]
```

### Realizar Baixa de Estoque

Consome uma quantidade de um produto em um endereço específico.

- **Endpoint:** `POST /estoque/baixa`
- **URL Completa:** `http://localhost:3030/api/estoque/baixa`

**Corpo da Requisição (`application/json`)**

```json
{
    "endereco": "A01-B02-C03",
    "codProd": 1010,
    "quantidade": 10.0
}
```

**Resposta de Sucesso (`200 OK`)**

```json
{
    "message": "Baixa realizada com sucesso."
}
```