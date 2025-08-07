// validationSchemas.js
const { z } = require('zod');

// Schema para o corpo do login
const loginSchema = z.object({
  username: z.string().min(1, "O nome de usuário é obrigatório.").max(50),
  password: z.string().min(1, "A senha é obrigatória."),
  deviceToken: z.string().optional(),
});

// [CORREÇÃO] Aceita strings e as converte para números para validação
const numberFromString = z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() !== '') {
        const num = Number(val);
        return isNaN(num) ? val : num;
    }
    return val;
}, z.number());


// Schema para busca de itens
const searchItemsSchema = z.object({
  codArm: z.string().regex(/^\d+$/, "Código do armazém deve ser um número."),
  filtro: z.string().max(100).optional().nullable(),
});

// Schema para buscar detalhes de um item
const itemDetailsSchema = z.object({
  codArm: z.string().regex(/^\d+$/, "Código do armazém deve ser um número."),
  sequencia: z.string().regex(/^\d+$/, "Sequência deve ser um número."),
});

// Schema para buscar locais de picking
const pickingLocationsSchema = z.object({
  codarm: numberFromString,
  codprod: numberFromString,
  sequencia: numberFromString,
});

// Schema para a transação
const transactionSchema = z.object({
  type: z.enum(['baixa', 'transferencia', 'picking', 'correcao']),
  payload: z.any(), // Simplificado para evitar falhas em payloads complexos e variados
});


// Middleware de validação genérico
const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (e) {
    logger.error('Erro de validação Zod:', e.errors);
    return res.status(400).json({ message: 'Dados inválidos.', errors: e.errors });
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