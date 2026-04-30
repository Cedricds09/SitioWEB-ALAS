// Repository — queries SQL del módulo notas.
// Sin req/res, sin lógica de negocio.

const { sql, getPool } = require('../../shared/db/pool');

async function buscarPorClienteValidacion(cliente, validacion) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('cliente', sql.NVarChar(50), cliente)
    .input('validacion', sql.NVarChar(50), validacion)
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
  return result.recordset[0] || null;
}

// DIAG: lista qué existe para ese cliente. Útil para troubleshooting cuando no hay match.
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

module.exports = {
  buscarPorClienteValidacion,
  diagnosticarCliente,
};
