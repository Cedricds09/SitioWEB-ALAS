// Routes del módulo ai. Auth interno (igual que presupuestos).

const router = require('express').Router();

const ctrl = require('./ai.controller');
const validate = require('../../shared/middleware/validate.middleware');
const { requireAuth } = require('../../shared/middleware/auth.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const S = require('./ai.schema');

// Todas las rutas requieren sesión.
router.use(requireAuth);

router.post(
  '/sugerir-bloques',
  validate({ body: S.sugerirBloquesSchema }),
  asyncHandler(ctrl.sugerirBloques),
);

// Fase 5 — asistente conversacional
router.post(
  '/chat-presupuesto',
  validate({ body: S.chatPresupuestoSchema }),
  asyncHandler(ctrl.chatPresupuesto),
);

module.exports = router;
