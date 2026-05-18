// Routes del módulo servicios: solo endpoints y middleware.

const router = require('express').Router();

const ctrl = require('./servicios.controller');
const validate = require('../../shared/middleware/validate.middleware');
const { requireAdmin } = require('../../shared/middleware/auth.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const S = require('./servicios.schema');

router.post('/', validate({ body: S.crearServicioSchema }), asyncHandler(ctrl.crear));
router.get('/', validate({ query: S.listarQuerySchema }), asyncHandler(ctrl.listar));
// Rutas literales ANTES de cualquier '/:id' para que no se interpreten como id.
router.get(
  '/calendario',
  validate({ query: S.calendarioQuerySchema }),
  asyncHandler(ctrl.calendario),
);
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
// Programar fecha/hora sin requireAdmin: el service deja pasar al admin o al
// técnico asignado (mismo criterio que /ajuste y /finalizar).
router.put(
  '/:id/programar',
  validate({ params: S.idParamSchema, body: S.programarSchema }),
  asyncHandler(ctrl.programar),
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
