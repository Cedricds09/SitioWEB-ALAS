// Validación Zod del módulo clientes.

const { z } = require('zod');

// q opcional. null/'' → '' (sin filtro). Trim si llega.
const optionalQ = z.preprocess(
  (v) => (v == null ? '' : String(v).trim()),
  z.string().default(''),
);

// limit clamp [1, 200]. Default 50. Replica `Math.min(parseInt(...) || 50, 200)`.
const limitNumber = z.preprocess(
  (v) => {
    if (v == null || v === '') return 50;
    const n = parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? Math.min(n, 200) : 50;
  },
  z.number().int().min(1).max(200),
);

const buscarQuerySchema = z.object({
  q: optionalQ,
  limit: limitNumber,
});

module.exports = { buscarQuerySchema };
