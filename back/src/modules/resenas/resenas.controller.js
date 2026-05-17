// Controller — capa fina entre HTTP y service.
// Sin try/catch (asyncHandler lo cubre), sin SQL ni reglas de negocio.

const service = require('./resenas.service');

// POST /api/resenas/verificar  (público)
async function verificar(req, res) {
  const result = await service.verificarCliente(req.body);
  res.json(result);
}

// POST /api/resenas/publico  (público)
async function crearPublica(req, res) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
  console.log('[RESENAS][PUB] nueva reseña entrante ip=', ip);
  const result = await service.crearPublica(req.body);
  res.status(201).json(result);
}

// GET /api/resenas/publicas  (público)
async function listarPublicas(_req, res) {
  const result = await service.listarPublicas();
  res.json(result);
}

// GET /api/admin/resenas  (requireAuth)
async function listarAdmin(_req, res) {
  const result = await service.listarAdmin();
  res.json(result);
}

// PUT /api/admin/resenas/:id  (requireAdmin)
async function moderar(req, res) {
  const result = await service.moderar(req.params.id, req.body.estado);
  res.json(result);
}

module.exports = {
  verificar,
  crearPublica,
  listarPublicas,
  listarAdmin,
  moderar,
};
