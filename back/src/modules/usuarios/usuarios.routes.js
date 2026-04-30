// Routes del módulo usuarios.
// Todos los endpoints requieren rol admin.
// Orden importante: /tecnicos antes de /:id para que no colisione.

const router = require('express').Router();

const ctrl = require('./usuarios.controller');
const validate = require('../../shared/middleware/validate.middleware');
const { requireAdmin } = require('../../shared/middleware/auth.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const U = require('./usuarios.schema');

router.use(requireAdmin);

router.get('/tecnicos', asyncHandler(ctrl.listarTecnicos));
router.get('/', asyncHandler(ctrl.listar));
router.post('/', validate({ body: U.crearUsuarioSchema }), asyncHandler(ctrl.crear));
router.put(
  '/:id',
  validate({ params: U.idParamSchema, body: U.editarUsuarioSchema }),
  asyncHandler(ctrl.editar),
);
router.put(
  '/:id/password',
  validate({ params: U.idParamSchema, body: U.passwordSchema }),
  asyncHandler(ctrl.cambiarPassword),
);

module.exports = router;
