// Routes del módulo resenas.
// Exporta dos routers: público (alta/consulta) y admin (moderación).
// server.js monta cada uno bajo su prefijo; el requireAuth del admin se
// aplica al montar (igual que el módulo usuarios).

const express = require('express');

const ctrl = require('./resenas.controller');
const validate = require('../../shared/middleware/validate.middleware');
const { requireAdmin } = require('../../shared/middleware/auth.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const {
  resenaPublicLimiter,
  resenaVerificarLimiter,
} = require('../../shared/middleware/rate-limit.middleware');
const S = require('./resenas.schema');

// ===== Router PÚBLICO — montado en /api/resenas (sin auth) =====
const publicRouter = express.Router();

publicRouter.post(
  '/verificar',
  resenaVerificarLimiter,
  validate({ body: S.verificarSchema }),
  asyncHandler(ctrl.verificar),
);

publicRouter.post(
  '/publico',
  resenaPublicLimiter,
  validate({ body: S.crearPublicaSchema }),
  asyncHandler(ctrl.crearPublica),
);

publicRouter.get('/publicas', asyncHandler(ctrl.listarPublicas));

// ===== Router ADMIN — montado en /api/admin/resenas (requireAuth al montar) =====
// La moderación de reseñas es exclusiva de admin (incluido el listado).
const adminRouter = express.Router();

adminRouter.get('/', requireAdmin, asyncHandler(ctrl.listarAdmin));

adminRouter.put(
  '/:id',
  requireAdmin,
  validate({ params: S.idParamSchema, body: S.moderarSchema }),
  asyncHandler(ctrl.moderar),
);

module.exports = { publicRouter, adminRouter };
