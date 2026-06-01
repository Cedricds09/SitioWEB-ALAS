// Validación Zod del módulo servicios.
// Los preprocess replican la coerción del código original: String().trim(), Number(), null si vacío.

const { z } = require('zod');

// ===== Helpers =====

// String requerido tras trim. null/undefined se vuelve "" y falla el min(1).
const requiredString = z.preprocess(
  (v) => (v == null ? '' : String(v).trim()),
  z.string().min(1, 'Este campo es obligatorio.'),
);

// String opcional. null/'' se vuelve undefined; el resto se trimea.
const optionalString = z.preprocess(
  (v) => (v == null || v === '' ? undefined : String(v).trim()),
  z.string().optional(),
);

// String que admite null explícito (campos como ajuste/telefono/direccion donde null significa "limpiar").
const nullableTrimmedString = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  },
  z.union([z.string(), z.null()]).optional(),
);

// Teléfono: 10 dígitos exactos. Quita no-dígitos antes de validar (defensa
// contra espacios/guiones/paréntesis del frontend). Vacío/null se vuelve null.
// Defensa en profundidad: la columna en BD también tiene CHECK constraint
// (CK_servicios_telefono_formato, migración 005).
const telefonoString = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null) return null;
    const digits = String(v).replace(/\D+/g, '');
    return digits === '' ? null : digits;
  },
  z.union([
    z.string().regex(/^\d{10}$/, 'Teléfono debe ser 10 dígitos.'),
    z.null(),
  ]).optional(),
);

// Número opcional con coerción defensiva. '' o no-finito se vuelve null; sino number.
const optionalNumber = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  },
  z.union([z.number(), z.null()]).optional(),
);

// Número monetario >= 0. Default 0 si no llega o es inválido (replica `Number(total) || 0`).
const moneyNumber = z.preprocess(
  (v) => {
    if (v == null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  },
  z.number({ invalid_type_error: 'Debe ser un número.' }).min(0, 'No puede ser negativo.'),
);

// Fecha programada (YYYY-MM-DD), opcional. '' o null se vuelve null.
const fechaProgramada = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null || v === '') return null;
    return String(v).trim();
  },
  z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido. Use YYYY-MM-DD'),
    z.null(),
  ]).optional(),
);

// Hora programada (HH:MM), opcional. '' o null se vuelve null.
const horaProgramada = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null || v === '') return null;
    return String(v).trim();
  },
  z.union([
    z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM'),
    z.null(),
  ]).optional(),
);

// ===== Body schemas =====

const crearServicioSchema = z.object({
  numero_cliente: optionalString,
  nombre_cliente: requiredString,
  telefono: telefonoString,
  direccion: optionalString,
  lat: optionalNumber,
  lng: optionalNumber,
  conceptos: requiredString,
  tipo_servicio: nullableTrimmedString,
  total: moneyNumber,
  fecha_programada: fechaProgramada,
  hora_programada: horaProgramada,
});

const editarServicioSchema = z
  .object({
    nombre_cliente: optionalString,
    telefono: telefonoString,
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
    tipo_servicio: nullableTrimmedString,
    tecnico_asignado: nullableTrimmedString,
    fecha_programada: fechaProgramada,
    hora_programada: horaProgramada,
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

// Programar fecha/hora de un servicio existente (endpoint /:id/programar).
const programarSchema = z.object({
  fecha_programada: fechaProgramada,
  hora_programada: horaProgramada,
});

// ===== Query schemas =====

const listarQuerySchema = z.object({
  estado: optionalString,
  mine: optionalString,
  // Paginación opt-in (M6): ambos opcionales. Si no llegan, el listado se
  // comporta como siempre (sin paginar). limit acotado para evitar abusos.
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

// Calendario: semana ISO "YYYY-WNN" opcional. Sin valor usa la semana actual.
const calendarioQuerySchema = z.object({
  semana: z.preprocess(
    (v) => (v == null || v === '' ? undefined : String(v).trim()),
    z.string().regex(/^\d{4}-W\d{2}$/i, 'Formato inválido. Use YYYY-WNN').optional(),
  ),
});

module.exports = {
  crearServicioSchema,
  editarServicioSchema,
  programarSchema,
  idParamSchema,
  numeroClienteParamSchema,
  asignarSchema,
  ajusteSchema,
  finalizarSchema,
  listarQuerySchema,
  calendarioQuerySchema,
};
