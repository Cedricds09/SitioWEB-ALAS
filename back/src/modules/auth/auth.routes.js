// Routes del módulo auth.

const router = require('express').Router();

const ctrl = require('./auth.controller');
const validate = require('../../shared/middleware/validate.middleware');
const asyncHandler = require('../../shared/middleware/async-handler');
const A = require('./auth.schema');

router.post('/login', validate({ body: A.loginSchema }), asyncHandler(ctrl.login));
router.post('/logout', ctrl.logout);
router.get('/check', ctrl.check);

module.exports = router;
