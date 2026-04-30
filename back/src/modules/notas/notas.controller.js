// Controller — capa fina entre HTTP y service.

const service = require('./notas.service');

async function buscar(req, res) {
  console.log(`[NOTAS] GET cliente=${req.params.cliente} validacion=${req.query.validacion}`);
  const data = await service.buscar(req.params.cliente, req.query.validacion);
  res.json({ ok: true, data });
}

module.exports = { buscar };
