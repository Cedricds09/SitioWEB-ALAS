// Service — lógica del módulo IA.
// Sin SQL crudo, sin Express. Llama al repository y al cliente Anthropic.
// Tracking: cada llamada (éxito o fallo) registra fila en dbo.ai_generations.

const {
  AppError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} = require('../../shared/errors/AppError');
const ROL = require('../../shared/constants/roles');
const env = require('../../shared/config/env');

const anthropic = require('../../shared/integrations/anthropic-client');
const presRepo = require('../presupuestos/presupuestos.repository');
const repo = require('./ai.repository');
const breaker = require('./circuit-breaker');
const { validateAiResponse } = require('./validators');
const { calculateCostUsd } = require('./pricing');
const { SYSTEM_PROMPT } = require('./prompts/system');
const { FEW_SHOT_EXAMPLES } = require('./prompts/few-shot');

const ESTADOS_PERMITIDOS = ['solicitud', 'borrador'];
const MAX_TOKENS = 1500;
const TEMPERATURE = 0.3;
const SOLICITUD_PREFIX = '[Solicitud del cliente]\n';

// ============================================================
// Helpers
// ============================================================

// Algunos modelos (Haiku 4.5 observado) envuelven el JSON en code fences
// markdown a pesar de la instrucción "no markdown". Se limpian aquí como
// defensa en profundidad. La regla en el system prompt también se reforzó.
function stripJsonFences(content) {
  if (typeof content !== 'string') return content;
  let trimmed = content.trim();
  // Remove ```json (opening fence with optional language tag)
  trimmed = trimmed.replace(/^```(?:json)?\s*\n?/i, '');
  // Remove closing ```
  trimmed = trimmed.replace(/\n?```\s*$/i, '');
  return trimmed.trim();
}

function _resolverDescripcion(bodyDesc, pres) {
  if (bodyDesc && bodyDesc.trim()) return bodyDesc.trim();
  const notas = (pres.notas_internas || '').trim();
  if (!notas) return null;
  if (notas.startsWith(SOLICITUD_PREFIX)) {
    const sin = notas.slice(SOLICITUD_PREFIX.length).trim();
    return sin || null;
  }
  return notas;
}

function _serializarBloquesExistentes(pres) {
  return (pres.bloques || []).map((b) => {
    const base = {
      bloque_id: b.id,
      tipo: b.tipo,
      titulo: b.titulo || null,
    };
    if (b.tipo === 'lista_vinetas' || b.tipo === 'garantias') {
      // contenido_texto está serializado como JSON array
      let arr = [];
      try {
        arr = JSON.parse(b.contenido_texto || '[]');
        if (!Array.isArray(arr)) arr = [];
      } catch {
        arr = [];
      }
      if (b.tipo === 'lista_vinetas') base.vinetas = arr;
      else base.garantias = arr;
      return base;
    }
    if (b.tipo === 'apartado_cerrado') {
      base.contenido_texto = b.contenido_texto || '';
      base.subtotal = b.subtotal != null ? Number(b.subtotal) : null;
      return base;
    }
    if (b.tipo === 'seccion_items') {
      base.items = (b.items || []).map((it) => ({
        item_id: it.id,
        descripcion: it.descripcion,
        cantidad: it.cantidad != null ? Number(it.cantidad) : null,
        precio_unitario: it.precio_unitario != null ? Number(it.precio_unitario) : null,
        es_opcional: !!it.es_opcional,
      }));
      return base;
    }
    // texto u otros
    base.contenido_texto = b.contenido_texto || '';
    return base;
  });
}

function _construirMensajeUsuario(modo, input, pres, descripcion) {
  if (modo === 'generar_inicial') {
    return {
      modo,
      cliente_nombre: pres.cliente_nombre || null,
      cliente_direccion: pres.cliente_direccion || null,
      tipo_servicio: pres.tipo_servicio || null,
      descripcion_inicial: descripcion,
    };
  }
  // mejorar / agregar — incluir bloques existentes con sus IDs
  return {
    modo,
    cliente_nombre: pres.cliente_nombre || null,
    cliente_direccion: pres.cliente_direccion || null,
    tipo_servicio: pres.tipo_servicio || null,
    bloques_existentes: _serializarBloquesExistentes(pres),
  };
}

function _construirMessages(mensajeReal) {
  const messages = [];
  const lastIdx = FEW_SHOT_EXAMPLES.length - 1;
  FEW_SHOT_EXAMPLES.forEach((ej, idx) => {
    messages.push({ role: 'user', content: JSON.stringify(ej.user_input) });
    // El último assistant del few-shot lleva cache_control:ephemeral, de modo
    // que el cache breakpoint cubra system + todos los pares few-shot. Esto
    // garantiza que el prefijo cacheado supere el mínimo de tokens para Haiku
    // (el system prompt solo podría quedarse corto del umbral) y activa
    // cache_write en la primera llamada / cache_read en subsecuentes.
    if (idx === lastIdx) {
      messages.push({
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: JSON.stringify(ej.assistant_output),
            cache_control: { type: 'ephemeral' },
          },
        ],
      });
    } else {
      messages.push({ role: 'assistant', content: JSON.stringify(ej.assistant_output) });
    }
  });
  messages.push({ role: 'user', content: JSON.stringify(mensajeReal) });
  return messages;
}

function _construirSystemBlocks() {
  return [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

// ============================================================
// Entrada principal
// ============================================================

async function sugerirBloques(input, sesion) {
  const { presupuesto_id, modo } = input;

  // 1) Cargar presupuesto y validar permisos + estado.
  const pres = await presRepo.buscarPorIdCompleto(presupuesto_id);
  if (!pres) throw new NotFoundError('Presupuesto no encontrado.');

  const esAdmin = sesion.rol === ROL.ADMIN;
  const esAsignado = Number(pres.asignado_a) === Number(sesion.uid);
  if (!esAdmin && !esAsignado) {
    throw new ForbiddenError('No tienes permiso para usar IA en este presupuesto.');
  }

  if (!ESTADOS_PERMITIDOS.includes(pres.estado)) {
    throw new ConflictError(
      `Solo se puede usar IA en presupuestos en estado solicitud o borrador (actual: ${pres.estado}).`,
    );
  }

  // 2) Resolver descripcion_inicial (body wins, fallback notas_internas).
  let descripcion = null;
  if (modo === 'generar_inicial') {
    descripcion = _resolverDescripcion(input.descripcion_inicial, pres);
    if (!descripcion) {
      throw new ValidationError(
        'En modo generar_inicial se requiere descripcion_inicial (en el body o en notas_internas del presupuesto).',
      );
    }
  }

  // 3) Circuit breaker: GLOBAL >= 50 generaciones/hora (incluye fallos).
  await breaker.assertBelowLimit();

  // 4) Construir mensaje real y messages array.
  const mensajeReal = _construirMensajeUsuario(modo, input, pres, descripcion);
  const messages = _construirMessages(mensajeReal);
  const systemBlocks = _construirSystemBlocks();

  // 5) Llamar a Anthropic. Capturamos para trackear fallos.
  let aiResp = null;
  let trackingDone = false;

  try {
    aiResp = await anthropic.complete({
      model: env.ANTHROPIC_MODEL,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      systemBlocks,
      messages,
      meta: { presupuesto_id, modo },
    });
  } catch (err) {
    await _registrarFallo({
      sesion, presupuesto_id, modo,
      usage: null,
      errorMsg: `anthropic_error: ${err.message || 'desconocido'}`,
    });
    trackingDone = true;
    throw new AppError('Error consultando IA.', 502, 'AI_UPSTREAM_ERROR');
  }

  // 6) Parsear JSON. Si falla, trackeamos fallo con usage conocido.
  let raw;
  try {
    const cleaned = stripJsonFences(aiResp.content);
    raw = JSON.parse(cleaned);
  } catch (err) {
    console.error(
      `[AI][PARSE] JSON inválido pres=${presupuesto_id} modo=${modo} ` +
      `len=${aiResp.content?.length || 0} preview=${(aiResp.content || '').slice(0, 120)}`,
    );
    await _registrarFallo({
      sesion, presupuesto_id, modo,
      usage: aiResp.usage, modelo: aiResp.model,
      errorMsg: 'json_parse_error',
    });
    trackingDone = true;
    throw new AppError('La IA devolvió contenido no parseable.', 500, 'AI_INVALID_JSON');
  }

  // 7) Validar con Zod del archivo provisto (defense layer #2).
  const validation = validateAiResponse(raw);
  if (!validation.ok) {
    console.error(
      `[AI][SCHEMA] respuesta no cumple schema pres=${presupuesto_id} modo=${modo}`,
      JSON.stringify(validation.details).slice(0, 400),
    );
    await _registrarFallo({
      sesion, presupuesto_id, modo,
      usage: aiResp.usage, modelo: aiResp.model,
      errorMsg: 'schema_validation_error',
    });
    trackingDone = true;
    throw new AppError('La IA devolvió un formato inválido.', 500, 'AI_INVALID_SCHEMA');
  }

  // 8) Coherencia: el modo retornado debe coincidir con el solicitado.
  if (validation.data.modo !== modo) {
    console.error(`[AI][SCHEMA] modo inconsistente esperado=${modo} recibido=${validation.data.modo}`);
    await _registrarFallo({
      sesion, presupuesto_id, modo,
      usage: aiResp.usage, modelo: aiResp.model,
      errorMsg: 'modo_mismatch',
    });
    trackingDone = true;
    throw new AppError('La IA devolvió un modo inconsistente.', 500, 'AI_MODE_MISMATCH');
  }

  // 9) Persistir tracking de éxito.
  const costo = calculateCostUsd(aiResp.usage || {});
  await repo.registrarGeneracion({
    user_id: sesion.uid,
    presupuesto_id,
    tokens_input: aiResp.usage?.input_tokens || 0,
    tokens_output: aiResp.usage?.output_tokens || 0,
    costo_estimado_usd: costo,
    modelo: aiResp.model,
    modo,
    exitoso: true,
    error_mensaje: null,
  });
  trackingDone = true;

  return validation.data;
}

// ============================================================
// Helper de tracking de fallos
// ============================================================

async function _registrarFallo({ sesion, presupuesto_id, modo, usage, modelo, errorMsg }) {
  try {
    const costo = usage ? calculateCostUsd(usage) : 0;
    await repo.registrarGeneracion({
      user_id: sesion.uid,
      presupuesto_id,
      tokens_input: usage?.input_tokens || 0,
      tokens_output: usage?.output_tokens || 0,
      costo_estimado_usd: costo,
      modelo: modelo || env.ANTHROPIC_MODEL,
      modo,
      exitoso: false,
      error_mensaje: String(errorMsg || 'error').slice(0, 500),
    });
  } catch (loggingErr) {
    // No interrumpir el flujo principal por un fallo de logging.
    console.error('[AI][TRACK] no se pudo persistir fallo:', loggingErr.message);
  }
}

module.exports = {
  sugerirBloques,
};
