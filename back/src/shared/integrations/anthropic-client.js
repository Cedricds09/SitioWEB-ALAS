// Cliente Anthropic (SDK oficial) con timeout y retry acotado.
// Timeout de 30s por request.
// 1 reintento solo para errores transitorios (529 overloaded), no en 4xx.
// Logs [AI][REQ]/[AI][RES] sin volcar prompt ni respuesta (datos de cliente).

const Anthropic = require('@anthropic-ai/sdk');
const env = require('../config/env');

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1; // SDK gestiona el retry; permitimos 1 reintento.

const client = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  timeout: TIMEOUT_MS,
  maxRetries: MAX_RETRIES,
});

/**
 * Llamada a Claude. No loguea contenido, solo metadatos.
 *
 * @param {object} params
 * @param {string} params.model         id del modelo (env.ANTHROPIC_MODEL por defecto)
 * @param {number} params.maxTokens     máximo de tokens de salida (1500 típico)
 * @param {number} params.temperature   0..1 (0.3 típico para tareas estructuradas)
 * @param {Array}  params.systemBlocks  bloques { type:'text', text, cache_control? }
 * @param {Array}  params.messages      pares user/assistant
 * @param {object} params.meta          { presupuesto_id, modo } solo para logs
 * @returns {Promise<{ content: string, usage: object, model: string, latency_ms: number }>}
 */
async function complete({ model, maxTokens, temperature, systemBlocks, messages, meta }) {
  const usedModel = model || env.ANTHROPIC_MODEL;
  const t0 = Date.now();
  const logMeta = meta || {};

  console.log(
    `[AI][REQ] model=${usedModel} pres=${logMeta.presupuesto_id ?? '-'} modo=${logMeta.modo ?? '-'} maxTokens=${maxTokens}`,
  );

  let response;
  try {
    response = await client.messages.create({
      model: usedModel,
      max_tokens: maxTokens,
      temperature,
      system: systemBlocks,
      messages,
    });
  } catch (err) {
    const latency = Date.now() - t0;
    const status = err?.status || err?.response?.status || 'n/a';
    const apiErr = err?.error?.error?.message || err?.message || 'error desconocido';
    console.error(
      `[AI][ERR] status=${status} pres=${logMeta.presupuesto_id ?? '-'} modo=${logMeta.modo ?? '-'} latency=${latency}ms msg=${apiErr}`,
    );
    const wrapped = new Error(apiErr);
    wrapped.status = status;
    wrapped.cause = err;
    throw wrapped;
  }

  const latency = Date.now() - t0;
  const usage = response.usage || {};
  const stopReason = response.stop_reason || 'n/a';

  console.log(
    `[AI][RES] model=${usedModel} pres=${logMeta.presupuesto_id ?? '-'} latency=${latency}ms ` +
    `tokens_in=${usage.input_tokens || 0} tokens_out=${usage.output_tokens || 0} ` +
    `cache_write=${usage.cache_creation_input_tokens || 0} cache_read=${usage.cache_read_input_tokens || 0} ` +
    `stop=${stopReason}`,
  );

  // Saca el texto plano del primer bloque text (la SDK retorna content[] con bloques).
  const textBlock = (response.content || []).find((b) => b.type === 'text');
  const text = textBlock ? textBlock.text : '';

  return {
    content: text,
    usage,
    model: usedModel,
    latency_ms: latency,
    stop_reason: stopReason,
  };
}

module.exports = { complete };
