// Reglas de negocio del módulo presupuestos.
// Sin SQL crudo ni Express. Llama al repository y lanza errores tipados.

const repo = require('./presupuestos.repository');
const serviciosRepo = require('../servicios/servicios.repository');
const usuariosRepo = require('../usuarios/usuarios.repository');
const { withTransaction } = require('../../shared/db/transaction');
const {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} = require('../../shared/errors/AppError');
const ROL = require('../../shared/constants/roles');
const {
  TIPO_BLOQUE,
  ESTADO_PRESUPUESTO,
  TRANSICIONES_PERMITIDAS,
  FUENTE_PRESUPUESTO,
  NOTA_FINAL_DEFAULT,
} = require('../../shared/constants/presupuestos');

// ============================================================
// Helpers internos
// ============================================================

// Normaliza un bloque (validado por Zod) al shape de la tabla.
// Listas (lista_vinetas, garantias) se serializan a JSON en contenido_texto.
function _bloqueToRow(bloque) {
  switch (bloque.tipo) {
    case TIPO_BLOQUE.TEXTO:
      return {
        tipo: bloque.tipo,
        titulo: null,
        contenido_texto: bloque.contenido_texto,
        subtotal: null,
      };
    case TIPO_BLOQUE.LISTA_VINETAS:
      return {
        tipo: bloque.tipo,
        titulo: null,
        contenido_texto: JSON.stringify(bloque.vinetas),
        subtotal: null,
      };
    case TIPO_BLOQUE.GARANTIAS:
      return {
        tipo: bloque.tipo,
        titulo: null,
        contenido_texto: JSON.stringify(bloque.garantias),
        subtotal: null,
      };
    case TIPO_BLOQUE.APARTADO_CERRADO:
      return {
        tipo: bloque.tipo,
        titulo: bloque.titulo,
        contenido_texto: bloque.contenido_texto,
        subtotal: bloque.subtotal,
      };
    case TIPO_BLOQUE.SECCION_ITEMS:
      return {
        tipo: bloque.tipo,
        titulo: bloque.titulo,
        contenido_texto: null,
        subtotal: null,
      };
    default:
      throw new ValidationError(`Tipo de bloque desconocido: ${bloque.tipo}`);
  }
}

// Inserta un bloque + sus items (si seccion_items). Devuelve el bloque insertado.
async function _insertarBloqueConItems(presupuesto_id, bloque, orden, tx) {
  const row = _bloqueToRow(bloque);
  const inserted = await repo.crearBloque(
    {
      presupuesto_id,
      orden,
      tipo: row.tipo,
      titulo: row.titulo,
      contenido_texto: row.contenido_texto,
      subtotal: row.subtotal,
    },
    tx,
  );

  if (bloque.tipo === TIPO_BLOQUE.SECCION_ITEMS && Array.isArray(bloque.items)) {
    let nextOrden = 1;
    for (const it of bloque.items) {
      await repo.crearItem(
        {
          bloque_id: inserted.id,
          orden: it.orden ?? nextOrden++,
          descripcion: it.descripcion,
          cantidad: it.cantidad ?? 1,
          precio_unitario: it.precio_unitario ?? 0,
          es_opcional: !!it.es_opcional,
        },
        tx,
      );
    }
  }
  return inserted;
}

// Recalcula y persiste el total general. Suma apartado_cerrado.subtotal +
// SUM(items.cantidad * items.precio_unitario WHERE es_opcional=0) por seccion_items.
async function _recalcularTotal(presupuesto_id, tx) {
  const bloques = await repo.listarBloquesDePresupuesto(presupuesto_id, tx);
  let total = 0;
  for (const b of bloques) {
    if (b.tipo === TIPO_BLOQUE.APARTADO_CERRADO) {
      total += Number(b.subtotal) || 0;
    } else if (b.tipo === TIPO_BLOQUE.SECCION_ITEMS) {
      total += await repo.calcularSubtotalSeccion(b.id, tx);
    }
  }
  total = Math.round(total * 100) / 100;
  await repo.actualizarTotal(presupuesto_id, total, tx);
  return total;
}

