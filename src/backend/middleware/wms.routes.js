// src/backend/routes/wms.routes.js
const express = require('express');
const { validate } = require('../validationSchemas');
const {
    searchItemsSchema,
    itemDetailsSchema,
    pickingLocationsSchema,
    transactionSchema,
} = require('../validationSchemas');

const { authenticateToken } = require('./authenticateToken');
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