// back/src/modules/ai/pricing.js
// Claude Haiku 4.5 pricing (per million tokens, USD)
// Source: anthropic.com/pricing, as of May 2026
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
