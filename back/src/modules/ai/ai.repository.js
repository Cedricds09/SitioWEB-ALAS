// Repository del módulo ai — queries SQL sobre dbo.ai_generations.
// Sin lógica de negocio.

const { sql, getPool } = require('../../shared/db/pool');

async function makeRequest(tx) {
  if (tx) return new sql.Request(tx);
  const pool = await getPool();
  return pool.request();
}

/**
 * Cuenta generaciones globales en la última hora (exitosas + fallidas).
 * Usado por el circuit breaker.
 */
async function countLastHour(tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb.query(`
    SELECT COUNT(*) AS total
    FROM dbo.ai_generations
    WHERE created_at >= DATEADD(HOUR, -1, SYSUTCDATETIME())
  `);
  return Number(r.recordset[0]?.total) || 0;
}

/**
 * Inserta una fila de tracking. Llamado tanto en éxito como en fallo.
 * @param {object} data
 *   - user_id            INT NOT NULL
 *   - presupuesto_id     INT NOT NULL
 *   - tokens_input       INT
 *   - tokens_output      INT
 *   - costo_estimado_usd DECIMAL(10,6)
 *   - modelo             NVARCHAR(50)
 *   - modo               NVARCHAR(20)
 *   - exitoso            BIT
 *   - error_mensaje      NVARCHAR(500) | null
 */
async function registrarGeneracion(data, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('user_id', sql.Int, data.user_id)
    .input('presupuesto_id', sql.Int, data.presupuesto_id)
    .input('tokens_input', sql.Int, data.tokens_input ?? 0)
    .input('tokens_output', sql.Int, data.tokens_output ?? 0)
    .input('costo_estimado_usd', sql.Decimal(10, 6), data.costo_estimado_usd ?? 0)
    .input('modelo', sql.NVarChar(50), data.modelo)
    .input('modo', sql.NVarChar(20), data.modo)
    .input('exitoso', sql.Bit, data.exitoso ? 1 : 0)
    .input('error_mensaje', sql.NVarChar(500), data.error_mensaje ?? null)
    .query(`
      INSERT INTO dbo.ai_generations
        (user_id, presupuesto_id, tokens_input, tokens_output,
         costo_estimado_usd, modelo, modo, exitoso, error_mensaje)
      OUTPUT INSERTED.id, INSERTED.created_at
      VALUES
        (@user_id, @presupuesto_id, @tokens_input, @tokens_output,
         @costo_estimado_usd, @modelo, @modo, @exitoso, @error_mensaje)
    `);
  return r.recordset[0];
}

module.exports = {
  countLastHour,
  registrarGeneracion,
};
