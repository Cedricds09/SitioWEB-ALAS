// Routes del módulo presupuestos.

const router = require('express').Router();

const ctrl = require('./presupuestos.controller');
const validate = require('../../shared/middleware/validate.middleware');
const { requireAuth, requireAdmin } = require('../../shared/middleware/auth.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const {
  publicSolicitudLimiter,
  presupuestosLimiter,
} = require('../../shared/middleware/rate-limit.middleware');
const S = require('./presupuestos.schema');

// ===== PÚBLICO (sin auth, con rate limit + honeypot dentro del service) =====
router.post(
  '/solicitud',
  publicSolicitudLimiter,
  validate({ body: S.crearSolicitudPublicaSchema }),
  asyncHandler(ctrl.crearSolicitudPublica),
);

// ===== PROTEGIDO (requiere sesión) =====
router.use(requireAuth);
// Cap de seguridad por usuario para todos los endpoints autenticados. Holgado
// (la edición es muy granular) pero frena creación/borrado masivo o enumeración.
router.use(presupuestosLimiter);

// Header
router.post(
  '/',
  validate({ body: S.crearPresupuestoSchema }),
  asyncHandler(ctrl.crear),
);
router.get(
  '/',
  validate({ query: S.listarQuerySchema }),
  asyncHandler(ctrl.listar),
);
router.get(
  '/:id',
  validate({ params: S.idParamSchema }),
  asyncHandler(ctrl.obtener),
);
router.put(
  '/:id',
  validate({ params: S.idParamSchema, body: S.actualizarPresupuestoSchema }),
  asyncHandler(ctrl.actualizar),
);
router.delete(
  '/:id',
  validate({ params: S.idParamSchema }),
  asyncHandler(ctrl.eliminar),
);

// Bloques
router.post(
  '/:id/bloques',
  validate({ params: S.idParamSchema, body: S.agregarBloqueSchema }),
  asyncHandler(ctrl.agregarBloque),
);
router.put(
  '/:id/bloques/:bloqueId',
  validate({ params: S.bloqueIdParamSchema, body: S.actualizarBloqueSchema }),
  asyncHandler(ctrl.actualizarBloque),
);
router.delete(
  '/:id/bloques/:bloqueId',
  validate({ params: S.bloqueIdParamSchema }),
  asyncHandler(ctrl.eliminarBloque),
);

// Items dentro de bloques tipo seccion_items
router.post(
  '/:id/bloques/:bloqueId/items',
  validate({ params: S.bloqueIdParamSchema, body: S.agregarItemSchema }),
  asyncHandler(ctrl.agregarItem),
);
router.put(
  '/:id/bloques/:bloqueId/items/:itemId',
  validate({ params: S.itemIdParamSchema, body: S.actualizarItemSchema }),
  asyncHandler(ctrl.actualizarItem),
);
router.delete(
  '/:id/bloques/:bloqueId/items/:itemId',
  validate({ params: S.itemIdParamSchema }),
  asyncHandler(ctrl.eliminarItem),
);

// Workflow
router.put(
  '/:id/estado',
  validate({ params: S.idParamSchema, body: S.cambiarEstadoSchema }),
  asyncHandler(ctrl.cambiarEstado),
);

// Reasignación (admin only)
router.post(
  '/:id/reasignar',
  requireAdmin,
  validate({ params: S.idParamSchema, body: S.reasignarSchema }),
  asyncHandler(ctrl.reasignar),
);
router.post(
  '/:id/convertir',
  validate({ params: S.idParamSchema }),
  asyncHandler(ctrl.convertirAServicio),
);

// PDF
router.get(
  '/:id/pdf',
  validate({ params: S.idParamSchema }),
  asyncHandler(ctrl.descargarPdf),
);

module.exports = router;
