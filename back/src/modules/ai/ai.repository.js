// Queries SQL del módulo IA.

const { sql, getPool } = require('../../shared/db/pool');

async function makeRequest(tx) {
  if (tx) return new sql.Request(tx);
  const pool = await getPool();
  return pool.request();
}


async function countLastHour(tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb.query(`
    SELECT COUNT(*) AS total
    FROM dbo.ai_generations
    WHERE created_at >= DATEADD(HOUR, -1, SYSUTCDATETIME())
  `);
  return Number(r.recordset[0]?.total) || 0;
}

async function countLastHourByUser(userId, tx) {
  const reqDb = await makeRequest(tx);
  const r = await reqDb
    .input('uid', sql.Int, userId)
    .query(`
      SELECT COUNT(*) AS total
      FROM dbo.ai_generations
      WHERE user_id = @uid
        AND created_at >= DATEADD(HOUR, -1, SYSUTCDATETIME())
    `);
  return Number(r.recordset[0]?.total) || 0;
}

/**
 * Inserta una fila de tracking.
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


// Consultas de negocio: queries SQL directas a la DB.

// Servicios activos: totales por estado.
async function negocioActivos({ tecnico }) {
  const pool = await getPool();
  const reqDb = pool.request();
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN estado='PENDIENTE' THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN estado='EN_PROCESO' THEN 1 ELSE 0 END) AS en_proceso
    FROM dbo.servicios
    WHERE activo=1 AND estado IN ('PENDIENTE','EN_PROCESO')${filtro}
  `);
  return r.recordset[0];
}

// Servicios más antiguos sin cerrar.
async function negocioUrgentes({ tecnico }) {
  const pool = await getPool();
  const reqDb = pool.request();
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT TOP 5
      numero_cliente, nombre_cliente, estado, fecha_inicio,
      DATEDIFF(DAY, fecha_inicio, GETDATE()) AS dias
    FROM dbo.servicios
    WHERE activo=1 AND estado IN ('PENDIENTE','EN_PROCESO')${filtro}
    ORDER BY fecha_inicio ASC
  `);
  return r.recordset;
}

// Servicios activos sin presupuesto asociado.
async function negocioSinPresupuesto({ tecnico }) {
  const pool = await getPool();
  const reqDb = pool.request();
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND s.tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT COUNT(*) AS total
    FROM dbo.servicios s
    WHERE s.activo=1
      AND s.estado IN ('PENDIENTE','EN_PROCESO')
      AND NOT EXISTS (
        SELECT 1 FROM dbo.presupuestos p
        WHERE p.servicio_id = s.id AND p.activo=1
      )${filtro}
  `);
  return r.recordset[0];
}

// Servicios EN_PROCESO demorados (mas de 7 días, TOP 5).
async function negocioSinCerrar({ tecnico }) {
  const pool = await getPool();
  const reqDb = pool.request();
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT TOP 5
      numero_cliente, nombre_cliente, fecha_inicio,
      DATEDIFF(DAY, fecha_inicio, GETDATE()) AS dias
    FROM dbo.servicios
    WHERE activo=1 AND estado='EN_PROCESO'
      AND DATEDIFF(DAY, fecha_inicio, GETDATE()) > 7${filtro}
    ORDER BY fecha_inicio ASC
  `);
  return r.recordset;
}

// Presupuestos sin respuesta del cliente.
async function negocioPresupuestosPendientes({ uid }) {
  const pool = await getPool();
  const reqDb = pool.request();
  let filtro = '';
  if (uid) {
    reqDb.input('uid', sql.Int, uid);
    filtro = ' AND asignado_a = @uid';
  }
  const r = await reqDb.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN estado='borrador' THEN 1 ELSE 0 END) AS borradores,
      SUM(CASE WHEN estado='enviado' THEN 1 ELSE 0 END) AS enviados
    FROM dbo.presupuestos
    WHERE activo=1 AND estado IN ('borrador','enviado')${filtro}
  `);
  return r.recordset[0];
}

// Servicios programados para hoy, ordenados por hora.
async function negocioAgendaHoy({ tecnico }) {
  const pool = await getPool();
  const reqDb = pool.request();
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT id, numero_cliente, nombre_cliente, estado,
           CONVERT(varchar(5), hora_programada, 108) AS hora_programada,
           CONVERT(varchar(10), fecha_programada, 23) AS fecha_programada,
           tecnico_asignado
    FROM dbo.servicios
    WHERE activo = 1
      AND estado IN ('PENDIENTE','EN_PROCESO')
      AND fecha_programada = CAST(GETDATE() AS DATE)${filtro}
    ORDER BY hora_programada ASC
  `);
  return r.recordset;
}

// Conteo de servicios activos sin fecha programada.
async function negocioActivosSinFecha({ tecnico }) {
  const pool = await getPool();
  const reqDb = pool.request();
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT COUNT(*) AS total
    FROM dbo.servicios
    WHERE activo = 1
      AND estado IN ('PENDIENTE','EN_PROCESO')
      AND fecha_programada IS NULL${filtro}
  `);
  return r.recordset[0];
}

// Servicios programados esta semana (hoy + 6 días).
// Cap de seguridad (guard) para no traer un volumen ilimitado a la IA. La
// consulta ya está acotada a 7 días, así que a escala realista devuelve todo;
// el TOP solo protege ante crecimiento anómalo. Si se alcanza el tope se avisa
// en logs (sin truncar en silencio).
const AGENDA_SEMANA_CAP = 200;

async function negocioAgendaSemana({ tecnico }) { // eslint-disable-line no-unused-vars
  const pool = await getPool();
  const reqDb = pool.request().input('cap', sql.Int, AGENDA_SEMANA_CAP);
  // NOTA: el comportamiento actual NO filtra por técnico (la query histórica
  // declaraba el filtro pero nunca lo aplicaba; ver bug latente reportado). Se
  // preserva tal cual y solo se añade el cap de seguridad. Si se decide filtrar
  // por técnico, inyectar `AND tecnico_asignado = @tec` con su .input.
  const r = await reqDb.query(`
    SELECT TOP (@cap) id, numero_cliente, nombre_cliente, estado,
           CONVERT(varchar(5), hora_programada, 108) AS hora_programada,
           CONVERT(varchar(10), fecha_programada, 23) AS fecha_programada,
           tecnico_asignado
    FROM dbo.servicios
    WHERE activo = 1
      AND estado IN ('PENDIENTE','EN_PROCESO')
      AND fecha_programada >= CAST(GETDATE() AS DATE)
      AND fecha_programada <= DATEADD(DAY, 6, CAST(GETDATE() AS DATE))
    ORDER BY fecha_programada ASC, hora_programada ASC
  `);
  if (r.recordset.length === AGENDA_SEMANA_CAP) {
    console.warn(`[AI] agenda semana alcanzó el cap (${AGENDA_SEMANA_CAP}); puede haber más servicios sin mostrar.`);
  }
  return r.recordset;
}

// ============================================================
// Consulta de ficha de cliente
// ============================================================

// Datos básicos del cliente, tomados del servicio más reciente.
async function clienteDatos(numeroCliente, tecnico) {
  const pool = await getPool();
  const reqDb = pool.request().input('cl', sql.NVarChar(50), numeroCliente);
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT TOP 1 nombre_cliente, telefono
    FROM dbo.servicios
    WHERE numero_cliente = @cl AND activo = 1${filtro}
    ORDER BY fecha_inicio DESC
  `);
  return r.recordset[0] || null;
}

// Servicios activos del cliente (PENDIENTE o EN_PROCESO).
async function clienteServiciosActivos(numeroCliente, tecnico) {
  const pool = await getPool();
  const reqDb = pool.request().input('cl', sql.NVarChar(50), numeroCliente);
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT id, conceptos, estado, fecha_inicio,
      DATEDIFF(DAY, fecha_inicio, GETDATE()) AS dias
    FROM dbo.servicios
    WHERE numero_cliente = @cl AND activo = 1
      AND estado IN ('PENDIENTE','EN_PROCESO')${filtro}
    ORDER BY fecha_inicio ASC
  `);
  return r.recordset;
}

// Conteo de servicios terminados del cliente.
async function clienteServiciosTerminadosCount(numeroCliente, tecnico) {
  const pool = await getPool();
  const reqDb = pool.request().input('cl', sql.NVarChar(50), numeroCliente);
  let filtro = '';
  if (tecnico) {
    reqDb.input('tec', sql.NVarChar(50), tecnico);
    filtro = ' AND tecnico_asignado = @tec';
  }
  const r = await reqDb.query(`
    SELECT COUNT(*) AS total
    FROM dbo.servicios
    WHERE numero_cliente = @cl AND activo = 1
      AND estado = 'TERMINADO'${filtro}
  `);
  return r.recordset[0].total;
}

// Presupuestos vigentes del cliente: no rechazados ni convertidos.
async function clientePresupuestos(numeroCliente, uid) {
  const pool = await getPool();
  const reqDb = pool.request().input('cl', sql.NVarChar(50), numeroCliente);
  let filtro = '';
  if (uid) {
    reqDb.input('uid', sql.Int, uid);
    filtro = ' AND asignado_a = @uid';
  }
  const r = await reqDb.query(`
    SELECT id, numero_presupuesto, estado, total_general
    FROM dbo.presupuestos
    WHERE numero_cliente = @cl AND activo = 1
      AND estado NOT IN ('rechazado','convertido')${filtro}
    ORDER BY fecha_creacion DESC
  `);
  return r.recordset;
}

module.exports = {
  countLastHour,
  countLastHourByUser,
  registrarGeneracion,
  negocioActivos,
  negocioUrgentes,
  negocioSinPresupuesto,
  negocioSinCerrar,
  negocioPresupuestosPendientes,
  negocioAgendaHoy,
  negocioActivosSinFecha,
  negocioAgendaSemana,
  clienteDatos,
  clienteServiciosActivos,
  clienteServiciosTerminadosCount,
  clientePresupuestos,
};
