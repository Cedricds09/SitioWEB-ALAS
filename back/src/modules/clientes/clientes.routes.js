// Rutas del módulo clientes.

const router = require('express').Router();

const ctrl = require('./clientes.controller');
const validate = require('../../shared/middleware/validate.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const C = require('./clientes.schema');

router.get(
  '/',
  validate({ query: C.buscarQuerySchema }),
  asyncHandler(ctrl.buscar),
);

router.get(
  '/:numero_cliente/historial',
  validate({ params: C.numeroClienteParamSchema }),
  asyncHandler(ctrl.historial),
);

module.exports = router;
