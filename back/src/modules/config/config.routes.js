// Routes del módulo config.

const router = require('express').Router();
const ctrl = require('./config.controller');
const { publicReadLimiter } = require('../../shared/middleware/rate-limit.middleware');

router.get('/', publicReadLimiter, ctrl.obtener);

module.exports = router;
