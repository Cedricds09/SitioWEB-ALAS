// Controller — capa fina entre HTTP y service.
// No tiene try/catch (asyncHandler lo cubre).
// No tiene SQL ni reglas de negocio.

const service = require('./presupuestos.service');
const { generarPresupuestoPdf } = require('../../shared/integrations/pdf-presupuesto.service');

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

// POST /api/presupuestos/:id/reasignar  (admin only)
async function reasignar(req, res) {
  const data = await service.reasignar(req.params.id, req.body.asignado_a, req.session || {});
  res.json({ ok: true, data });
}

// POST /api/presupuestos/:id/convertir
async function convertirAServicio(req, res) {
  const result = await service.convertirAServicio(req.params.id, req.session || {});
  res.json(result);
}

// GET /api/presupuestos/:id/pdf (requireAuth)
async function descargarPdf(req, res) {
  const presupuesto = await service.obtener(req.params.id, req.session || {});
  const filename = `${presupuesto.numero_presupuesto || 'presupuesto'}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  console.log('[PDF] presupuesto id=', presupuesto.id, 'numero=', presupuesto.numero_presupuesto);
  generarPresupuestoPdf(res, presupuesto);
}

// POST /api/presupuestos/solicitud (público, sin auth)
async function crearSolicitudPublica(req, res) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
  console.log('[PRES][PUB] solicitud entrante ip=', ip);

  const result = await service.crearSolicitudPublica(req.body);

  // WhatsApp pre-armado (cliente sin telefono backend → abre selector de contacto).
  const tel = String(req.body.cliente_telefono || '').replace(/\D/g, '');
  const waBase = 'https://wa.me/525531675824';
  const waText = encodeURIComponent(
    `Hola ALAS, soy ${req.body.cliente_nombre}.\n` +
    `Acabo de enviar una solicitud de cotización para: ${req.body.tipo_servicio}.\n` +
    `Mi tel: ${tel || '(no proporcionado)'}.\n` +
    `Detalle: ${req.body.descripcion_inicial}`,
  );
  const whatsapp_url = `${waBase}?text=${waText}`;

  res.json({
    ok: true,
    mensaje: 'Solicitud recibida. Te contactaremos a la brevedad.',
    whatsapp_url,
    presupuesto_id: result.id || null,
    numero_presupuesto: result.numero_presupuesto || null,
  });
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
  reasignar,
  descargarPdf,
  crearSolicitudPublica,
};
