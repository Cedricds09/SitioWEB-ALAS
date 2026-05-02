// Controller — capa fina entre HTTP y service.
// No tiene try/catch (asyncHandler lo cubre).
// No tiene SQL ni reglas de negocio.

const service = require('./presupuestos.service');

// POST /api/presupuestos
async function crear(req, res) {
  const data = await service.crear(req.body, req.session || {});
  res.status(201).json({ ok: true, data });
}

// GET /api/presupuestos
async function listar(req, res) {
  const data = await service.listar(req.query || {}, req.session || {});
  res.json({ ok: true, data });
}

// GET /api/presupuestos/:id
async function obtener(req, res) {
  const data = await service.obtener(req.params.id, req.session || {});
  res.json({ ok: true, data });
}

// PUT /api/presupuestos/:id
async function actualizar(req, res) {
  const data = await service.actualizar(req.params.id, req.body, req.session || {});
  res.json({ ok: true, data });
}

// DELETE /api/presupuestos/:id
async function eliminar(req, res) {
  await service.eliminar(req.params.id, req.session || {});
  res.json({ ok: true });
}

// POST /api/presupuestos/:id/bloques
async function agregarBloque(req, res) {
  const data = await service.agregarBloque(req.params.id, req.body, req.session || {});
  res.status(201).json({ ok: true, data });
}

// PUT /api/presupuestos/:id/bloques/:bloqueId
async function actualizarBloque(req, res) {
  const data = await service.actualizarBloque(
    req.params.id,
    req.params.bloqueId,
    req.body,
    req.session || {},
  );
  res.json({ ok: true, data });
}

// DELETE /api/presupuestos/:id/bloques/:bloqueId
async function eliminarBloque(req, res) {
  await service.eliminarBloque(req.params.id, req.params.bloqueId, req.session || {});
  res.json({ ok: true });
}

// POST /api/presupuestos/:id/bloques/:bloqueId/items
async function agregarItem(req, res) {
  const data = await service.agregarItem(
    req.params.id,
    req.params.bloqueId,
    req.body,
    req.session || {},
  );
  res.status(201).json({ ok: true, data });
}

// PUT /api/presupuestos/:id/bloques/:bloqueId/items/:itemId
async function actualizarItem(req, res) {
  const data = await service.actualizarItem(
    req.params.id,
    req.params.bloqueId,
    req.params.itemId,
    req.body,
    req.session || {},
  );
  res.json({ ok: true, data });
}

// DELETE /api/presupuestos/:id/bloques/:bloqueId/items/:itemId
async function eliminarItem(req, res) {
  await service.eliminarItem(
    req.params.id,
    req.params.bloqueId,
    req.params.itemId,
    req.session || {},
  );
  res.json({ ok: true });
}

// PUT /api/presupuestos/:id/estado
async function cambiarEstado(req, res) {
  const data = await service.cambiarEstado(req.params.id, req.body.estado, req.session || {});
  res.json({ ok: true, data });
}

// POST /api/presupuestos/:id/convertir
async function convertirAServicio(req, res) {
  const result = await service.convertirAServicio(req.params.id, req.session || {});
  res.json(result);
}

module.exports = {
  crear,
  listar,
  obtener,
  actualizar,
  eliminar,
  agregarBloque,
  actualizarBloque,
  eliminarBloque,
  agregarItem,
  actualizarItem,
  eliminarItem,
  cambiarEstado,
  convertirAServicio,
};
