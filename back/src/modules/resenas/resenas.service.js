// Reglas de negocio del módulo resenas.
// Sin SQL crudo ni Express. Llama al repository y lanza errores tipados.

const repo = require('./resenas.repository');
const { NotFoundError, ConflictError, ForbiddenError } = require('../../shared/errors/AppError');
const ROL = require('../../shared/constants/roles');

// Defense in depth: aunque routes.js ya aplica requireAdmin, re-validamos
// en el service. Si un refactor futuro cambia el mount o llama al service
// directamente (asistente, scripts), esto cierra el hueco.
function _assertAdmin(sesion) {
  if (!sesion || sesion.rol !== ROL.ADMIN) {
    throw new ForbiddenError('Solo administradores pueden moderar reseñas.');
  }
}

// Labels legibles para el sitio público.
const TIPO_LABELS = {
  plomeria: 'Plomería',
  electrica: 'Electricidad',
  gas: 'Gas',
  pintura: 'Pintura',
  soldadura: 'Soldadura',
  mantenimiento_integral: 'Mantenimiento integral',
};

// Normaliza CL-1, cl-0001, CL-42 a CL-0001 (uppercase, 4 dígitos).
function normalizarNumeroCliente(raw) {
  const m = String(raw || '').trim().match(/^CL-?(\d{1,4})$/i);
  if (!m) return String(raw || '').trim().toUpperCase();
  return `CL-${m[1].padStart(4, '0')}`;
}

// Iniciales para el avatar: primeras letras de cada palabra, máximo 2.
function iniciales(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return partes.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function tipoLabel(tipo) {
  return tipo ? TIPO_LABELS[tipo] || null : null;
}

// Paso 1 del formulario público: confirma que el cliente existe.
// Solo consulta dbo.notas (igual que el módulo notas). El chequeo de
// duplicados contra dbo.resenas ocurre al enviar la reseña, no aquí.
async function verificarCliente(data) {
  const numero_cliente = normalizarNumeroCliente(data.numero_cliente);
  const telefono = String(data.telefono).trim();

  const cliente = await repo.validarCliente(numero_cliente, telefono);
  if (!cliente) {
    throw new NotFoundError('No encontramos un cliente con esos datos.');
  }

  return { ok: true, numero_cliente };
}

// Paso 2: alta efectiva. Revalida cliente y duplicados (el frontend no es confiable).
async function crearPublica(data) {
  const numero_cliente = normalizarNumeroCliente(data.numero_cliente);
  const telefono = String(data.telefono).trim();

  const cliente = await repo.validarCliente(numero_cliente, telefono);
  if (!cliente) {
    throw new NotFoundError('No encontramos un cliente con esos datos.');
  }

  const previas = await repo.contarResenasCliente(numero_cliente);
  if (previas > 0) {
    throw new ConflictError('Ya tienes una reseña registrada con este número de cliente.');
  }

  try {
    await repo.crearResena({
      numero_cliente,
      telefono,
      nombre_display: String(data.nombre_display).trim(),
      colonia: data.colonia ? String(data.colonia).trim() : null,
      tipo_servicio: data.tipo_servicio || null,
      texto: String(data.texto).trim(),
    });
  } catch (err) {
    // Red de seguridad anti-race: el pre-check + INSERT no son atómicos;
    // UX_resenas_cliente_activa (migración 011) atrapa el caso concurrente.
    // mssql expone el código nativo de SQL Server en err.number.
    if (err && (err.number === 2601 || err.number === 2627)) {
      throw new ConflictError('Ya tienes una reseña registrada con este número de cliente.');
    }
    throw err;
  }

  return { ok: true, mensaje: 'Gracias por tu reseña. La publicaremos pronto.' };
}

// Reseñas aprobadas para el sitio público.
async function listarPublicas() {
  const rows = await repo.listarPublicas();
  const data = rows.map((r) => ({
    id: r.id,
    nombre_display: r.nombre_display,
    iniciales: iniciales(r.nombre_display),
    colonia: r.colonia || null,
    tipo_servicio_label: tipoLabel(r.tipo_servicio),
    texto: r.texto,
  }));
  return { ok: true, data };
}

// Todas las reseñas + contador de pendientes, para el panel de moderación.
async function listarAdmin(sesion, paginacion = {}) {
  _assertAdmin(sesion);
  // pendientes cuenta SIEMPRE el total (independiente de la página actual).
  const [rows, pendientes] = await Promise.all([
    repo.listarAdmin(paginacion),
    repo.contarPendientes(),
  ]);
  const resenas = rows.map((r) => ({
    id: r.id,
    numero_cliente: r.numero_cliente,
    nombre_display: r.nombre_display,
    colonia: r.colonia || null,
    tipo_servicio: r.tipo_servicio || null,
    tipo_servicio_label: tipoLabel(r.tipo_servicio),
    texto: r.texto,
    estado: r.estado,
    fecha_creacion: r.fecha_creacion,
    fecha_moderacion: r.fecha_moderacion,
  }));
  return { ok: true, data: { resenas, pendientes } };
}

async function moderar(id, estado, sesion) {
  _assertAdmin(sesion);
  const resena = await repo.obtenerPorId(id);
  if (!resena || !resena.activo) {
    throw new NotFoundError('Reseña no encontrada.');
  }
  await repo.moderarResena(id, estado);
  return {
    ok: true,
    mensaje: estado === 'aprobada' ? 'Reseña aprobada.' : 'Reseña rechazada.',
  };
}

module.exports = {
  verificarCliente,
  crearPublica,
  listarPublicas,
  listarAdmin,
  moderar,
};
