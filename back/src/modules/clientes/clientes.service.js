// Service: reglas de negocio del módulo clientes.

const repo = require('./clientes.repository');
const serviciosRepo = require('../servicios/servicios.repository');
const notasRepo = require('../notas/notas.repository');
const presupuestosService = require('../presupuestos/presupuestos.service');

async function buscar({ q, limit }) {
  console.log('[CLIENTES] query:', q || '(vacía)');
  const data = await repo.buscar({ q, limit });
  console.log('[CLIENTES] resultados:', data.length);
  return data;
}


async function historial(numero_cliente, sesion) {
  console.log('[CLIENTES] historial cliente=', numero_cliente);

  const [servicios, notas, presupuestos] = await Promise.all([
    serviciosRepo.listarPorCliente(numero_cliente),
    notasRepo.listarPorCliente(numero_cliente),
    presupuestosService.listar({ numero_cliente }, sesion),
  ]);

  return { servicios, notas, presupuestos };
}

module.exports = { buscar, historial };