// Admin ve todo. Técnico ve los suyos (asignado_a) y las solicitudes huérfanas.
// IDOR: 404 INTENCIONAL (no 403) para no confirmar la existencia de IDs
// ajenos a un técnico curioso. NO refactorizar a ForbiddenError; rompe
// la defensa anti-enumeración.
function _validarVisibilidad(presupuesto, sesion) {
  if (sesion.rol === ROL.ADMIN) return;
  const esSuyo = presupuesto.asignado_a === sesion.uid;
  const esSolicitudHuerfana =
    presupuesto.estado === ESTADO_PRESUPUESTO.SOLICITUD && presupuesto.asignado_a == null;
  if (!esSuyo && !esSolicitudHuerfana) {
    throw new NotFoundError('Presupuesto no encontrado.');
  }
}

// Mantenido por compatibilidad con flujos que requieran ownership estricto
// (mutaciones de header/bloques/items hechas por técnico).
function _validarPropiedad(presupuesto, sesion) {
  if (sesion.rol === ROL.ADMIN) return;
  const esSuyo = presupuesto.asignado_a === sesion.uid;
  const esSolicitudHuerfana =
    presupuesto.estado === ESTADO_PRESUPUESTO.SOLICITUD && presupuesto.asignado_a == null;
  if (!esSuyo && !esSolicitudHuerfana) {
    throw new NotFoundError('Presupuesto no encontrado.');
  }
}

function _validarEditable(presupuesto, sesion) {
  // Admin puede editar en cualquier estado (la UI muestra un warning).
  if (sesion && sesion.rol === ROL.ADMIN) return;
  if (presupuesto.estado !== ESTADO_PRESUPUESTO.BORRADOR) {
    throw new ConflictError(
      `Solo se puede editar un presupuesto en estado borrador (estado actual: ${presupuesto.estado}).`,
    );
  }
}

function _validarTransicion(estadoActual, nuevoEstado) {
  const permitidos = TRANSICIONES_PERMITIDAS[estadoActual] || [];
  if (!permitidos.includes(nuevoEstado)) {
    throw new ConflictError(
      `Transición no permitida: ${estadoActual} → ${nuevoEstado}.`,
    );
  }
}

async function _cargarBloqueDePresupuesto(presupuesto_id, bloque_id, tx) {
  const b = await repo.buscarBloquePorId(bloque_id, tx);
  if (!b || !b.activo) throw new NotFoundError('Bloque no encontrado.');
  if (b.presupuesto_id !== presupuesto_id) {
    throw new NotFoundError('Bloque no pertenece a este presupuesto.');
  }
  return b;
}

async function _cargarItemDeBloque(bloque, item_id, tx) {
  const it = await repo.buscarItemPorId(item_id, tx);
  if (!it || !it.activo) throw new NotFoundError('Item no encontrado.');
  if (it.bloque_id !== bloque.id) {
    throw new NotFoundError('Item no pertenece a este bloque.');
  }
  return it;
}

// ============================================================
// Crear
// ============================================================

async function crear(input, sesion) {
  console.log('[PRES] crear por uid=', sesion.uid, 'cliente=', input.cliente_nombre);

  // Autoasignación: técnico que crea queda asignado; admin queda sin asignar.
  const asignadoA = sesion.rol === ROL.TECNICO ? sesion.uid : null;

  const result = await withTransaction(async (tx) => {
    const numero_presupuesto = await repo.nextNumeroPresupuesto(tx);

    const header = await repo.crearHeader(
      {
        numero_presupuesto,
        servicio_id: input.servicio_id ?? null,
        cliente_nombre: input.cliente_nombre,
        cliente_telefono: input.cliente_telefono ?? null,
        cliente_direccion: input.cliente_direccion ?? null,
        cliente_destinatario: input.cliente_destinatario ?? null,
        ciudad: input.ciudad,
        fecha_documento: input.fecha_documento ?? null,
        introduccion: input.introduccion ?? null,
        nota_final: input.nota_final === undefined ? NOTA_FINAL_DEFAULT : input.nota_final,
        vigencia_dias: input.vigencia_dias,
        adelanto_porcentaje: input.adelanto_porcentaje,
        moneda: input.moneda,
        notas_internas: input.notas_internas ?? null,
        creado_por: sesion.uid,
        asignado_a: asignadoA,
        tipo_servicio: input.tipo_servicio ?? null,
        numero_cliente: input.numero_cliente ?? null,
        fuente: input.fuente || FUENTE_PRESUPUESTO.ADMIN,
        estado: ESTADO_PRESUPUESTO.BORRADOR,
      },
      tx,
    );

    if (Array.isArray(input.bloques) && input.bloques.length) {
      let nextOrden = 1;
      for (const b of input.bloques) {
        await _insertarBloqueConItems(header.id, b, b.orden ?? nextOrden++, tx);
      }
      await _recalcularTotal(header.id, tx);
    }

    return repo.buscarPorIdCompleto(header.id, tx);
  });

  console.log('[PRES] creado id=', result.id, 'numero=', result.numero_presupuesto);
  return result;
}

