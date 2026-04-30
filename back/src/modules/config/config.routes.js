// Routes del módulo config.

const router = require('express').Router();
const ctrl = require('./config.controller');

router.get('/', ctrl.obtener);

module.exports = router;
