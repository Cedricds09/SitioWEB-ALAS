// Capa fina entre HTTP y el service.

const service = require('./notas.service');

async function buscar(req, res) {
  // No loguear validacion (es teléfono del cliente — PII).
  console.log(`[NOTAS] GET cliente=${req.params.cliente}`);
  const data = await service.buscar(req.params.cliente, req.query.validacion);
  res.json({ ok: true, data });
}

module.exports = { buscar };
