// Repository — queries SQL del módulo clientes.
// Fuente única: tabla servicios. NO usa tabla notas.

const { sql, getPool } = require('../../shared/db/pool');

async function buscar({ q, limit }) {
  const pool = await getPool();
  const reqDb = pool.request();

  let where = 'WHERE activo = 1';
  if (q) {
    reqDb.input('q', sql.NVarChar(100), `%${q}%`);
    where += ' AND (numero_cliente LIKE @q OR nombre_cliente LIKE @q)';
  }

  // Agrupado por numero_cliente para evitar duplicados.
  // Devuelve metadata útil (conteo de servicios y fecha del último) para la UI.
  const result = await reqDb.query(`
    SELECT TOP (${limit})
      numero_cliente,
      MAX(nombre_cliente) AS nombre_cliente,
      MAX(telefono)       AS telefono,
      COUNT(*)            AS total_servicios,
      MAX(fecha_inicio)   AS ultimo_servicio
    FROM dbo.servicios
    ${where}
    GROUP BY numero_cliente
    ORDER BY MAX(fecha_inicio) DESC
  `);

  return result.recordset;
}

module.exports = { buscar };
