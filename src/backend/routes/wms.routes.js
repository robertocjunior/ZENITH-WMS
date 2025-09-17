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

// src/backend/routes/wms.routes.js
const express = require('express');
const { validate } = require('../validationSchemas');
const {
    searchItemsSchema,
    itemDetailsSchema,
    pickingLocationsSchema,
    transactionSchema,
} = require('../validationSchemas');

const { authenticateToken } = require('../middleware/authenticateToken');
const wmsController = require('../controllers/wms.controller');

const router = express.Router();

// Aplica o middleware de autenticação para todas as rotas deste arquivo
router.use(authenticateToken);

router.post('/get-warehouses', wmsController.getWarehouses);
router.post('/get-permissions', wmsController.getPermissions);
router.post('/search-items', validate(searchItemsSchema), wmsController.searchItems);
router.post('/get-item-details', validate(itemDetailsSchema), wmsController.getItemDetails);
router.post('/get-picking-locations', validate(pickingLocationsSchema), wmsController.getPickingLocations);
router.post('/get-history', wmsController.getHistory);
router.post('/execute-transaction', validate(transactionSchema), wmsController.executeTransaction);

module.exports = router;