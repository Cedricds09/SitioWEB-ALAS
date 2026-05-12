// Circuit breaker anti-bug / anti-runaway para el módulo IA.
// Stateless: consulta DB cada vez. Si en la última hora hubo >= LIMITE
// generaciones (exitosas o fallidas), lanza AppError 429.
// Cuentan los fallos también — un bug puede producir ráfagas de errores
// igual de costosas que las ráfagas de éxitos.

const { AppError } = require('../../shared/errors/AppError');
const repo = require('./ai.repository');

const LIMITE_POR_HORA = 50;             // tope global del sistema (protege costo total)
const LIMITE_POR_USUARIO_HORA = 10;     // tope por usuario (protege a otros del comportamiento de uno)

/**
 * Verifica que el conteo global de generaciones en la última hora esté por debajo del límite.
 * Lanza AppError(429) si no.
 * @param {sql.Transaction} [tx] — opcional; si se pasa, se usa el contexto transaccional.
 */
async function assertBelowLimit(tx) {
  const count = await repo.countLastHour(tx);
  if (count >= LIMITE_POR_HORA) {
    console.warn(`[AI][BREAKER] limite global excedido (${count}/${LIMITE_POR_HORA} en la última hora).`);
    throw new AppError('Uso anormal detectado, intenta más tarde.', 429, 'AI_RATE_LIMIT');
  }
}

/**
 * Verifica que un usuario específico no exceda su tope personal en la última hora.
 * Lanza AppError(429) con mensaje y code distintos del global, para que el frontend
 * pueda mostrar UX adecuada ("tú alcanzaste tu límite" vs "sistema saturado").
 */
async function assertBelowUserLimit(userId, tx) {
  const count = await repo.countLastHourByUser(userId, tx);
  if (count >= LIMITE_POR_USUARIO_HORA) {
    console.warn(
      `[AI][BREAKER] usuario ${userId} excedió límite personal ` +
      `(${count}/${LIMITE_POR_USUARIO_HORA} en la última hora).`,
    );
    throw new AppError(
      'Has alcanzado tu límite por hora de uso de IA. Intenta más tarde.',
      429,
      'AI_USER_RATE_LIMIT',
    );
  }
}

module.exports = {
  assertBelowLimit,
  assertBelowUserLimit,
  LIMITE_POR_HORA,
  LIMITE_POR_USUARIO_HORA,
};
