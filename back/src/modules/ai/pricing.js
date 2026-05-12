// back/src/modules/ai/pricing.js
// Claude Haiku 4.5 pricing (per million tokens, USD).
//
// ⚠️ DRIFT WARNING — verificar y actualizar cada ~6 meses, o cuando Anthropic
//    anuncie nueva familia de modelos / cambios de precio.
//
// Source of truth: https://www.anthropic.com/pricing
// Última verificación: 2026-05-11 (Fase 3 backend).
//
// Si estos números quedan desactualizados, el campo dbo.ai_generations.costo_estimado_usd
// pierde precisión — los reportes internos de costo IA quedarían sesgados.
// El sistema NO falla si los precios bajan/suben; solo la estimación se desvía.
//
// Si cambias de modelo (ej. claude-haiku-5-x cuando salga), actualiza también
// estas constantes — son específicas a Haiku 4.5.
const PRICING = {
  INPUT_NORMAL: 1.00,      // $1 / M tokens
  INPUT_CACHE_WRITE: 1.25, // $1.25 / M tokens (first time caching)
  INPUT_CACHE_READ: 0.10,  // $0.10 / M tokens (subsequent cache hits, 90% discount)
  OUTPUT: 5.00             // $5 / M tokens
};

/**
 * Calculates estimated cost in USD given token usage.
 * @param {object} usage - { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }
 * @returns {number} cost in USD
 */
function calculateCostUsd(usage) {
  const inputNormal = (usage.input_tokens || 0) * (PRICING.INPUT_NORMAL / 1_000_000);
  const cacheWrite = (usage.cache_creation_input_tokens || 0) * (PRICING.INPUT_CACHE_WRITE / 1_000_000);
  const cacheRead = (usage.cache_read_input_tokens || 0) * (PRICING.INPUT_CACHE_READ / 1_000_000);
  const output = (usage.output_tokens || 0) * (PRICING.OUTPUT / 1_000_000);
  return inputNormal + cacheWrite + cacheRead + output;
}

module.exports = { PRICING, calculateCostUsd };
