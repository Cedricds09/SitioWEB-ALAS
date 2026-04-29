// Helper para ejecutar lógica dentro de una transacción.
// withTransaction(async (tx) => { ... }) -> begin/commit, rollback en error.

const { sql, getPool } = require('./pool');

async function withTransaction(fn) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // ignora errores de rollback (la tx pudo no haber empezado)
    }
    throw err;
  }
}

module.exports = { withTransaction };
