// Helper one-off: imprime últimas N filas de dbo.ai_generations.
// Uso: node back/scripts/check-ai-tracking.js [N]
require('../src/shared/config/env');
const { getPool } = require('../src/shared/db/pool');

const N = parseInt(process.argv[2], 10) || 5;

(async () => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT TOP ${N} id, presupuesto_id, tokens_input, tokens_output,
           costo_estimado_usd, modelo, modo, exitoso, error_mensaje,
           created_at
    FROM dbo.ai_generations
    ORDER BY id DESC
  `);
  console.log(JSON.stringify(r.recordset, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
