// Repository — todos los queries SQL del módulo servicios.
// Sin req/res, sin lógica de negocio, sin Express. Solo SQL.
// Acepta `tx` opcional para operaciones transaccionales.

const { sql, getPool } = require('../../shared/db/pool');
const {
  PREFIJO_NOTA,
  PREFIJO_CLIENTE,
  formatNotaCode,
  formatClienteCode,
} = require('../../shared/utils/consecutivos');
const { ESTADO_SERVICIO, ESTADOS_ACTIVOS } = require('../../shared/constants/estados');
const ROL = require('../../shared/constants/roles');

// Devuelve un Request listo: si hay tx usa la transacción, sino el pool.
async function makeRequest(tx) {
  if (tx) return new sql.Request(tx);
  const pool = await getPool();
  return pool.request();
}

// ============================================================
// Consecutivos
// ============================================================

async function nextNumeroCliente(tx) {
  const r = await new sql.Request(tx).query(`
    SELECT MAX(
      TRY_CAST(SUBSTRING(numero_cliente, ${PREFIJO_CLIENTE.length + 1}, 50) AS INT)
    ) AS maxNum
    FROM dbo.servicios WITH (TABLOCKX, HOLDLOCK)
    WHERE numero_cliente LIKE '${PREFIJO_CLIENTE}%'
  `);
  return formatClienteCode((r.recordset[0].maxNum || 0) + 1);
}

async function nextNumeroNota(tx) {
  const r = await new sql.Request(tx).query(`
    SELECT MAX(
      TRY_CAST(SUBSTRING(numero_nota, ${PREFIJO_NOTA.length + 1}, 50) AS INT)
    ) AS maxNum
    FROM dbo.notas WITH (TABLOCKX, HOLDLOCK)
    WHERE numero_nota LIKE '${PREFIJO_NOTA}%'
  `);
  return formatNotaCode((r.recordset[0].maxNum || 0) + 1);
}

// ============================================================
// Asignación automática de técnico (menor carga)
// ============================================================

async function asignarTecnicoAuto(tx) {
  const r = await new sql.Request(tx).query(`
    SELECT TOP 1 u.usuario
    FROM dbo.usuarios u
    LEFT JOIN (
      SELECT tecnico_asignado, COUNT(*) AS cnt
      FROM dbo.servicios
      WHERE activo = 1 AND estado IN ('${ESTADO_SERVICIO.PENDIENTE}','${ESTADO_SERVICIO.EN_PROCESO}')
      GROUP BY tecnico_asignado
    ) s ON s.tecnico_asignado = u.usuario
    WHERE u.rol = '${ROL.TECNICO}' AND u.activo = 1
    ORDER BY ISNULL(s.cnt, 0) ASC, u.id ASC
  `);
  if (r.recordset.length) return r.recordset[0].usuario;

  const f = await new sql.Request(tx).query(`
    SELECT TOP 1 usuario
    FROM dbo.usuarios
    WHERE rol = '${ROL.ADMIN}' AND activo = 1
    ORDER BY id ASC
  `);
  return f.recordset.length ? f.recordset[0].usuario : null;
}

// ============================================================
// CRUD de servicios
// ============================================================

async function crearServicio(data, tx) {
  const reqDb = await makeRequest(tx);
  const result = await reqDb
    .input('numero_cliente', sql.NVarChar(50), data.numero_cliente)
    .input('nombre_cliente', sql.NVarChar(100), data.nombre_cliente)
    .input('telefono', sql.NVarChar(20), data.telefono)
    .input('direccion', sql.NVarChar(255), data.direccion)
    .input('lat', sql.Decimal(10, 7), data.lat)
    .input('lng', sql.Decimal(10, 7), data.lng)
    .input('conceptos', sql.NVarChar(sql.MAX), data.conceptos)
    .input('total', sql.Decimal(12, 2), data.total)
    .input('estado', sql.NVarChar(20), ESTADO_SERVICIO.PENDIENTE)
    .input('tecnico_asignado', sql.NVarChar(50), data.tecnico_asignado)
    .query(`
      INSERT INTO dbo.servicios
        (numero_cliente, nombre_cliente, telefono, direccion, lat, lng, conceptos, total,
         estado, fecha_inicio, tecnico_asignado)
      OUTPUT INSERTED.*
      VALUES
        (@numero_cliente, @nombre_cliente, @telefono, @direccion, @lat, @lng, @conceptos, @total,
         @estado, GETDATE(), @tecnico_asignado)
    `);
  return result.recordset[0];
}

