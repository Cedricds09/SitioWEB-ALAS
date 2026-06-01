// Controller: capa fina entre HTTP y service.
// Sin try/catch (lo cubre asyncHandler), sin SQL ni reglas de negocio.

const service = require('./servicios.service');
const { generarReporteTecnico } = require('../../shared/integrations/pdf-reporte.service');
const ROL = require('../../shared/constants/roles');

async function crear(req, res) {
  const { inserted, numero_cliente, tecnico, generated } = await service.crear(req.body);
  res.status(201).json({
    ok: true,
    data: inserted,
    generated_numero_cliente: generated ? numero_cliente : null,
    tecnico_asignado: tecnico,
  });
}

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

async function calendario(req, res) {
  const sess = req.session || {};
  const data = await service.calendario({
    semana: req.query.semana,
    isAdmin: sess.rol === ROL.ADMIN,
    usuario: sess.usu,
  });
  res.json({ ok: true, data });
}

async function historial(req, res) {
  const data = await service.historialPorCliente(req.params.numero_cliente);
  res.json({ ok: true, data });
}

async function programar(req, res) {
  const data = await service.programar(req.params.id, req.body, req.session || {});
  res.json({ ok: true, data });
}

async function editar(req, res) {
  const data = await service.editar(req.params.id, req.body);
  res.json({ ok: true, data });
}

async function eliminar(req, res) {
  await service.eliminar(req.params.id);
  res.json({ ok: true });
}

async function asignar(req, res) {
  const data = await service.reasignar(req.params.id, req.body.tecnico);
  res.json({ ok: true, data });
}

async function actualizarAjuste(req, res) {
  const data = await service.actualizarAjuste(
    req.params.id,
    req.body.ajuste ?? null,
    req.session || {},
  );
  res.json({ ok: true, data });
}

async function finalizar(req, res) {
  const data = await service.finalizar(req.params.id, req.body.resolucion, req.session || {});
  res.json({ ok: true, data });
}

async function reabrir(req, res) {
  const data = await service.reabrir(req.params.id);
  res.json({ ok: true, data });
}

async function obtenerNota(req, res) {
  const data = await service.obtenerNota(req.params.id, req.session || {});
  res.json({ ok: true, data });
}

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
  calendario,
  historial,
  programar,
  editar,
  eliminar,
  asignar,
  actualizarAjuste,
  finalizar,
  reabrir,
  obtenerNota,
  reporte,
};
