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

  // allSettled: si una fuente falla (p.ej. DB intermitente en una tabla), se
  // devuelven las demás en vez de romper TODO el historial. El camino feliz
  // (las tres OK) entrega exactamente los mismos datos que antes.
  const [rServicios, rNotas, rPresupuestos] = await Promise.allSettled([
    serviciosRepo.listarPorCliente(numero_cliente),
    notasRepo.listarPorCliente(numero_cliente),
    presupuestosService.listar({ numero_cliente }, sesion),
  ]);

  function take(res, etiqueta) {
    if (res.status === 'fulfilled') return res.value;
    console.error(`[CLIENTES] historial: fuente "${etiqueta}" falló:`, res.reason?.message || res.reason);
    return [];
  }

  return {
    servicios: take(rServicios, 'servicios'),
    notas: take(rNotas, 'notas'),
    presupuestos: take(rPresupuestos, 'presupuestos'),
  };
}

module.exports = { buscar, historial };