async function listarServicios({ estados, tecnico }) {
  const pool = await getPool();
  const reqDb = pool.request();
  const placeholders = estados.map((_, i) => {
    reqDb.input(`e${i}`, sql.NVarChar(20), estados[i]);
    return `@e${i}`;
  });
  let whereTec = '';
  if (tecnico !== undefined) {
    reqDb.input('tec', sql.NVarChar(50), tecnico || '');
    whereTec = ' AND tecnico_asignado = @tec';
  }
  const result = await reqDb.query(`
    SELECT id, numero_cliente, nombre_cliente, telefono, direccion, lat, lng, conceptos,
           total, estado, fecha_inicio, fecha_fin, ajuste,
           tecnico_asignado, atendido_por, numero_nota, resolucion
    FROM dbo.servicios
    WHERE activo = 1 AND estado IN (${placeholders.join(',')})
      ${whereTec}
    ORDER BY fecha_inicio DESC
  `);
  return result.recordset;
}

async function listarPorCliente(numero_cliente) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('numero_cliente', sql.NVarChar(50), numero_cliente)
    .query(`
      SELECT id, numero_cliente, nombre_cliente, telefono, direccion, lat, lng, conceptos,
             total, estado, fecha_inicio, fecha_fin, ajuste,
             tecnico_asignado, atendido_por, numero_nota, resolucion
      FROM dbo.servicios
      WHERE activo = 1 AND numero_cliente = @numero_cliente
      ORDER BY fecha_inicio DESC
    `);
  return result.recordset;
}

async function buscarPorId(id, { lock = false } = {}, tx) {
  const reqDb = await makeRequest(tx);
  const lockHint = lock ? 'WITH (UPDLOCK, ROWLOCK)' : '';
  const result = await reqDb.input('id', sql.Int, id).query(`
    SELECT id, numero_cliente, nombre_cliente, telefono, direccion, lat, lng, conceptos,
           total, estado, fecha_inicio, fecha_fin, ajuste,
           tecnico_asignado, atendido_por, numero_nota, resolucion, activo
    FROM dbo.servicios ${lockHint}
    WHERE id = @id
  `);
  return result.recordset[0] || null;
}

