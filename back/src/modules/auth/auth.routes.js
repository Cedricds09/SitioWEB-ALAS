// Rutas del módulo auth.

const router = require('express').Router();

const ctrl = require('./auth.controller');
const validate = require('../../shared/middleware/validate.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const {
  loginLimiter,
  checkLimiter,
  logoutLimiter,
} = require('../../shared/middleware/rate-limit.middleware');
const A = require('./auth.schema');

router.post('/login', loginLimiter, validate({ body: A.loginSchema }), asyncHandler(ctrl.login));
router.post('/logout', logoutLimiter, ctrl.logout);
router.get('/check', checkLimiter, ctrl.check);

module.exports = router;
