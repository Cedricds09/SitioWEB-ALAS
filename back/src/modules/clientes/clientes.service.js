// Service — reglas de negocio del módulo clientes.

const repo = require('./clientes.repository');

async function buscar({ q, limit }) {
  console.log('[CLIENTES] query:', q || '(vacía)');
  const data = await repo.buscar({ q, limit });
  console.log('[CLIENTES] resultados:', data.length);
  return data;
}

module.exports = { buscar };