// Edita un servicio. `campos` es objeto con solo los campos a cambiar.
async function actualizarServicio(id, campos) {
  const sets = [];
  const inputs = [];
  function addSet(field, sqlType, value) {
    sets.push(`${field} = @${field}`);
    inputs.push([field, sqlType, value]);
  }
  if (campos.nombre_cliente !== undefined) addSet('nombre_cliente', sql.NVarChar(100), campos.nombre_cliente);
  if (campos.telefono !== undefined) addSet('telefono', sql.NVarChar(20), campos.telefono);
  if (campos.direccion !== undefined) addSet('direccion', sql.NVarChar(255), campos.direccion);
  if (campos.lat !== undefined) addSet('lat', sql.Decimal(10, 7), campos.lat);
  if (campos.lng !== undefined) addSet('lng', sql.Decimal(10, 7), campos.lng);
  if (campos.conceptos !== undefined) addSet('conceptos', sql.NVarChar(sql.MAX), campos.conceptos);
  if (campos.total !== undefined) addSet('total', sql.Decimal(12, 2), campos.total);
  if (campos.tecnico_asignado !== undefined) addSet('tecnico_asignado', sql.NVarChar(50), campos.tecnico_asignado);

  if (!sets.length) return null;

  const pool = await getPool();
  const reqDb = pool.request().input('id', sql.Int, id);
  inputs.forEach(([f, t, v]) => reqDb.input(f, t, v));
  const r = await reqDb.query(`
    UPDATE dbo.servicios
    SET ${sets.join(', ')}
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return r.recordset[0] || null;
}

async function softDelete(id) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id)
    .query(`UPDATE dbo.servicios SET activo = 0 WHERE id = @id`);
}

async function reasignarTecnico(id, tecnico) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('id', sql.Int, id)
    .input('tecnico', sql.NVarChar(50), tecnico)
    .query(`
      UPDATE dbo.servicios
      SET tecnico_asignado = @tecnico
      OUTPUT INSERTED.*
      WHERE id = @id
    `);
  return r.recordset[0] || null;
}

async function actualizarAjuste(id, ajuste) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('ajuste', sql.NVarChar(sql.MAX), ajuste)
    .query(`
      UPDATE dbo.servicios
      SET ajuste = @ajuste
      OUTPUT INSERTED.*
      WHERE id = @id
    `);
  return result.recordset[0] || null;
}

async function finalizarServicio({ id, atendido_por, numero_nota, resolucion }, tx) {
  const reqDb = await makeRequest(tx);
  await reqDb
    .input('id', sql.Int, id)
    .input('atendido_por', sql.NVarChar(50), atendido_por)
    .input('numero_nota', sql.NVarChar(20), numero_nota)
    .input('resolucion', sql.NVarChar(sql.MAX), resolucion)
    .query(`
      UPDATE dbo.servicios
      SET estado = '${ESTADO_SERVICIO.TERMINADO}',
          fecha_fin = GETDATE(),
          atendido_por = @atendido_por,
          numero_nota = @numero_nota,
          resolucion = @resolucion
      WHERE id = @id
    `);
}

async function crearNotaDesdeServicio(serv, numero_nota, conceptos_finales, tx) {
  const reqDb = await makeRequest(tx);
  const result = await reqDb
    .input('numero_cliente', sql.NVarChar(50), serv.numero_cliente)
    .input('nombre_cliente', sql.NVarChar(100), serv.nombre_cliente)
    .input('telefono', sql.NVarChar(20), serv.telefono)
    .input('conceptos', sql.NVarChar(sql.MAX), conceptos_finales)
    .input('total', sql.Decimal(12, 2), Number(serv.total) || 0)
    .input('estado', sql.NVarChar(20), 'PAGADO')
    .input('numero_nota', sql.NVarChar(20), numero_nota)
    .input('validacion', sql.NVarChar(50), serv.telefono || numero_nota)
    .query(`
      INSERT INTO dbo.notas
        (numero_cliente, nombre_cliente, telefono, validacion,
         conceptos, total, estado, fecha, numero_nota)
      OUTPUT INSERTED.*
      VALUES
        (@numero_cliente, @nombre_cliente, @telefono, @validacion,
         @conceptos, @total, @estado, GETDATE(), @numero_nota)
    `);
  return result.recordset[0];
}

async function reabrirServicio(id) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id).query(`
    UPDATE dbo.servicios
    SET estado = '${ESTADO_SERVICIO.PENDIENTE}', fecha_fin = NULL
    OUTPUT INSERTED.*
    WHERE id = @id
  `);
  return r.recordset[0] || null;
}

async function validarUsuarioAsignable(usuario) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('usuario', sql.NVarChar(50), usuario)
    .query(`SELECT TOP 1 usuario, rol, activo FROM dbo.usuarios WHERE usuario = @usuario`);
  return r.recordset[0] || null;
}

async function buscarNotaPorNumero(numero_nota) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input('numero_nota', sql.NVarChar(20), numero_nota)
    .query(`
      SELECT id, numero_cliente, nombre_cliente, telefono, validacion,
             conceptos, total, estado, fecha, numero_nota
      FROM dbo.notas
      WHERE numero_nota = @numero_nota
    `);
  return r.recordset[0] || null;
}

module.exports = {
  // consecutivos
  nextNumeroCliente,
  nextNumeroNota,
  // asignación
  asignarTecnicoAuto,
  validarUsuarioAsignable,
  // CRUD servicios
  crearServicio,
  listarServicios,
  listarPorCliente,
  buscarPorId,
  actualizarServicio,
  softDelete,
  reasignarTecnico,
  actualizarAjuste,
  finalizarServicio,
  reabrirServicio,
  // notas
  crearNotaDesdeServicio,
  buscarNotaPorNumero,
  // re-export para uso conjunto
  ESTADOS_ACTIVOS,
};
