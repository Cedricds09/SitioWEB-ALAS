// Compat shim — re-exporta el pool migrado.
// Los módulos no migrados (back/routes/*.js) siguen importando `require('../db')`
// y obtienen el mismo singleton que el código nuevo en src/.
//
// Cuando todos los módulos estén migrados, este archivo se puede borrar.

module.exports = require('./src/shared/db/pool');
