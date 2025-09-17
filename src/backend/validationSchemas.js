/**
 * Copyright (c) 2025 Roberto Casali Junior. Todos os Direitos Reservados.
 *
 * AVISO DE PROPRIEDADE E CONFIDENCIALIDADE
 *
 * Este código-fonte é propriedade intelectual confidencial e proprietária de
 * Roberto Casali Junior. Seu uso, cópia, modificação, distribuição ou execução
 * são estritamente proibidos sem a autorização prévia, expressa e por escrito
 * do autor.
 *
 * Este software é regido pelos termos e condições estabelecidos no Contrato de
 * Licença de Usuário Final (EULA) que o acompanha. A violação destes termos
 * constitui uma infração à lei de direitos autorais (Lei nº 9.610/98) e
 * sujeitará o infrator às sanções aplicáveis.
 */

// src/backend/validationSchemas.js
const { z } = require('zod');

const loginSchema = z.object({
  username: z.string().min(1, "O nome de usuário é obrigatório.").max(50),
  password: z.string().min(1, "A senha é obrigatória."),
  deviceToken: z.string().nullable().optional(), // Adicionado .nullable() aqui
});

const numberFromString = z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() !== '') {
        const num = Number(val);
        return isNaN(num) ? val : num;
    }
    return val;
}, z.number());

const searchItemsSchema = z.object({
  codArm: z.string().regex(/^\d+$/, "Código do armazém deve ser um número."),
  filtro: z.string().max(100).optional().nullable(),
});

const itemDetailsSchema = z.object({
  codArm: z.string().regex(/^\d+$/, "Código do armazém deve ser um número."),
  sequencia: z.string().regex(/^\d+$/, "Sequência deve ser um número."),
});

const pickingLocationsSchema = z.object({
  codarm: numberFromString,
  codprod: numberFromString,
  sequencia: numberFromString,
});

const transactionSchema = z.object({
  type: z.enum(['baixa', 'transferencia', 'picking', 'correcao']),
  payload: z.any(),
});

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (err) {
    // Passa o erro para o middleware de tratamento de erros
    next(err);
  }
};

module.exports = {
  validate,
  loginSchema,
  searchItemsSchema,
  itemDetailsSchema,
  pickingLocationsSchema,
  transactionSchema,
};