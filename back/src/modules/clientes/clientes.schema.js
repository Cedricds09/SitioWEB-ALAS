// Validación Zod del módulo clientes.

const { z } = require('zod');

// q opcional. null/'' → ''. Trim. Máx 100 chars.
// '' o solo espacios = sin filtro (el repository hace `if (q)`).
const qString = z.preprocess(
  (v) => (v == null ? '' : String(v).trim()),
  z.string().max(100, 'q máx 100 caracteres.'),
);

// limit int [1, 100]. Default 20 si falta o viene vacío.
// Valor no parseable → NaN → z.number().int() lanza ValidationError 400.
const limitNumber = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return 20;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  },
  z.number().int().min(1).max(100),
);

const buscarQuerySchema = z.object({
  q: qString,
  limit: limitNumber,
});

module.exports = { buscarQuerySchema };
