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

// Coerción defensiva a entero positivo, o undefined (la ruta admin no valida
// query). Mantiene la paginación como opt-in sin introducir un schema nuevo.
function posIntOrUndef(v) {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// GET /api/admin/resenas  (requireAuth) — page/limit opcionales (opt-in).
async function listarAdmin(req, res) {
  const page = posIntOrUndef(req.query.page);
  const limit = Math.min(posIntOrUndef(req.query.limit) || 0, 200) || undefined;
  const result = await service.listarAdmin(req.session, { page, limit });
  res.json(result);
}

// PUT /api/admin/resenas/:id  (requireAdmin)
async function moderar(req, res) {
  const result = await service.moderar(req.params.id, req.body.estado, req.session);
  res.json(result);
}

module.exports = {
  verificar,
  crearPublica,
  listarPublicas,
  listarAdmin,
  moderar,
};
