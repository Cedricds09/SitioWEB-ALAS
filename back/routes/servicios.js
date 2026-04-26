const express = require('express');
const { sql, getPool } = require('../db');

const router = express.Router();

const PREFIJO_NOTA = 'ALAS-';
const PAD = 4;

function formatNotaCode(n) {
  return `${PREFIJO_NOTA}${String(n).padStart(PAD, '0')}`;
}

// POST /api/servicios  -> crear servicio
router.post('/', async (req, res) => {
  const { numero_cliente, nombre_cliente, telefono, descripcion, total } = req.body || {};

  console.log('[SERV] POST crear', { numero_cliente, nombre_cliente, telefono, total });

  if (!numero_cliente || !nombre_cliente || !descripcion) {
    return res.status(400).json({
      ok: false,
      error: 'Campos requeridos: numero_cliente, nombre_cliente, descripcion.',
    });
  }

  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('numero_cliente', sql.NVarChar(50), String(numero_cliente).trim())
      .input('nombre_cliente', sql.NVarChar(100), String(nombre_cliente).trim())
      .input('telefono', sql.NVarChar(20), telefono ? String(telefono).trim() : null)
      .input('descripcion', sql.NVarChar(sql.MAX), String(descripcion).trim())
      .input('total', sql.Decimal(12, 2), Number(total) || 0)
      .input('estado', sql.NVarChar(20), 'PENDIENTE')
      .query(`
        INSERT INTO dbo.servicios
          (numero_cliente, nombre_cliente, telefono, descripcion, total, estado, fecha_inicio)
        OUTPUT INSERTED.*
        VALUES
          (@numero_cliente, @nombre_cliente, @telefono, @descripcion, @total, @estado, GETDATE())
      `);

    console.log('[SERV] creado id=', result.recordset[0].id);
    return res.status(201).json({ ok: true, data: result.recordset[0] });
  } catch (err) {
    console.error('[SERV] Error crear:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

// GET /api/servicios?estado=PENDIENTE,EN_PROCESO
router.get('/', async (req, res) => {
  const filtro = (req.query.estado || 'PENDIENTE,EN_PROCESO')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  try {
    const pool = await getPool();
    const reqDb = pool.request();
    const placeholders = filtro.map((_, i) => {
      reqDb.input(`e${i}`, sql.NVarChar(20), filtro[i]);
      return `@e${i}`;
    });

    const result = await reqDb.query(`
      SELECT id, numero_cliente, nombre_cliente, telefono, descripcion,
             total, estado, fecha_inicio, fecha_fin
      FROM dbo.servicios
      WHERE estado IN (${placeholders.join(',')})
      ORDER BY fecha_inicio DESC
    `);

    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    console.error('[SERV] Error listar:', err.message);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

// POST /api/servicios/:id/finalizar
router.post('/:id/finalizar', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'id inválido.' });
  }

  console.log('[SERV] POST finalizar id=', id);

  let pool;
  let tx;
  try {
    pool = await getPool();
    tx = new sql.Transaction(pool);
    await tx.begin();

    // 1. Lock + traer servicio
    const r1 = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .query(`
        SELECT id, numero_cliente, nombre_cliente, telefono, descripcion, total, estado
        FROM dbo.servicios WITH (UPDLOCK, ROWLOCK)
        WHERE id = @id
      `);

    if (r1.recordset.length === 0) {
      await tx.rollback();
      return res.status(404).json({ ok: false, error: 'Servicio no encontrado.' });
    }

    const serv = r1.recordset[0];
    if (String(serv.estado).toUpperCase() === 'TERMINADO') {
      await tx.rollback();
      return res.status(409).json({ ok: false, error: 'Servicio ya terminado.' });
    }

    // 2. Calcular siguiente numero_nota global
    const r2 = await new sql.Request(tx).query(`
      SELECT MAX(
        TRY_CAST(SUBSTRING(numero_nota, ${PREFIJO_NOTA.length + 1}, 50) AS INT)
      ) AS maxNum
      FROM dbo.notas WITH (TABLOCKX, HOLDLOCK)
      WHERE numero_nota LIKE '${PREFIJO_NOTA}%'
    `);
    const siguiente = (r2.recordset[0].maxNum || 0) + 1;
    const numeroNota = formatNotaCode(siguiente);

    // 3. Update servicio
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .query(`
        UPDATE dbo.servicios
        SET estado = 'TERMINADO', fecha_fin = GETDATE()
        WHERE id = @id
      `);

    // 4. Insertar nota
    const r3 = await new sql.Request(tx)
      .input('numero_cliente', sql.NVarChar(50), serv.numero_cliente)
      .input('nombre_cliente', sql.NVarChar(100), serv.nombre_cliente)
      .input('telefono', sql.NVarChar(20), serv.telefono)
      .input('conceptos', sql.NVarChar(sql.MAX), serv.descripcion)
      .input('total', sql.Decimal(12, 2), Number(serv.total) || 0)
      .input('estado', sql.NVarChar(20), 'PAGADO')
      .input('numero_nota', sql.NVarChar(20), numeroNota)
      .input('validacion', sql.NVarChar(50), serv.telefono || numeroNota)
      .query(`
        INSERT INTO dbo.notas
          (numero_cliente, nombre_cliente, telefono, validacion,
           conceptos, total, estado, fecha, numero_nota)
        OUTPUT INSERTED.*
        VALUES
          (@numero_cliente, @nombre_cliente, @telefono, @validacion,
           @conceptos, @total, @estado, GETDATE(), @numero_nota)
      `);

    await tx.commit();
    console.log(`[SERV] finalizado id=${id} numero_nota=${numeroNota}`);
    return res.json({ ok: true, data: { servicio_id: id, numero_nota: numeroNota, nota: r3.recordset[0] } });
  } catch (err) {
    console.error('[SERV] Error finalizar:', err.message);
    if (tx) {
      try { await tx.rollback(); } catch {}
    }
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

module.exports = router;
