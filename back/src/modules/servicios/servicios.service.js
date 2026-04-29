// Service — reglas de negocio del módulo servicios.
// Sin SQL crudo, sin Express. Llama al repository y lanza errores tipados.

const repo = require('./servicios.repository');
const { withTransaction } = require('../../shared/db/transaction');
const {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} = require('../../shared/errors/AppError');
const { ESTADO_SERVICIO, ESTADOS_ACTIVOS } = require('../../shared/constants/estados');
const ROL = require('../../shared/constants/roles');

// ============================================================
// Crear servicio
// ============================================================
async function crear(input) {
  const numClienteManual = input.numero_cliente ? input.numero_cliente : '';

  const result = await withTransaction(async (tx) => {
    const numero_cliente = numClienteManual || (await repo.nextNumeroCliente(tx));
    const tecnico = await repo.asignarTecnicoAuto(tx);

    const inserted = await repo.crearServicio(
      {
        numero_cliente,
        nombre_cliente: input.nombre_cliente,
        telefono: input.telefono ?? null,
        direccion: input.direccion ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        conceptos: input.conceptos,
        total: input.total ?? 0,
        tecnico_asignado: tecnico,
      },
      tx,
    );
    return { inserted, numero_cliente, tecnico, generated: !numClienteManual };
  });

  console.log(
    '[SERV] creado id=',
    result.inserted.id,
    'cliente=',
    result.numero_cliente,
    'tecnico=',
    result.tecnico,
  );
  return result;
}

// ============================================================
// Listar (activos por defecto). Técnico siempre ve los suyos.
// ============================================================
async function listar({ estadoQuery, isAdmin, mine, usuario }) {
  const estados = (estadoQuery || ESTADOS_ACTIVOS.join(','))
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const filtraMis = !isAdmin || mine;
  const tecnico = filtraMis ? usuario || '' : undefined;

  return repo.listarServicios({ estados, tecnico });
}

async function historialPorCliente(numero_cliente) {
  return repo.listarPorCliente(numero_cliente);
}

// ============================================================
// Editar
// ============================================================
async function editar(id, campos) {
  // Validar técnico si se asigna uno nuevo no nulo
  if (campos.tecnico_asignado) {
    const u = await repo.validarUsuarioAsignable(campos.tecnico_asignado);
    if (!u || !u.activo) {
      throw new ValidationError('Técnico no existe o está inactivo.');
    }
    if (u.rol !== ROL.TECNICO && u.rol !== ROL.ADMIN) {
      throw new ValidationError('Usuario debe ser técnico o admin.');
    }
  }
  const updated = await repo.actualizarServicio(id, campos);
  if (!updated) throw new NotFoundError('Servicio no encontrado.');
  return updated;
}

// ============================================================
// Eliminar (soft delete)
// ============================================================
async function eliminar(id) {
  const found = await repo.buscarPorId(id);
  if (!found) throw new NotFoundError('Servicio no encontrado.');
  if (!found.activo) throw new ConflictError('El servicio ya está eliminado.');
  await repo.softDelete(id);
  console.log('[SERV] soft-deleted id=', id);
}

// ============================================================
// Reasignar técnico
// ============================================================
async function reasignar(id, tecnico) {
  const u = await repo.validarUsuarioAsignable(tecnico);
  if (!u || !u.activo) throw new ValidationError('Usuario no existe o está inactivo.');
  if (u.rol !== ROL.TECNICO && u.rol !== ROL.ADMIN) {
    throw new ValidationError('Usuario debe ser técnico o admin.');
  }
  const updated = await repo.reasignarTecnico(id, tecnico);
  if (!updated) throw new NotFoundError('Servicio no encontrado.');
  return updated;
}

// ============================================================
// Ajuste
// ============================================================
async function actualizarAjuste(id, ajuste) {
  const updated = await repo.actualizarAjuste(id, ajuste);
  if (!updated) throw new NotFoundError('Servicio no encontrado.');
  return updated;
}

// ============================================================
// Finalizar (transacción completa)
// ============================================================
async function finalizar(id, resolucion, sesion) {
  const atendidoPor = (sesion && sesion.usu) || null;
  console.log('[SERV] POST finalizar id=', id, 'por=', atendidoPor);

  const result = await withTransaction(async (tx) => {
    const serv = await repo.buscarPorId(id, { lock: true }, tx);
    if (!serv) throw new NotFoundError('Servicio no encontrado.');

    if (String(serv.estado).toUpperCase() === ESTADO_SERVICIO.TERMINADO) {
      throw new ConflictError('Servicio ya terminado.');
    }

    // Restricción: técnico sólo puede finalizar los suyos
    if (
      sesion.rol !== ROL.ADMIN &&
      serv.tecnico_asignado &&
      serv.tecnico_asignado !== sesion.usu
    ) {
      throw new ForbiddenError('No autorizado para finalizar este servicio.');
    }

    const numeroNota = await repo.nextNumeroNota(tx);

    await repo.finalizarServicio(
      { id, atendido_por: atendidoPor, numero_nota: numeroNota, resolucion },
      tx,
    );

    const conceptosNota = serv.ajuste
      ? `${serv.conceptos}\n\nAjuste: ${serv.ajuste}`
      : serv.conceptos;

    const nota = await repo.crearNotaDesdeServicio(serv, numeroNota, conceptosNota, tx);

    return { servicio_id: id, numero_nota: numeroNota, atendido_por: atendidoPor, nota };
  });

  console.log(
    `[SERV] finalizado id=${id} numero_nota=${result.numero_nota} por=${result.atendido_por}`,
  );
  return result;
}

// ============================================================
// Reabrir (admin only — el route lo protege; aquí valida estado)
// ============================================================
async function reabrir(id) {
  const found = await repo.buscarPorId(id);
  if (!found) throw new NotFoundError('Servicio no encontrado.');
  if (String(found.estado).toUpperCase() !== ESTADO_SERVICIO.TERMINADO) {
    throw new ConflictError('El servicio no está terminado.');
  }
  const updated = await repo.reabrirServicio(id);
  console.log('[SERV] reabierto id=', id);
  return updated;
}

// ============================================================
// Obtener nota vinculada (Ver nota)
// ============================================================
async function obtenerNota(id, sesion) {
  const s = await repo.buscarPorId(id);
  if (!s) throw new NotFoundError('Servicio no encontrado.');
  if (
    sesion.rol !== ROL.ADMIN &&
    sesion.usu !== s.atendido_por &&
    sesion.usu !== s.tecnico_asignado
  ) {
    throw new ForbiddenError('No autorizado.');
  }
  if (!s.numero_nota) throw new NotFoundError('Servicio sin nota generada.');
  const nota = await repo.buscarNotaPorNumero(s.numero_nota);
  if (!nota) throw new NotFoundError('Nota no encontrada.');
  return nota;
}

// ============================================================
// Datos para reporte técnico (PDF)
// ============================================================
async function datosParaReporte(id, sesion) {
  const s = await repo.buscarPorId(id);
  if (!s) throw new NotFoundError('Servicio no encontrado.');
  if (
    sesion.rol !== ROL.ADMIN &&
    sesion.usu !== s.atendido_por &&
    sesion.usu !== s.tecnico_asignado
  ) {
    throw new ForbiddenError('No autorizado.');
  }
  return s;
}

module.exports = {
  crear,
  listar,
  historialPorCliente,
  editar,
  eliminar,
  reasignar,
  actualizarAjuste,
  finalizar,
  reabrir,
  obtenerNota,
  datosParaReporte,
};
