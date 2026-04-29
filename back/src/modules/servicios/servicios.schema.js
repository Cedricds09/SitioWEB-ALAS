// Validación Zod del módulo servicios.
// Las preprocessing replican la coerción del código original (String().trim(), Number(), null si vacío).

const { z } = require('zod');

// ===== Helpers =====

// String requerido tras trim. Acepta null/undefined → "" → falla min(1).
const requiredString = z.preprocess(
  (v) => (v == null ? '' : String(v).trim()),
  z.string().min(1),
);

// String opcional. null/'' → undefined; resto → trim string.
const optionalString = z.preprocess(
  (v) => (v == null || v === '' ? undefined : String(v).trim()),
  z.string().optional(),
);

// String que admite explicitamente null (para campos como ajuste/telefono/direccion donde null = "limpiar").
const nullableTrimmedString = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  },
  z.union([z.string(), z.null()]).optional(),
);

// Número opcional con coerción defensiva. '' o no-finito → null; sino number.
const optionalNumber = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  },
  z.union([z.number(), z.null()]).optional(),
);

// Número monetario ≥ 0. Default 0 si no llega o es inválido (replica `Number(total) || 0`).
const moneyNumber = z.preprocess(
  (v) => {
    if (v == null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },
  z.number().min(0),
);

// ===== Body schemas =====

const crearServicioSchema = z.object({
  numero_cliente: optionalString,
  nombre_cliente: requiredString,
  telefono: optionalString,
  direccion: optionalString,
  lat: optionalNumber,
  lng: optionalNumber,
  conceptos: requiredString,
  total: moneyNumber,
});

const editarServicioSchema = z
  .object({
    nombre_cliente: optionalString,
    telefono: nullableTrimmedString,
    direccion: nullableTrimmedString,
    lat: optionalNumber,
    lng: optionalNumber,
    conceptos: optionalString,
    total: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      },
      z.number().min(0).optional(),
    ),
    tecnico_asignado: nullableTrimmedString,
  })
  .refine(
    (data) =>
      Object.values(data).some((v) => v !== undefined),
    { message: 'Nada que actualizar.' },
  );

const asignarSchema = z.object({
  tecnico: requiredString,
});

const ajusteSchema = z.object({
  ajuste: nullableTrimmedString,
});

const finalizarSchema = z.object({
  resolucion: requiredString,
});

// ===== Param schemas =====

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const numeroClienteParamSchema = z.object({
  numero_cliente: requiredString,
});

// ===== Query schemas =====

const listarQuerySchema = z.object({
  estado: optionalString,
  mine: optionalString,
});

module.exports = {
  crearServicioSchema,
  editarServicioSchema,
  idParamSchema,
  numeroClienteParamSchema,
  asignarSchema,
  ajusteSchema,
  finalizarSchema,
  listarQuerySchema,
};
