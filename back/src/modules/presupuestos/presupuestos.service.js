// Service — reglas de negocio del módulo presupuestos.
// Sin SQL crudo, sin Express. Llama al repository y lanza errores tipados.

const repo = require('./presupuestos.repository');
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
  total = Math.round(total * 100) / 100; // 2 decimales
  await repo.actualizarTotal(presupuesto_id, total, tx);
  return total;
}

function _validarPropiedad(presupuesto, sesion) {
  if (sesion.rol === ROL.ADMIN) return;
  if (presupuesto.creado_por !== sesion.uid) {
    throw new ForbiddenError('No autorizado para acceder a este presupuesto.');
  }
}

function _validarEditable(presupuesto) {
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

async function listar({ estado, mine, cliente, desde, hasta }, sesion) {
  const isAdmin = sesion.rol === ROL.ADMIN;
  const estados = (estado || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const filtraMis = !isAdmin || mine === true;
  const creado_por = filtraMis ? sesion.uid : undefined;

  return repo.listar({ estados, creado_por, cliente, desde, hasta });
}

// ============================================================
// Obtener
// ============================================================

async function obtener(id, sesion) {
  const p = await repo.buscarPorIdCompleto(id);
  if (!p) throw new NotFoundError('Presupuesto no encontrado.');
  _validarPropiedad(p, sesion);
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
    _validarEditable(cur);

    const headerCampos = { ...campos };
    delete headerCampos.bloques;
    if (Object.keys(headerCampos).some((k) => headerCampos[k] !== undefined)) {
      await repo.actualizarHeader(id, headerCampos, tx);
    }

    if (Array.isArray(campos.bloques)) {
      // Reemplaza el set completo de bloques.
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
    _validarEditable(p);

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
    _validarEditable(p);

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
      // Solo titulo/orden — items se manejan por sus propios endpoints.
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
    _validarEditable(p);

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
    _validarEditable(p);

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
    _validarEditable(p);

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
    _validarEditable(p);

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

  // Permisos por destino:
  // aprobado / convertido → admin
  // enviado / rechazado → owner o admin (ya validado en _validarPropiedad)
  const requiereAdmin = [ESTADO_PRESUPUESTO.APROBADO, ESTADO_PRESUPUESTO.CONVERTIDO];
  if (requiereAdmin.includes(nuevoEstado) && sesion.rol !== ROL.ADMIN) {
    throw new ForbiddenError(`Cambiar a estado "${nuevoEstado}" requiere rol admin.`);
  }

  const updated = await repo.cambiarEstado(id, nuevoEstado);
  console.log(`[PRES] estado id=${id} ${p.estado} → ${nuevoEstado}`);
  return updated;
}

async function convertirAServicio(id, sesion) {
  const p = await repo.buscarPorIdPlano(id);
  if (!p || !p.activo) throw new NotFoundError('Presupuesto no encontrado.');
  _validarPropiedad(p, sesion);

  if (p.estado !== ESTADO_PRESUPUESTO.APROBADO) {
    throw new ConflictError(
      `Solo se puede convertir un presupuesto en estado aprobado (actual: ${p.estado}).`,
    );
  }
  if (sesion.rol !== ROL.ADMIN) {
    throw new ForbiddenError('Convertir a servicio requiere rol admin.');
  }

  await repo.cambiarEstado(id, ESTADO_PRESUPUESTO.CONVERTIDO);
  console.log('[PRES] convertido id=', id, '(generación de servicio pendiente Fase 4)');

  return {
    ok: true,
    mensaje: 'Conversión registrada. Generación del servicio completo pendiente para Fase 4.',
    presupuesto_id: id,
  };
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
