// Controller — capa fina entre HTTP y service.

const service = require('./clientes.service');

async function buscar(req, res) {
  const data = await service.buscar({ q: req.query.q, limit: req.query.limit });
  res.json({ ok: true, data });
}

module.exports = { buscar };
