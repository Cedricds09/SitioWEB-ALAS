// Controller del módulo ai — capa fina entre HTTP y service.
// No tiene try/catch (asyncHandler lo cubre). No tiene SQL ni lógica de negocio.

const service = require('./ai.service');

async function sugerirBloques(req, res) {
  const data = await service.sugerirBloques(req.body, req.session || {});
  res.json({ ok: true, data });
}

async function chatPresupuesto(req, res) {
  const data = await service.chatPresupuesto(req.body, req.session || {});
  res.json({ ok: true, data });
}

async function consultaNegocio(req, res) {
  const data = await service.consultaNegocio(req.body.tipo, req.session || {});
  res.json({ ok: true, data });
}

async function consultaCliente(req, res) {
  const data = await service.consultaCliente(req.body.numero_cliente, req.session || {});
  res.json({ ok: true, data });
}

module.exports = {
  sugerirBloques,
  chatPresupuesto,
  consultaNegocio,
  consultaCliente,
};
