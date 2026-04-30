// Controller — capa fina entre HTTP y service.

const service = require('./usuarios.service');

async function listarTecnicos(_req, res) {
  const data = await service.listarTecnicos();
  res.json({ ok: true, data });
}

async function listar(_req, res) {
  const data = await service.listar();
  res.json({ ok: true, data });
}

async function crear(req, res) {
  const data = await service.crear(req.body);
  res.status(201).json({ ok: true, data });
}

async function editar(req, res) {
  const sess = req.session || {};
  const data = await service.editar(req.params.id, req.body, sess.uid);
  res.json({ ok: true, data });
}

async function cambiarPassword(req, res) {
  await service.cambiarPassword(req.params.id, req.body.password);
  res.json({ ok: true });
}

module.exports = {
  listarTecnicos,
  listar,
  crear,
  editar,
  cambiarPassword,
};
