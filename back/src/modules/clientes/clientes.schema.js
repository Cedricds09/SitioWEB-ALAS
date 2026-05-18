// Validación Zod del módulo clientes.

const { z } = require('zod');


const qString = z.preprocess(
  (v) => (v == null ? '' : String(v).trim()),
  z.string().max(100, 'q máx 100 caracteres.'),
);


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

const numeroClienteParamSchema = z.object({
  numero_cliente: z.preprocess(
    (v) => (v == null ? '' : String(v).trim()),
    z.string().min(1, 'numero_cliente requerido.').max(50),
  ),
});

module.exports = { buscarQuerySchema, numeroClienteParamSchema };
