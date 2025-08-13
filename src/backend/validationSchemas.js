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