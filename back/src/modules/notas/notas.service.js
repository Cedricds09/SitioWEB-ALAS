// Reglas de negocio del módulo notas.
// Sin SQL crudo ni Express. Llama al repository y lanza errores tipados.

const repo = require('./notas.repository');
const { NotFoundError } = require('../../shared/errors/AppError');

// La validación es el teléfono del cliente (PII); no se loguea en claro. Se
// enmascara dejando solo los últimos 2 caracteres para poder distinguir casos.
function maskPII(v) {
  const s = String(v || '');
  if (!s) return '(vacío)';
  return s.length <= 2 ? '**' : `***${s.slice(-2)}`;
}

async function buscar(cliente, validacion) {
  const clienteTrim = String(cliente).trim();
  const validacionTrim = String(validacion).trim();

  const rows = await repo.buscarPorClienteValidacion(clienteTrim, validacionTrim);
  if (!rows.length) {
    console.warn(`[NOTAS] Sin coincidencia cliente=${clienteTrim} validacion=${maskPII(validacionTrim)}`);
    const diag = await repo.diagnosticarCliente(clienteTrim);
    console.warn(`[NOTAS][DIAG] filas con ese cliente: ${diag.length}`);
    throw new NotFoundError('Cliente no encontrado o datos de validación incorrectos.');
  }

  // Array de notas, ya ordenadas por fecha DESC en el repo.
  const respuesta = rows.map((row) => ({
    id: row.numero_nota ?? row.id,
    cliente: row.numero_cliente,
    nombre: row.nombre_cliente || null,
    telefono: row.telefono || null,
    fecha: row.fecha,
    conceptos: row.conceptos,
    total: Number(row.total),
    estado: row.estado,
    tipo_servicio: row.tipo_servicio || null,
  }));

  console.log(`[NOTAS] OK cliente=${cliente} notas=${respuesta.length}`);
  return respuesta;
}

module.exports = { buscar };
