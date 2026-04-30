// Repository — queries SQL del módulo usuarios.

const { sql, getPool } = require('../../shared/db/pool');
const { ESTADO_SERVICIO } = require('../../shared/constants/estados');
const ROL = require('../../shared/constants/roles');

async function listarTecnicosConCarga() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT
      u.usuario,
      u.rol,
      u.activo,
      u.telefono,
      ISNULL(s.cnt, 0) AS carga
    FROM dbo.usuarios u
    LEFT JOIN (
      SELECT tecnico_asignado, COUNT(*) AS cnt
      FROM dbo.servicios
      WHERE activo = 1 AND estado IN ('${ESTADO_SERVICIO.PENDIENTE}','${ESTADO_SERVICIO.EN_PROCESO}')
      GROUP BY tecnico_asignado
    ) s ON s.tecnico_asignado = u.usuario
    WHERE u.rol IN ('${ROL.TECNICO}','${ROL.ADMIN}')
    ORDER BY u.rol DESC, u.usuario ASC
  `);
  return r.recordset;
}

async function listar() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT id, usuario, rol, activo, telefono, fecha_creacion
    FROM dbo.usuarios
    ORDER BY fecha_creacion DESC
  `);
  return r.recordset;
}

async function buscarPorUsuario(usuario, tx) {
  const reqDb = tx ? new sql.Request(tx) : (await getPool()).request();
  const r = await reqDb
    .input('usuario', sql.NVarChar(50), usuario)
    .query('SELECT id FROM dbo.usuarios WHERE usuario = @usuario');
  return r.recordset[0] || null;
}

async function buscarPorId(id, tx) {
  const reqDb = tx ? new sql.Request(tx) : (await getPool()).request();
  const r = await reqDb
    .input('id', sql.Int, id)
    .query('SELECT usuario FROM dbo.usuarios WHERE id = @id');
  return r.recordset[0] || null;
}

async function crear({ usuario, hash, rol, telefono }) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('usuario', sql.NVarChar(50), usuario)
    .input('hash', sql.NVarChar(255), hash)
    .input('rol', sql.NVarChar(20), rol)
    .input('telefono', sql.NVarChar(20), telefono)
    .query(`
      INSERT INTO dbo.usuarios (usuario, password_hash, rol, activo, telefono, fecha_creacion)
      OUTPUT INSERTED.id, INSERTED.usuario, INSERTED.rol, INSERTED.activo, INSERTED.telefono, INSERTED.fecha_creacion
      VALUES (@usuario, @hash, @rol, 1, @telefono, GETDATE())
    `);
  return r.recordset[0];
}

// Actualiza solo los campos presentes en `cambios`. Acepta tx opcional.
async function actualizar(id, cambios, tx) {
  const reqDb = tx ? new sql.Request(tx) : (await getPool()).request();
  reqDb.input('id', sql.Int, id);

  const sets = [];
  if (cambios.usuario !== undefined) {
    reqDb.input('usuario', sql.NVarChar(50), cambios.usuario);
    sets.push('usuario = @usuario');
  }
  if (cambios.rol !== undefined) {
    reqDb.input('rol', sql.NVarChar(20), cambios.rol);
    sets.push('rol = @rol');
  }
  if (cambios.activo !== undefined) {
    reqDb.input('activo', sql.Bit, cambios.activo ? 1 : 0);
    sets.push('activo = @activo');
  }
  if (cambios.telefono !== undefined) {
    reqDb.input('telefono', sql.NVarChar(20), cambios.telefono);
    sets.push('telefono = @telefono');
  }

  if (!sets.length) return null;

  const r = await reqDb.query(`
    UPDATE dbo.usuarios
    SET ${sets.join(', ')}
    OUTPUT INSERTED.id, INSERTED.usuario, INSERTED.rol, INSERTED.activo, INSERTED.telefono, INSERTED.fecha_creacion
    WHERE id = @id
  `);
  return r.recordset[0] || null;
}

// Cascade: actualiza referencias a usuario en servicios.
async function cascadeRenameEnServicios(oldUsuario, nuevoUsuario, tx) {
  await new sql.Request(tx)
    .input('old', sql.NVarChar(50), oldUsuario)
    .input('nuevo', sql.NVarChar(50), nuevoUsuario)
    .query(`
      UPDATE dbo.servicios SET tecnico_asignado = @nuevo WHERE tecnico_asignado = @old;
      UPDATE dbo.servicios SET atendido_por = @nuevo WHERE atendido_por = @old;
    `);
}

async function cambiarPassword(id, hash) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('id', sql.Int, id)
    .input('hash', sql.NVarChar(255), hash)
    .query(`
      UPDATE dbo.usuarios
      SET password_hash = @hash
      OUTPUT INSERTED.id
      WHERE id = @id
    `);
  return r.recordset[0] || null;
}

module.exports = {
  listarTecnicosConCarga,
  listar,
  buscarPorUsuario,
  buscarPorId,
  crear,
  actualizar,
  cascadeRenameEnServicios,
  cambiarPassword,
};
