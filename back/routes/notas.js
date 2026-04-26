const express = require('express');
const { sql, getPool } = require('../db');

const router = express.Router();

// GET /api/notas/:cliente?validacion=XXXX
router.get('/:cliente', async (req, res) => {
  const { cliente } = req.params;
  const { validacion } = req.query;

  console.log(`[NOTAS] GET cliente=${cliente} validacion=${validacion}`);

  if (!cliente || !validacion) {
    console.warn('[NOTAS] Faltan parámetros cliente/validacion');
    return res.status(400).json({
      ok: false,
      error: 'Parámetros requeridos: cliente (param) y validacion (query).',
    });
  }

  try {
    const pool = await getPool();

    const clienteTrim = String(cliente).trim();
    const validacionTrim = String(validacion).trim();

    const result = await pool
      .request()
      .input('cliente', sql.NVarChar(50), clienteTrim)
      .input('validacion', sql.NVarChar(50), validacionTrim)
      .query(`
        SELECT TOP 1
          id,
          numero_cliente,
          nombre_cliente,
          numero_nota,
          validacion,
          telefono,
          fecha,
          conceptos,
          total,
          estado
        FROM dbo.notas
        WHERE LTRIM(RTRIM(CAST(numero_cliente AS NVARCHAR(50)))) = @cliente
          AND (
                LTRIM(RTRIM(CAST(validacion   AS NVARCHAR(50)))) = @validacion
             OR LTRIM(RTRIM(CAST(numero_nota AS NVARCHAR(50)))) = @validacion
          )
      `);

    if (result.recordset.length === 0) {
      console.warn(`[NOTAS] Sin coincidencia cliente=${clienteTrim} validacion=${validacionTrim}`);

      // DIAG: listar qué existe para ese cliente
      const diag = await pool
        .request()
        .input('cliente', sql.NVarChar(50), clienteTrim)
        .query(`
          SELECT TOP 5 id, numero_cliente, numero_nota, validacion
          FROM dbo.notas
          WHERE LTRIM(RTRIM(CAST(numero_cliente AS NVARCHAR(50)))) = @cliente
        `);
      console.warn(`[NOTAS][DIAG] filas con ese cliente: ${diag.recordset.length}`);
      diag.recordset.forEach((r) => {
        console.warn(
          `[NOTAS][DIAG] id=${r.id} numero_cliente="${r.numero_cliente}" numero_nota="${r.numero_nota}" validacion="${r.validacion}"`
        );
      });

      return res.status(404).json({
        ok: false,
        error: 'Cliente no encontrado o datos de validación incorrectos.',
      });
    }

    const row = result.recordset[0];

    const respuesta = {
      id: row.numero_nota ?? row.id,
      cliente: row.numero_cliente,
      nombre: row.nombre_cliente || null,
      telefono: row.telefono || null,
      fecha: row.fecha,
      conceptos: row.conceptos,
      total: Number(row.total),
      estado: row.estado,
    };

    console.log(`[NOTAS] OK cliente=${cliente} total=${respuesta.total} estado=${respuesta.estado}`);
    return res.json({ ok: true, data: respuesta });
  } catch (err) {
    console.error('[NOTAS] Error en consulta:', err.message);
    return res.status(500).json({
      ok: false,
      error: 'Error interno del servidor.',
    });
  }
});

module.exports = router;
