// Circuit breaker anti-bug / anti-runaway para el módulo IA.
// Stateless: consulta DB cada vez. Si en la última hora hubo >= LIMITE
// generaciones (exitosas o fallidas), lanza AppError 429.
// Cuentan los fallos también — un bug puede producir ráfagas de errores
// igual de costosas que las ráfagas de éxitos.

const { AppError } = require('../../shared/errors/AppError');
const repo = require('./ai.repository');

const LIMITE_POR_HORA = 50;

/**
 * Verifica que el conteo global de generaciones en la última hora esté por debajo del límite.
 * Lanza AppError(429) si no.
 * @param {sql.Transaction} [tx] — opcional; si se pasa, se usa el contexto transaccional.
 */
async function assertBelowLimit(tx) {
  const count = await repo.countLastHour(tx);
  if (count >= LIMITE_POR_HORA) {
    console.warn(`[AI][BREAKER] limite excedido (${count}/${LIMITE_POR_HORA} en la última hora).`);
    throw new AppError('Uso anormal detectado, intenta más tarde.', 429, 'AI_RATE_LIMIT');
  }
}

module.exports = {
  assertBelowLimit,
  LIMITE_POR_HORA,
};
