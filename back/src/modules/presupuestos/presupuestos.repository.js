// Repository — queries SQL del módulo presupuestos.
// Sin req/res, sin lógica de negocio, sin Express. Solo SQL.
// Acepta `tx` opcional para operaciones transaccionales.

const { sql, getPool } = require('../../shared/db/pool');
const {
  PREFIJO_NUMERO,
  PAD_NUMERO,
  formatNumeroPresupuesto,
} = require('../../shared/constants/presupuestos');

// Devuelve un Request listo: si hay tx usa la transacción, sino el pool.
async function makeRequest(tx) {
  if (tx) return new sql.Request(tx);
  const pool = await getPool();
  return pool.request();
}

// ============================================================
// Header — consecutivo
// ============================================================

async function nextNumeroPresupuesto(tx) {
  // TABLOCKX/HOLDLOCK para evitar duplicados bajo concurrencia.
  const r = await new sql.Request(tx).query(`
    SELECT MAX(
      TRY_CAST(SUBSTRING(numero_presupuesto, ${PREFIJO_NUMERO.length + 1}, 50) AS INT)
    ) AS maxNum
    FROM dbo.presupuestos WITH (TABLOCKX, HOLDLOCK)
    WHERE numero_presupuesto LIKE '${PREFIJO_NUMERO}%'
  `);
  return formatNumeroPresupuesto((r.recordset[0].maxNum || 0) + 1);
}

// ============================================================
// Header — CRUD
// ============================================================

async function crearHeader(data, tx) {
  const reqDb = await makeRequest(tx);
  const result = await reqDb
    .input('numero_presupuesto', sql.NVarChar(20), data.numero_presupuesto)
    .input('servicio_id', sql.Int, data.servicio_id ?? null)
    .input('cliente_nombre', sql.NVarChar(200), data.cliente_nombre)
    .input('cliente_telefono', sql.NVarChar(50), data.cliente_telefono ?? null)
    .input('cliente_direccion', sql.NVarChar(500), data.cliente_direccion ?? null)
    .input('cliente_destinatario', sql.NVarChar(200), data.cliente_destinatario ?? null)
    .input('ciudad', sql.NVarChar(100), data.ciudad || 'CDMX')
    .input('fecha_documento', sql.Date, data.fecha_documento ?? null)
    .input('introduccion', sql.NVarChar(sql.MAX), data.introduccion ?? null)
    .input('nota_final', sql.NVarChar(sql.MAX), data.nota_final ?? null)
    .input('vigencia_dias', sql.Int, data.vigencia_dias ?? 7)
    .input('adelanto_porcentaje', sql.Decimal(5, 2), data.adelanto_porcentaje ?? 0)
    .input('moneda', sql.NVarChar(10), data.moneda || 'MXN')
    .input('notas_internas', sql.NVarChar(sql.MAX), data.notas_internas ?? null)
    .input('creado_por', sql.Int, data.creado_por)
    .query(`
      INSERT INTO dbo.presupuestos
        (numero_presupuesto, servicio_id,
         cliente_nombre, cliente_telefono, cliente_direccion, cliente_destinatario,
         ciudad,
         fecha_documento,
         introduccion, nota_final,
         vigencia_dias, adelanto_porcentaje, moneda,
         notas_internas, creado_por,
         total_general, estado, fecha_creacion, fecha_modificacion, activo)
      OUTPUT INSERTED.*
      VALUES
        (@numero_presupuesto, @servicio_id,
         @cliente_nombre, @cliente_telefono, @cliente_direccion, @cliente_destinatario,
         ISNULL(@ciudad, 'CDMX'),
         ISNULL(@fecha_documento, CAST(SYSUTCDATETIME() AS DATE)),
         @introduccion, @nota_final,
         @vigencia_dias, @adelanto_porcentaje, ISNULL(@moneda, 'MXN'),
         @notas_internas, @creado_por,
         0, 'borrador', SYSUTCDATETIME(), SYSUTCDATETIME(), 1)
    `);
  return result.recordset[0];
}

// Whitelist de campos permitidos para UPDATE de header.
const HEADER_UPDATABLE = {
  cliente_nombre:       sql.NVarChar(200),
  cliente_telefono:     sql.NVarChar(50),
  cliente_direccion:    sql.NVarChar(500),
  cliente_destinatario: sql.NVarChar(200),
  ciudad:               sql.NVarChar(100),
  fecha_documento:      sql.Date,
  introduccion:         sql.NVarChar(sql.MAX),
  nota_final:           sql.NVarChar(sql.MAX),
  vigencia_dias:        sql.Int,
  adelanto_porcentaje:  sql.Decimal(5, 2),
  moneda:               sql.NVarChar(10),
  notas_internas:       sql.NVarChar(sql.MAX),
  servicio_id:          sql.Int,
};

