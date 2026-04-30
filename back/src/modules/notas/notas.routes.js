// Routes del módulo notas.

const router = require('express').Router();

const ctrl = require('./notas.controller');
const validate = require('../../shared/middleware/validate.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const N = require('./notas.schema');

router.get(
  '/:cliente',
  validate({ params: N.buscarParamSchema, query: N.buscarQuerySchema }),
  asyncHandler(ctrl.buscar),
);

module.exports = router;
