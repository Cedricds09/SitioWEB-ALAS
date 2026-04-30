// Repository — queries SQL del módulo clientes.
// Fuente única: tabla servicios. NO usa tabla notas.

const { sql, getPool } = require('../../shared/db/pool');

async function buscar({ q, limit }) {
  const pool = await getPool();
  const reqDb = pool.request();

  // limit ya viene validado por Zod (clientes.schema.js): int ∈ [1, 100], default 20.
  reqDb.input('limit', sql.Int, limit);

  let where = 'WHERE activo = 1';
  if (q) {
    reqDb.input('q', sql.NVarChar(100), `%${q}%`);
    where += ' AND (numero_cliente LIKE @q OR nombre_cliente LIKE @q)';
  }

  // Agrupado por numero_cliente para evitar duplicados.
  // Devuelve metadata útil (conteo de servicios y fecha del último) para la UI.
  const result = await reqDb.query(`
    SELECT
      numero_cliente,
      MAX(nombre_cliente) AS nombre_cliente,
      MAX(telefono)       AS telefono,
      COUNT(*)            AS total_servicios,
      MAX(fecha_inicio)   AS ultimo_servicio
    FROM dbo.servicios
    ${where}
    GROUP BY numero_cliente
    ORDER BY MAX(fecha_inicio) DESC
    OFFSET 0 ROWS
    FETCH NEXT @limit ROWS ONLY
  `);

  return result.recordset;
}

module.exports = { buscar };
