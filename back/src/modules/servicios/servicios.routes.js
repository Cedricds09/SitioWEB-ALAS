// Routes del módulo servicios.
// Solo declara endpoints + middleware. Nada más.

const router = require('express').Router();

const ctrl = require('./servicios.controller');
const validate = require('../../shared/middleware/validate.middleware');
const { requireAdmin } = require('../../shared/middleware/auth.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const S = require('./servicios.schema');

router.post('/', validate({ body: S.crearServicioSchema }), asyncHandler(ctrl.crear));
router.get('/', validate({ query: S.listarQuerySchema }), asyncHandler(ctrl.listar));
router.get(
  '/cliente/:numero_cliente',
  validate({ params: S.numeroClienteParamSchema }),
  asyncHandler(ctrl.historial),
);
router.put(
  '/:id',
  requireAdmin,
  validate({ params: S.idParamSchema, body: S.editarServicioSchema }),
  asyncHandler(ctrl.editar),
);
router.delete(
  '/:id',
  requireAdmin,
  validate({ params: S.idParamSchema }),
  asyncHandler(ctrl.eliminar),
);
router.put(
  '/:id/asignar',
  requireAdmin,
  validate({ params: S.idParamSchema, body: S.asignarSchema }),
  asyncHandler(ctrl.asignar),
);
router.put(
  '/:id/ajuste',
  validate({ params: S.idParamSchema, body: S.ajusteSchema }),
  asyncHandler(ctrl.actualizarAjuste),
);
router.post(
  '/:id/finalizar',
  validate({ params: S.idParamSchema, body: S.finalizarSchema }),
  asyncHandler(ctrl.finalizar),
);
router.post(
  '/:id/reabrir',
  requireAdmin,
  validate({ params: S.idParamSchema }),
  asyncHandler(ctrl.reabrir),
);
router.get(
  '/:id/nota',
  validate({ params: S.idParamSchema }),
  asyncHandler(ctrl.obtenerNota),
);
router.get(
  '/:id/reporte',
  validate({ params: S.idParamSchema }),
  asyncHandler(ctrl.reporte),
);

module.exports = router;
