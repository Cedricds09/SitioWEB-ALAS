// Controller — capa fina entre HTTP y service.
// No tiene try/catch (el asyncHandler lo cubre).
// No tiene SQL ni reglas de negocio.

const service = require('./servicios.service');
const { generarReporteTecnico } = require('../../shared/integrations/pdf-reporte.service');
const ROL = require('../../shared/constants/roles');

// POST /api/servicios
async function crear(req, res) {
  const { inserted, numero_cliente, tecnico, generated } = await service.crear(req.body);
  res.status(201).json({
    ok: true,
    data: inserted,
    generated_numero_cliente: generated ? numero_cliente : null,
    tecnico_asignado: tecnico,
  });
}

// GET /api/servicios?estado=...&mine=1
async function listar(req, res) {
  const sess = req.session || {};
  const isAdmin = sess.rol === ROL.ADMIN;
  const mine = req.query.mine === '1';
  const data = await service.listar({
    estadoQuery: req.query.estado,
    isAdmin,
    mine,
    usuario: sess.usu,
  });
  res.json({ ok: true, data });
}

// GET /api/servicios/cliente/:numero_cliente
async function historial(req, res) {
  const data = await service.historialPorCliente(req.params.numero_cliente);
  res.json({ ok: true, data });
}

// PUT /api/servicios/:id
async function editar(req, res) {
  const data = await service.editar(req.params.id, req.body);
  res.json({ ok: true, data });
}

// DELETE /api/servicios/:id
async function eliminar(req, res) {
  await service.eliminar(req.params.id);
  res.json({ ok: true });
}

// PUT /api/servicios/:id/asignar
async function asignar(req, res) {
  const data = await service.reasignar(req.params.id, req.body.tecnico);
  res.json({ ok: true, data });
}

// PUT /api/servicios/:id/ajuste
async function actualizarAjuste(req, res) {
  const data = await service.actualizarAjuste(req.params.id, req.body.ajuste ?? null);
  res.json({ ok: true, data });
}

// POST /api/servicios/:id/finalizar
async function finalizar(req, res) {
  const data = await service.finalizar(req.params.id, req.body.resolucion, req.session || {});
  res.json({ ok: true, data });
}

// POST /api/servicios/:id/reabrir
async function reabrir(req, res) {
  const data = await service.reabrir(req.params.id);
  res.json({ ok: true, data });
}

// GET /api/servicios/:id/nota
async function obtenerNota(req, res) {
  const data = await service.obtenerNota(req.params.id, req.session || {});
  res.json({ ok: true, data });
}

// GET /api/servicios/:id/reporte
async function reporte(req, res) {
  const servicio = await service.datosParaReporte(req.params.id, req.session || {});
  const filename = `Reporte-${servicio.numero_nota || servicio.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  generarReporteTecnico(res, servicio);
}

module.exports = {
  crear,
  listar,
  historial,
  editar,
  eliminar,
  asignar,
  actualizarAjuste,
  finalizar,
  reabrir,
  obtenerNota,
  reporte,
};
