// Repository — queries SQL del módulo resenas.
// Sin req/res, sin lógica de negocio.

const { sql, getPool } = require('../../shared/db/pool');

// Verifica que el par (numero_cliente, telefono) existe en dbo.notas.
// Mismo criterio que el módulo notas: trim + cast para tolerar formatos.
async function validarCliente(numero_cliente, telefono) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('cliente', sql.NVarChar(50), numero_cliente)
    .input('telefono', sql.NVarChar(50), telefono)
    .query(`
      SELECT TOP 1 id FROM dbo.notas
      WHERE LTRIM(RTRIM(CAST(numero_cliente AS NVARCHAR(50)))) = @cliente
        AND LTRIM(RTRIM(CAST(telefono AS NVARCHAR(50)))) = @telefono
    `);
  return r.recordset[0] || null;
}

// Cuenta reseñas pendientes/aprobadas de un cliente (anti-spam).
async function contarResenasCliente(numero_cliente) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('cliente', sql.NVarChar(50), numero_cliente)
    .query(`
      SELECT COUNT(*) AS total FROM dbo.resenas
      WHERE numero_cliente = @cliente
        AND estado IN ('pendiente','aprobada')
        AND activo = 1
    `);
  return r.recordset[0].total;
}

async function crearResena(data) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('numero_cliente', sql.NVarChar(50), data.numero_cliente)
    .input('telefono', sql.NVarChar(20), data.telefono)
    .input('nombre_display', sql.NVarChar(100), data.nombre_display)
    .input('colonia', sql.NVarChar(100), data.colonia || null)
    .input('tipo_servicio', sql.NVarChar(50), data.tipo_servicio || null)
    .input('texto', sql.NVarChar(1000), data.texto)
    .query(`
      INSERT INTO dbo.resenas
        (numero_cliente, telefono, nombre_display, colonia, tipo_servicio, texto, estado)
      OUTPUT INSERTED.id
      VALUES
        (@numero_cliente, @telefono, @nombre_display, @colonia, @tipo_servicio, @texto, 'pendiente')
    `);
  return r.recordset[0].id;
}

// Reseñas aprobadas para el sitio público: máx 10, orden aleatorio.
async function listarPublicas() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT TOP 10 id, nombre_display, colonia, tipo_servicio, texto
    FROM dbo.resenas
    WHERE estado = 'aprobada' AND activo = 1
    ORDER BY NEWID()
  `);
  return r.recordset;
}

// Todas las reseñas activas para moderación: pendientes primero, luego por fecha.
// Paginación opt-in: sin limit devuelve todas (comportamiento actual).
async function listarAdmin({ page, limit } = {}) {
  const pool = await getPool();
  const reqDb = pool.request();
  let paging = '';
  if (limit && limit > 0) {
    const off = ((page && page > 0 ? page : 1) - 1) * limit;
    reqDb.input('off', sql.Int, off).input('lim', sql.Int, limit);
    paging = ' OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY';
  }
  const r = await reqDb.query(`
    SELECT id, numero_cliente, telefono, nombre_display, colonia, tipo_servicio,
           texto, estado, fecha_creacion, fecha_moderacion
    FROM dbo.resenas
    WHERE activo = 1
    ORDER BY CASE estado WHEN 'pendiente' THEN 0 ELSE 1 END, fecha_creacion DESC${paging}
  `);
  return r.recordset;
}

async function obtenerPorId(id) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('id', sql.Int, id)
    .query('SELECT id, estado, activo FROM dbo.resenas WHERE id = @id');
  return r.recordset[0] || null;
}

async function moderarResena(id, estado) {
  const pool = await getPool();
  await pool
    .request()
    .input('id', sql.Int, id)
    .input('estado', sql.NVarChar(20), estado)
    .query(`
      UPDATE dbo.resenas
      SET estado = @estado, fecha_moderacion = SYSUTCDATETIME()
      WHERE id = @id
    `);
}

async function contarPendientes() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT COUNT(*) AS total FROM dbo.resenas
    WHERE estado = 'pendiente' AND activo = 1
  `);
  return r.recordset[0].total;
}

module.exports = {
  validarCliente,
  contarResenasCliente,
  crearResena,
  listarPublicas,
  listarAdmin,
  obtenerPorId,
  moderarResena,
  contarPendientes,
};
