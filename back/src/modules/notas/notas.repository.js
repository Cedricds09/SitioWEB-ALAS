// Queries SQL del módulo notas. Sin req/res ni lógica de negocio.

const { sql, getPool } = require('../../shared/db/pool');

async function buscarPorClienteValidacion(cliente, validacion) {
  const pool = await getPool();
  // JOIN con servicios para traer tipo_servicio. dbo.notas no tiene esa
  // columna; la hereda del servicio que generó la nota.
  // TOP 10 por fecha DESC: si la validacion es un telefono el cliente
  // puede tener varias notas, devolvemos las mas recientes.
  const result = await pool
    .request()
    .input('cliente', sql.NVarChar(50), cliente)
    .input('validacion', sql.NVarChar(50), validacion)
    .query(`
      SELECT TOP 10
        n.id,
        n.numero_cliente,
        n.nombre_cliente,
        n.numero_nota,
        n.validacion,
        n.telefono,
        n.fecha,
        n.conceptos,
        n.total,
        n.estado,
        s.tipo_servicio
      FROM dbo.notas n
      LEFT JOIN dbo.servicios s ON s.numero_nota = n.numero_nota
      WHERE LTRIM(RTRIM(CAST(n.numero_cliente AS NVARCHAR(50)))) = @cliente
        AND (
              LTRIM(RTRIM(CAST(n.validacion   AS NVARCHAR(50)))) = @validacion
           OR LTRIM(RTRIM(CAST(n.numero_nota  AS NVARCHAR(50)))) = @validacion
        )
      ORDER BY n.fecha DESC
    `);
  return result.recordset;
}

// Lista qué hay para ese cliente. Útil para debug cuando no hay match.
async function diagnosticarCliente(cliente) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('cliente', sql.NVarChar(50), cliente)
    .query(`
      SELECT TOP 5 id, numero_cliente, numero_nota, validacion
      FROM dbo.notas
      WHERE LTRIM(RTRIM(CAST(numero_cliente AS NVARCHAR(50)))) = @cliente
    `);
  return result.recordset;
}

// Lista todas las notas de un cliente (para historial agregado en clientes module).
async function listarPorCliente(numero_cliente) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('cliente', sql.NVarChar(50), numero_cliente)
    .query(`
      SELECT id, numero_cliente, nombre_cliente, numero_nota, validacion,
             telefono, fecha, conceptos, total, estado
      FROM dbo.notas
      WHERE LTRIM(RTRIM(CAST(numero_cliente AS NVARCHAR(50)))) = @cliente
      ORDER BY fecha DESC
    `);
  return r.recordset;
}

module.exports = {
  buscarPorClienteValidacion,
  diagnosticarCliente,
  listarPorCliente,
};
