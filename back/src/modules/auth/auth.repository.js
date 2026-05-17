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

// ============================================================
// TOKEN VERSION — revocación de sesiones (patrón escalable).
//
// Hoy: query directa a SQL Server por PK (O(1), ~2 ms).
// Con 100+ usuarios concurrentes: agregar Redis como cache
//   (TTL = duración del token, 8 h). getTokenVersion() consultará
//   cache primero y DB como fallback — solo cambia este archivo,
//   nada en el service ni en session.js.
// Con multi-tenant: agregar empresa_id al WHERE.
// Con revocación por dispositivo: agregar device_id al token y a
//   la tabla, y filtrar por device_id aquí.
// ============================================================

// Devuelve el token_version del usuario, o null si no existe / está inactivo.
// Si la columna no existe (migración 009 pendiente) la query lanza error 207;
// el caller decide la degradación (ver session.verifyToken / auth.login).
async function getTokenVersion(uid) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('uid', sql.Int, uid)
    .query('SELECT token_version FROM dbo.usuarios WHERE id = @uid AND activo = 1');
  return r.recordset[0]?.token_version ?? null;
}

// Incrementa token_version → invalida de inmediato todos los tokens previos
// de ese usuario. Se llama en logout y al cambiar contraseña.
async function incrementTokenVersion(uid) {
  const pool = await getPool();
  await pool
    .request()
    .input('uid', sql.Int, uid)
    .query('UPDATE dbo.usuarios SET token_version = token_version + 1 WHERE id = @uid');
}

module.exports = {
  buscarPorUsuario,
  getTokenVersion,
  incrementTokenVersion,
};