// ============================================================
// Listar
// ============================================================

async function listar({ estado, mine, cliente, numero_cliente, desde, hasta, page, limit }, sesion) {
  const isAdmin = sesion.rol === ROL.ADMIN;
  const estados = (estado || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Visibilidad:
  // - Técnico: siempre solo los suyos mas solicitudes huérfanas (mine se ignora).
  // - Admin: si mine=true filtra por los suyos, si no ve todo.
  // page/limit son opt-in (undefined => sin paginar, igual que antes).
  if (!isAdmin) {
    return repo.listar({
      estados,
      asignado_a: sesion.uid,
      soloMineConOrfanas: true,
      cliente, numero_cliente, desde, hasta, page, limit,
    });
  }
  if (mine === true) {
    return repo.listar({ estados, asignado_a: sesion.uid, cliente, numero_cliente, desde, hasta, page, limit });
  }
  return repo.listar({ estados, cliente, numero_cliente, desde, hasta, page, limit });
}

// ============================================================
// Obtener
// ============================================================

async function obtener(id, sesion) {
  const p = await repo.buscarPorIdCompleto(id);
  if (!p) throw new NotFoundError('Presupuesto no encontrado.');
  _validarVisibilidad(p, sesion);
  return p;
}

// ============================================================
// Actualizar
// ============================================================

async function actualizar(id, campos, sesion) {
  const result = await withTransaction(async (tx) => {
    const cur = await repo.buscarPorIdPlano(id, tx);
    if (!cur || !cur.activo) throw new NotFoundError('Presupuesto no encontrado.');
    _validarPropiedad(cur, sesion);
    _validarEditable(cur, sesion);

    const headerCampos = { ...campos };
    delete headerCampos.bloques;
    if (Object.keys(headerCampos).some((k) => headerCampos[k] !== undefined)) {
      await repo.actualizarHeader(id, headerCampos, tx);
    }

    if (Array.isArray(campos.bloques)) {
      // Reemplaza todo el set de bloques.
      await repo.eliminarBloquesDePresupuesto(id, tx);
      let nextOrden = 1;
      for (const b of campos.bloques) {
        await _insertarBloqueConItems(id, b, b.orden ?? nextOrden++, tx);
      }
      await _recalcularTotal(id, tx);
    }

    return repo.buscarPorIdCompleto(id, tx);
  });

  console.log('[PRES] actualizado id=', id);
  return result;
}

// ============================================================
// Eliminar (soft delete)
// ============================================================

async function eliminar(id, sesion) {
  const p = await repo.buscarPorIdPlano(id);
  if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
  _validarPropiedad(p, sesion);

  const eliminables = [ESTADO_PRESUPUESTO.BORRADOR, ESTADO_PRESUPUESTO.RECHAZADO];
  if (!eliminables.includes(p.estado)) {
    throw new ConflictError(
      `Solo se pueden eliminar presupuestos en estado borrador o rechazado (actual: ${p.estado}).`,
    );
  }

  await repo.softDelete(id);
  console.log('[PRES] soft-deleted id=', id);
}

// ============================================================
// Bloques (mutación independiente)
// ============================================================

async function agregarBloque(presupuesto_id, datos, sesion) {
  const result = await withTransaction(async (tx) => {
    const p = await repo.buscarPorIdPlano(presupuesto_id, tx);
    if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
    _validarPropiedad(p, sesion);
    _validarEditable(p, sesion);

    const orden = datos.orden ?? (await repo.obtenerMaxOrdenBloque(presupuesto_id, tx)) + 1;
    const inserted = await _insertarBloqueConItems(presupuesto_id, datos, orden, tx);

    await _recalcularTotal(presupuesto_id, tx);
    return repo.buscarBloquePorId(inserted.id, tx);
  });
  return result;
}

async function actualizarBloque(presupuesto_id, bloque_id, campos, sesion) {
  const result = await withTransaction(async (tx) => {
    const p = await repo.buscarPorIdPlano(presupuesto_id, tx);
    if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
    _validarPropiedad(p, sesion);
    _validarEditable(p, sesion);

    const b = await _cargarBloqueDePresupuesto(presupuesto_id, bloque_id, tx);

    const updateData = {};
    if (campos.titulo !== undefined) updateData.titulo = campos.titulo;
    if (campos.orden !== undefined) updateData.orden = campos.orden;

    // Por tipo:
    if (b.tipo === TIPO_BLOQUE.TEXTO) {
      if (campos.contenido_texto !== undefined) updateData.contenido_texto = campos.contenido_texto;
    } else if (b.tipo === TIPO_BLOQUE.LISTA_VINETAS) {
      if (Array.isArray(campos.vinetas)) updateData.contenido_texto = JSON.stringify(campos.vinetas);
    } else if (b.tipo === TIPO_BLOQUE.GARANTIAS) {
      if (Array.isArray(campos.garantias)) updateData.contenido_texto = JSON.stringify(campos.garantias);
    } else if (b.tipo === TIPO_BLOQUE.APARTADO_CERRADO) {
      if (campos.contenido_texto !== undefined) updateData.contenido_texto = campos.contenido_texto;
      if (campos.subtotal !== undefined) updateData.subtotal = campos.subtotal;
    } else if (b.tipo === TIPO_BLOQUE.SECCION_ITEMS) {
      // Solo titulo/orden. Los items van por sus propios endpoints.
    }

    if (Object.keys(updateData).length) {
      await repo.actualizarBloque(bloque_id, updateData, tx);
    }

    if (b.tipo === TIPO_BLOQUE.APARTADO_CERRADO && campos.subtotal !== undefined) {
      await _recalcularTotal(presupuesto_id, tx);
    }

    return repo.buscarBloquePorId(bloque_id, tx);
  });
  return result;
}

async function eliminarBloque(presupuesto_id, bloque_id, sesion) {
  await withTransaction(async (tx) => {
    const p = await repo.buscarPorIdPlano(presupuesto_id, tx);
    if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
    _validarPropiedad(p, sesion);
    _validarEditable(p, sesion);

    await _cargarBloqueDePresupuesto(presupuesto_id, bloque_id, tx);
    await repo.eliminarBloque(bloque_id, tx);
    await _recalcularTotal(presupuesto_id, tx);
  });
  console.log('[PRES] bloque eliminado id=', bloque_id, 'pres=', presupuesto_id);
}

// ============================================================
// Items (solo aplicables a bloques tipo seccion_items)
// ============================================================

async function agregarItem(presupuesto_id, bloque_id, datos, sesion) {
  const result = await withTransaction(async (tx) => {
    const p = await repo.buscarPorIdPlano(presupuesto_id, tx);
    if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
    _validarPropiedad(p, sesion);
    _validarEditable(p, sesion);

    const b = await _cargarBloqueDePresupuesto(presupuesto_id, bloque_id, tx);
    if (b.tipo !== TIPO_BLOQUE.SECCION_ITEMS) {
      throw new ValidationError('Solo bloques tipo seccion_items aceptan items.');
    }

    const orden = datos.orden ?? (await repo.obtenerMaxOrdenItem(bloque_id, tx)) + 1;
    const inserted = await repo.crearItem(
      {
        bloque_id,
        orden,
        descripcion: datos.descripcion,
        cantidad: datos.cantidad ?? 1,
        precio_unitario: datos.precio_unitario ?? 0,
        es_opcional: !!datos.es_opcional,
      },
      tx,
    );

    await _recalcularTotal(presupuesto_id, tx);
    return repo.buscarItemPorId(inserted.id, tx);
  });
  return result;
}

async function actualizarItem(presupuesto_id, bloque_id, item_id, campos, sesion) {
  const result = await withTransaction(async (tx) => {
    const p = await repo.buscarPorIdPlano(presupuesto_id, tx);
    if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
    _validarPropiedad(p, sesion);
    _validarEditable(p, sesion);

    const b = await _cargarBloqueDePresupuesto(presupuesto_id, bloque_id, tx);
    await _cargarItemDeBloque(b, item_id, tx);

    const updated = await repo.actualizarItem(item_id, campos, tx);
    if (!updated) throw new NotFoundError('Item no encontrado.');

    await _recalcularTotal(presupuesto_id, tx);
    return repo.buscarItemPorId(item_id, tx);
  });
  return result;
}

async function eliminarItem(presupuesto_id, bloque_id, item_id, sesion) {
  await withTransaction(async (tx) => {
    const p = await repo.buscarPorIdPlano(presupuesto_id, tx);
    if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
    _validarPropiedad(p, sesion);
    _validarEditable(p, sesion);

    const b = await _cargarBloqueDePresupuesto(presupuesto_id, bloque_id, tx);
    await _cargarItemDeBloque(b, item_id, tx);

    await repo.eliminarItem(item_id, tx);
    await _recalcularTotal(presupuesto_id, tx);
  });
  console.log('[PRES] item eliminado id=', item_id, 'bloque=', bloque_id);
}

// ============================================================
// Workflow
// ============================================================

async function cambiarEstado(id, nuevoEstado, sesion) {
  const p = await repo.buscarPorIdPlano(id);
  if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
  _validarPropiedad(p, sesion);

  _validarTransicion(p.estado, nuevoEstado);

  // Permisos por estado destino:
  // - aprobado/convertido: admin o técnico responsable (asignado_a === uid).
  //   Aquí lo permitimos explícitamente para que el técnico asignado pueda
  //   aprobar/rechazar/convertir su propio presupuesto.
  // - enviado/rechazado: cualquier propietario. _validarPropiedad ya lo cubre.
  const requiereAdminOResponsable = [ESTADO_PRESUPUESTO.APROBADO, ESTADO_PRESUPUESTO.CONVERTIDO];
  if (requiereAdminOResponsable.includes(nuevoEstado)) {
    const esResponsable = sesion.rol === ROL.ADMIN
      || (sesion.rol === ROL.TECNICO && Number(p.asignado_a) === Number(sesion.uid));
    if (!esResponsable) {
      throw new ForbiddenError(
        `Cambiar a estado "${nuevoEstado}" requiere ser admin o el técnico asignado.`
      );
    }
  }

  const updated = await repo.cambiarEstado(id, nuevoEstado);
  console.log(`[PRES] estado id=${id} ${p.estado} → ${nuevoEstado}`);
  return updated;
}

// ============================================================
// Reasignación (solo admin)
// ============================================================

async function reasignar(id, asignadoA, sesion) {
  if (sesion.rol !== ROL.ADMIN) {
    throw new ForbiddenError('Reasignar requiere rol admin.');
  }

  const result = await withTransaction(async (tx) => {
    const p = await repo.buscarPorIdPlano(id, tx);
    if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');

    if (asignadoA !== null) {
      const ok = await repo.validarAsignable(asignadoA, tx);
      if (!ok) {
        throw new ValidationError('El usuario indicado no existe, no está activo o no es técnico.');
      }
    }

    await repo.actualizarHeader(id, { asignado_a: asignadoA }, tx);
    return repo.buscarPorIdCompleto(id, tx);
  });

  console.log('[PRES] reasignado id=', id, 'a uid=', asignadoA);
  return result;
}

// ============================================================
// Arma el resumen breve en texto plano que va al campo `conceptos` del
// servicio, para que el técnico vea de un vistazo qué trabajo viene del
// presupuesto sin cargar todo el texto narrativo.
//
// Formato:
//   Linea 1: "{Tipo}: {Cliente}" (omite el tipo si tipo_servicio es null)
//   Lineas 2..N: títulos de bloques. seccion_items: "{titulo}: it1, it2, it3 y N más"
//   Última linea: "Total: ${total}"
//
// Reglas:
//   - Bloques tipo garantias: se omiten (no aplican a la ejecución).
//   - Bloques sin título: se omiten.
//   - seccion_items: máximo 3 items visibles, el resto como "y N más".
//   - Items con es_opcional=true se marcan con " (opcional)".
//   - Máximo 10 lineas (header + 8 body + total).
// ============================================================
const TIPO_SERVICIO_LABEL = {
  plomeria: 'Plomería',
  electrica: 'Eléctrica',
  gas: 'Gas',
  pintura: 'Pintura',
  soldadura: 'Soldadura',
  mantenimiento_integral: 'Mantenimiento integral',
};

function _buildConceptosDeBloques(p) {
  const cliente = (p.cliente_nombre || '').trim();
  const tipoLabel = p.tipo_servicio
    ? (TIPO_SERVICIO_LABEL[p.tipo_servicio] || p.tipo_servicio)
    : null;
  const header = tipoLabel ? `${tipoLabel} — ${cliente}` : cliente;

  const bodyLines = [];
  for (const b of (p.bloques || [])) {
    if (b.tipo === TIPO_BLOQUE.GARANTIAS) continue;
    if (!b.titulo) continue;

    if (b.tipo === TIPO_BLOQUE.SECCION_ITEMS) {
      const items = Array.isArray(b.items) ? b.items : [];
      const top3 = items.slice(0, 3).map((it) => {
        const opc = it.es_opcional ? ' (opcional)' : '';
        const desc = (it.descripcion || '').trim();
        const descCorta = desc.length > 60 ? desc.slice(0, 57) + '...' : desc;
        return `${descCorta}${opc}`;
      });
      const more = items.length > 3 ? ` y ${items.length - 3} más` : '';
      bodyLines.push(`${b.titulo}: ${top3.join(', ')}${more}`);
    } else {
      bodyLines.push(b.titulo);
    }
  }

  const MAX_BODY = 8;
  if (bodyLines.length > MAX_BODY) bodyLines.length = MAX_BODY;

  const totalNum = Number(p.total_general) || 0;
  const totalStr = `$${totalNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return [header, ...bodyLines, `Total: ${totalStr}`].join('\n');
}

async function convertirAServicio(id, sesion) {
  // Conversión real a servicio.
  // Admin convierte cualquier presupuesto aprobado. El técnico solo si es el
  // responsable asignado (asignado_a === uid), igual que en el resto del módulo.
  return await withTransaction(async (tx) => {
    // Cargar presupuesto completo (con bloques e items) y validar.
    const p = await repo.buscarPorIdCompleto(id, tx);
    if (!p) throw new NotFoundError('Presupuesto no encontrado.');

    // Permisos: admin o técnico asignado.
    if (sesion.rol !== ROL.ADMIN) {
      if (Number(p.asignado_a) !== Number(sesion.uid)) {
        throw new ForbiddenError(
          'Solo el técnico asignado o un admin puede convertir este presupuesto.',
        );
      }
    }

    // Idempotencia: si ya fue convertido, devolver 409 con info útil.
    if (p.servicio_id != null) {
      let existingCl = '(desconocido)';
      try {
        const existing = await serviciosRepo.buscarPorId(p.servicio_id, {}, tx);
        if (existing && existing.numero_cliente) existingCl = existing.numero_cliente;
      } catch { /* noop */ }
      throw new ConflictError(`Este presupuesto ya fue convertido. Servicio: ${existingCl}.`);
    }

    // Validar estado.
    if (p.estado !== ESTADO_PRESUPUESTO.APROBADO) {
      throw new ConflictError(
        `Solo se puede convertir un presupuesto en estado aprobado (actual: ${p.estado}).`,
      );
    }

    // Resumen breve para el campo `conceptos` del servicio.
    const conceptos = _buildConceptosDeBloques(p);

    // Resolver técnico: hereda el del presupuesto si tiene asignado_a,
    // si no autoasigna (mismo patrón que servicios.crear).
    let tecnicoUsuario = null;
    if (p.asignado_a != null) {
      const u = await usuariosRepo.buscarPorId(p.asignado_a, tx);
      tecnicoUsuario = (u && u.usuario) || null;
    }
    if (!tecnicoUsuario) {
      tecnicoUsuario = await serviciosRepo.asignarTecnicoAuto(tx);
    }

    // Resolver numero_cliente: hereda el del presupuesto si ya tiene,
    // si no genera el siguiente CL-XXXX (mismo consecutivo que servicios).
    let numeroCliente = p.numero_cliente;
    if (!numeroCliente) {
      numeroCliente = await serviciosRepo.nextNumeroCliente(tx);
    }

    // Validar campos requeridos por dbo.servicios ANTES del INSERT, así
    // devolvemos 400 claro en vez de 500 críptico por constraint NOT NULL.
    if (!numeroCliente) {
      throw new ValidationError('No se pudo resolver número de cliente para el servicio.');
    }
    if (!p.cliente_nombre || !String(p.cliente_nombre).trim()) {
      throw new ValidationError('El presupuesto no tiene nombre de cliente — no se puede convertir.');
    }
    if (!conceptos || !conceptos.trim()) {
      throw new ValidationError('El presupuesto no tiene bloques con contenido — no se puede convertir.');
    }

    // INSERT en servicios.
    const servicio = await serviciosRepo.crearServicio({
      numero_cliente: numeroCliente,
      nombre_cliente: p.cliente_nombre,
      telefono: p.cliente_telefono ?? null,
      direccion: p.cliente_direccion ?? null,
      lat: null,
      lng: null,
      conceptos,
      tipo_servicio: p.tipo_servicio ?? null,
      total: Number(p.total_general) || 0,
      tecnico_asignado: tecnicoUsuario,
    }, tx);

    // UPDATE presupuesto: link al servicio y estado convertido.
    await repo.actualizarHeader(id, { servicio_id: servicio.id }, tx);
    await repo.cambiarEstado(id, ESTADO_PRESUPUESTO.CONVERTIDO, tx);

    console.log(`[PRES] convertido id=${id} → servicio.id=${servicio.id} (${numeroCliente}) tecnico=${tecnicoUsuario}`);

    return {
      ok: true,
      data: {
        servicio_id: servicio.id,
        numero_cliente: numeroCliente,
        tecnico_asignado: tecnicoUsuario,
        mensaje: `Presupuesto convertido. Servicio ${numeroCliente} creado y asignado a ${tecnicoUsuario}.`,
      },
    };
  });
}

// ============================================================
// Solicitud pública (formulario web, sin sesión)
// ============================================================

async function crearSolicitudPublica(input) {
  // Honeypot anti-bot: si llega lleno, devolvemos la MISMA forma que un alta
  // real (numero_presupuesto fake) para que el bot no detecte la trampa por
  // el shape de la respuesta. Logueamos internamente para análisis posterior.
  if (input.honeypot && input.honeypot.length > 0) {
    console.log('[PRES][PUB] honeypot disparado — respondiendo fake-success');
    return {
      id: 0,
      numero_presupuesto: 'PR-0000',
      estado: ESTADO_PRESUPUESTO.SOLICITUD,
      ignorada: true, // flag interno; el controller debe filtrarlo
    };
  }

  console.log(
    '[PRES][PUB] solicitud cliente=', input.cliente_nombre,
    'tipo=', input.tipo_servicio,
  );

  const result = await withTransaction(async (tx) => {
    const adminId = await repo.obtenerAdminParaSolicitudes(tx);
    if (!adminId) {
      throw new ValidationError('No hay un usuario admin disponible para asignar solicitudes.');
    }

    // Autoasignar al primer técnico activo (NULL si no hay técnicos).
    const tecnicoId = await repo.getPrimerTecnicoDisponible(tx);

    const numero_presupuesto = await repo.nextNumeroPresupuesto(tx);

    // La descripcion_inicial va a notas_internas (solo el admin la ve al
    // atender). La introduccion queda vacía hasta que el admin la elabore.
    const notasInternas = `[Solicitud del cliente]\n${input.descripcion_inicial}`;

    const header = await repo.crearHeader(
      {
        numero_presupuesto,
        cliente_nombre: input.cliente_nombre,
        cliente_telefono: input.cliente_telefono,
        cliente_direccion: input.cliente_direccion ?? null,
        introduccion: null,
        nota_final: NOTA_FINAL_DEFAULT,
        vigencia_dias: 7,
        adelanto_porcentaje: 0,
        moneda: 'MXN',
        notas_internas: notasInternas,
        creado_por: adminId,
        asignado_a: tecnicoId,
        tipo_servicio: input.tipo_servicio,
        numero_cliente: null,
        fuente: FUENTE_PRESUPUESTO.FORMULARIO_PUBLICO,
        estado: ESTADO_PRESUPUESTO.SOLICITUD,
      },
      tx,
    );
    return header;
  });

  console.log('[PRES][PUB] solicitud creada id=', result.id, 'numero=', result.numero_presupuesto);
  return {
    id: result.id,
    numero_presupuesto: result.numero_presupuesto,
    estado: result.estado,
    ignorada: false,
  };
}

module.exports = {
  crear,
  crearSolicitudPublica,
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
};
