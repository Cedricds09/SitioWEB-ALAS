// Service: reglas de negocio del módulo clientes.

const repo = require('./clientes.repository');
const serviciosRepo = require('../servicios/servicios.repository');
const notasRepo = require('../notas/notas.repository');
const presupuestosService = require('../presupuestos/presupuestos.service');

// El término de búsqueda puede ser nombre/teléfono (PII): no se loguea en
// claro. El numero_cliente se enmascara dejando solo el prefijo (CL-****).
function maskCliente(nc) {
  const s = String(nc || '');
  return s.length > 3 ? `${s.slice(0, 3)}****` : '****';
}

async function buscar({ q, limit }) {
  console.log('[CLIENTES] query len=', q ? String(q).length : 0);
  const data = await repo.buscar({ q, limit });
  console.log('[CLIENTES] resultados:', data.length);
  return data;
}


async function historial(numero_cliente, sesion) {
  console.log('[CLIENTES] historial cliente=', maskCliente(numero_cliente));

  const [servicios, notas, presupuestos] = await Promise.all([
    serviciosRepo.listarPorCliente(numero_cliente),
    notasRepo.listarPorCliente(numero_cliente),
    presupuestosService.listar({ numero_cliente }, sesion),
  ]);

  return { servicios, notas, presupuestos };
}

module.exports = { buscar, historial };
