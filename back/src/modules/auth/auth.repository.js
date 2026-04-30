// Repository — queries SQL del módulo auth.

const { sql, getPool } = require('../../shared/db/pool');

async function buscarPorUsuario(usuario) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('usuario', sql.NVarChar(50), usuario)
    .query(`
      SELECT TOP 1 id, usuario, password_hash, rol, activo
      FROM dbo.usuarios
      WHERE usuario = @usuario
    `);
  return r.recordset[0] || null;
}

module.exports = { buscarPorUsuario };