async function actualizarHeader(id, campos, tx) {
  const reqDb = await makeRequest(tx);
  reqDb.input('id', sql.Int, id);

  const sets = [];
  for (const [field, sqlType] of Object.entries(HEADER_UPDATABLE)) {
    if (campos[field] !== undefined) {
      reqDb.input(field, sqlType, campos[field]);
      sets.push(`${field} = @${field}`);
    }
  }
  if (!sets.length) return null;

  sets.push('fecha_modificacion = SYSUTCDATETIME()');

  const r = await reqDb.query(`
    UPDATE dbo.presupuestos
    SET ${sets.join(', ')}
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return r.recordset[0] || null;
}

async function actualizarTotal(id, total, tx) {
  const reqDb = await makeRequest(tx);
  await reqDb
    .input('id', sql.Int, id)
    .input('total', sql.Decimal(12, 2), total)
    .query(`
      UPDATE dbo.presupuestos
      SET total_general = @total, fecha_modificacion = SYSUTCDATETIME()
      WHERE id = @id
    `);
}

async function cambiarEstado(id, nuevoEstado, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('id', sql.Int, id)
    .input('estado', sql.NVarChar(20), nuevoEstado)
    .query(`
      UPDATE dbo.presupuestos
      SET estado = @estado, fecha_modificacion = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE id = @id
    `);
  return r.recordset[0] || null;
}

async function softDelete(id, tx) {
  const reqDb = await makeRequest(tx);
  await reqDb
    .input('id', sql.Int, id)
    .query('UPDATE dbo.presupuestos SET activo = 0, fecha_modificacion = SYSUTCDATETIME() WHERE id = @id');
}

async function buscarPorIdPlano(id, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('id', sql.Int, id)
    .query('SELECT * FROM dbo.presupuestos WHERE id = @id');
  return r.recordset[0] || null;
}

async function buscarPorIdCompleto(id, tx) {
  const reqDb = await makeRequest(tx);
  const headerR = await reqDb
    .input('id', sql.Int, id)
    .query('SELECT * FROM dbo.presupuestos WHERE id = @id AND activo = 1');
  if (!headerR.recordset.length) return null;
  const header = headerR.recordset[0];

  // Bloques (ordenados)
  const bloquesReq = await makeRequest(tx);
  const bloquesR = await bloquesReq
    .input('pid', sql.Int, id)
    .query(`
      SELECT id, presupuesto_id, orden, tipo, titulo, contenido_texto, subtotal
      FROM dbo.presupuesto_bloques
      WHERE presupuesto_id = @pid AND activo = 1
      ORDER BY orden ASC, id ASC
    `);
  const bloques = bloquesR.recordset;

  // Items por bloques (un solo query)
  let items = [];
  if (bloques.length) {
    const itemsReq = await makeRequest(tx);
    const ids = bloques.map((b) => b.id);
    const placeholders = ids.map((_, i) => {
      itemsReq.input(`b${i}`, sql.Int, ids[i]);
      return `@b${i}`;
    });
    const itemsR = await itemsReq.query(`
      SELECT id, bloque_id, orden, descripcion, cantidad, precio_unitario, es_opcional
      FROM dbo.presupuesto_bloque_items
      WHERE bloque_id IN (${placeholders.join(',')}) AND activo = 1
      ORDER BY bloque_id ASC, orden ASC, id ASC
    `);
    items = itemsR.recordset;
  }
  const itemsByBloque = items.reduce((acc, it) => {
    (acc[it.bloque_id] ||= []).push(it);
    return acc;
  }, {});

  return {
    ...header,
    bloques: bloques.map((b) => ({ ...b, items: itemsByBloque[b.id] || [] })),
  };
}

async function listar({ estados, creado_por, cliente, desde, hasta }, tx) {
  const reqDb = await makeRequest(tx);

  let where = 'WHERE activo = 1';

  if (Array.isArray(estados) && estados.length) {
    const placeholders = estados.map((_, i) => {
      reqDb.input(`e${i}`, sql.NVarChar(20), estados[i]);
      return `@e${i}`;
    });
    where += ` AND estado IN (${placeholders.join(',')})`;
  }
  if (creado_por !== undefined && creado_por !== null) {
    reqDb.input('creado_por', sql.Int, creado_por);
    where += ' AND creado_por = @creado_por';
  }
  if (cliente) {
    reqDb.input('cliente', sql.NVarChar(200), `%${cliente}%`);
    where += ' AND cliente_nombre LIKE @cliente';
  }
  if (desde) {
    reqDb.input('desde', sql.Date, desde);
    where += ' AND fecha_documento >= @desde';
  }
  if (hasta) {
    reqDb.input('hasta', sql.Date, hasta);
    where += ' AND fecha_documento <= @hasta';
  }

  const r = await reqDb.query(`
    SELECT id, numero_presupuesto, servicio_id,
           cliente_nombre, cliente_telefono, cliente_direccion,
           ciudad, fecha_documento, vigencia_dias, adelanto_porcentaje, moneda,
           total_general, estado,
           creado_por, fecha_creacion, fecha_modificacion
    FROM dbo.presupuestos
    ${where}
    ORDER BY fecha_creacion DESC
  `);
  return r.recordset;
}

// ============================================================
// Bloques
// ============================================================

async function crearBloque(data, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('presupuesto_id', sql.Int, data.presupuesto_id)
    .input('orden', sql.Int, data.orden)
    .input('tipo', sql.NVarChar(30), data.tipo)
    .input('titulo', sql.NVarChar(300), data.titulo ?? null)
    .input('contenido_texto', sql.NVarChar(sql.MAX), data.contenido_texto ?? null)
    .input('subtotal', sql.Decimal(12, 2), data.subtotal ?? null)
    .query(`
      INSERT INTO dbo.presupuesto_bloques
        (presupuesto_id, orden, tipo, titulo, contenido_texto, subtotal, activo)
      OUTPUT INSERTED.*
      VALUES
        (@presupuesto_id, @orden, @tipo, @titulo, @contenido_texto, @subtotal, 1)
    `);
  return r.recordset[0];
}

const BLOQUE_UPDATABLE = {
  titulo:          sql.NVarChar(300),
  contenido_texto: sql.NVarChar(sql.MAX),
  subtotal:        sql.Decimal(12, 2),
  orden:           sql.Int,
};

async function actualizarBloque(id, campos, tx) {
  const reqDb = await makeRequest(tx);
  reqDb.input('id', sql.Int, id);

  const sets = [];
  for (const [field, sqlType] of Object.entries(BLOQUE_UPDATABLE)) {
    if (campos[field] !== undefined) {
      reqDb.input(field, sqlType, campos[field]);
      sets.push(`${field} = @${field}`);
    }
  }
  if (!sets.length) return null;

  const r = await reqDb.query(`
    UPDATE dbo.presupuesto_bloques
    SET ${sets.join(', ')}
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return r.recordset[0] || null;
}

async function eliminarBloque(id, tx) {
  const reqDb = await makeRequest(tx);
  await reqDb
    .input('id', sql.Int, id)
    .query('DELETE FROM dbo.presupuesto_bloques WHERE id = @id');
}

async function listarBloquesDePresupuesto(presupuesto_id, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('pid', sql.Int, presupuesto_id)
    .query(`
      SELECT id, presupuesto_id, orden, tipo, titulo, contenido_texto, subtotal
      FROM dbo.presupuesto_bloques
      WHERE presupuesto_id = @pid AND activo = 1
      ORDER BY orden ASC, id ASC
    `);
  return r.recordset;
}

async function buscarBloquePorId(id, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('id', sql.Int, id)
    .query(`
      SELECT id, presupuesto_id, orden, tipo, titulo, contenido_texto, subtotal, activo
      FROM dbo.presupuesto_bloques
      WHERE id = @id
    `);
  return r.recordset[0] || null;
}

async function eliminarBloquesDePresupuesto(presupuesto_id, tx) {
  const reqDb = await makeRequest(tx);
  await reqDb
    .input('pid', sql.Int, presupuesto_id)
    .query('DELETE FROM dbo.presupuesto_bloques WHERE presupuesto_id = @pid');
}

async function obtenerMaxOrdenBloque(presupuesto_id, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('pid', sql.Int, presupuesto_id)
    .query(`
      SELECT ISNULL(MAX(orden), 0) AS maxOrden
      FROM dbo.presupuesto_bloques
      WHERE presupuesto_id = @pid AND activo = 1
    `);
  return r.recordset[0].maxOrden;
}

// ============================================================
// Items
// ============================================================

async function crearItem(data, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('bloque_id', sql.Int, data.bloque_id)
    .input('orden', sql.Int, data.orden)
    .input('descripcion', sql.NVarChar(500), data.descripcion)
    .input('cantidad', sql.Decimal(10, 2), data.cantidad)
    .input('precio_unitario', sql.Decimal(12, 2), data.precio_unitario)
    .input('es_opcional', sql.Bit, data.es_opcional ? 1 : 0)
    .query(`
      INSERT INTO dbo.presupuesto_bloque_items
        (bloque_id, orden, descripcion, cantidad, precio_unitario, es_opcional, activo)
      OUTPUT INSERTED.*
      VALUES
        (@bloque_id, @orden, @descripcion, @cantidad, @precio_unitario, @es_opcional, 1)
    `);
  return r.recordset[0];
}

const ITEM_UPDATABLE = {
  descripcion:     sql.NVarChar(500),
  cantidad:        sql.Decimal(10, 2),
  precio_unitario: sql.Decimal(12, 2),
  es_opcional:     sql.Bit,
  orden:           sql.Int,
};

async function actualizarItem(id, campos, tx) {
  const reqDb = await makeRequest(tx);
  reqDb.input('id', sql.Int, id);

  const sets = [];
  for (const [field, sqlType] of Object.entries(ITEM_UPDATABLE)) {
    if (campos[field] !== undefined) {
      const value = field === 'es_opcional' ? (campos[field] ? 1 : 0) : campos[field];
      reqDb.input(field, sqlType, value);
      sets.push(`${field} = @${field}`);
    }
  }
  if (!sets.length) return null;

  const r = await reqDb.query(`
    UPDATE dbo.presupuesto_bloque_items
    SET ${sets.join(', ')}
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return r.recordset[0] || null;
}

async function eliminarItem(id, tx) {
  const reqDb = await makeRequest(tx);
  await reqDb
    .input('id', sql.Int, id)
    .query('DELETE FROM dbo.presupuesto_bloque_items WHERE id = @id');
}

async function listarItemsDeBloque(bloque_id, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('bid', sql.Int, bloque_id)
    .query(`
      SELECT id, bloque_id, orden, descripcion, cantidad, precio_unitario, es_opcional
      FROM dbo.presupuesto_bloque_items
      WHERE bloque_id = @bid AND activo = 1
      ORDER BY orden ASC, id ASC
    `);
  return r.recordset;
}

async function buscarItemPorId(id, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('id', sql.Int, id)
    .query(`
      SELECT id, bloque_id, orden, descripcion, cantidad, precio_unitario, es_opcional, activo
      FROM dbo.presupuesto_bloque_items
      WHERE id = @id
    `);
  return r.recordset[0] || null;
}

async function obtenerMaxOrdenItem(bloque_id, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('bid', sql.Int, bloque_id)
    .query(`
      SELECT ISNULL(MAX(orden), 0) AS maxOrden
      FROM dbo.presupuesto_bloque_items
      WHERE bloque_id = @bid AND activo = 1
    `);
  return r.recordset[0].maxOrden;
}

async function calcularSubtotalSeccion(bloque_id, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('bid', sql.Int, bloque_id)
    .query(`
      SELECT ISNULL(SUM(cantidad * precio_unitario), 0) AS subtotal
      FROM dbo.presupuesto_bloque_items
      WHERE bloque_id = @bid AND es_opcional = 0 AND activo = 1
    `);
  return Number(r.recordset[0].subtotal) || 0;
}

module.exports = {
  // header
  nextNumeroPresupuesto,
  crearHeader,
  actualizarHeader,
  actualizarTotal,
  cambiarEstado,
  softDelete,
  buscarPorIdPlano,
  buscarPorIdCompleto,
  listar,
  // bloques
  crearBloque,
  actualizarBloque,
  eliminarBloque,
  listarBloquesDePresupuesto,
  buscarBloquePorId,
  eliminarBloquesDePresupuesto,
  obtenerMaxOrdenBloque,
  // items
  crearItem,
  actualizarItem,
  eliminarItem,
  listarItemsDeBloque,
  buscarItemPorId,
  obtenerMaxOrdenItem,
  calcularSubtotalSeccion,
};
