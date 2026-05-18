// Service — reglas de negocio del módulo notas.
// Sin SQL crudo, sin Express. Llama al repository y lanza errores tipados.

const repo = require('./notas.repository');
const { NotFoundError } = require('../../shared/errors/AppError');

async function buscar(cliente, validacion) {
  const clienteTrim = String(cliente).trim();
  const validacionTrim = String(validacion).trim();

  const rows = await repo.buscarPorClienteValidacion(clienteTrim, validacionTrim);
  if (!rows.length) {
    console.warn(`[NOTAS] Sin coincidencia cliente=${clienteTrim} validacion=${validacionTrim}`);
    const diag = await repo.diagnosticarCliente(clienteTrim);
    console.warn(`[NOTAS][DIAG] filas con ese cliente: ${diag.length}`);
    diag.forEach((r) => {
      console.warn(
        `[NOTAS][DIAG] id=${r.id} numero_cliente="${r.numero_cliente}" numero_nota="${r.numero_nota}" validacion="${r.validacion}"`,
      );
    });
    throw new NotFoundError('Cliente no encontrado o datos de validación incorrectos.');
  }

  // Devuelve un array de notas (1..N), ya ordenadas por fecha DESC en el repo.
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
