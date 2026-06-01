// Validación Zod del módulo presupuestos.
// Bloques tipados con discriminated union para validación específica por tipo.

const { z } = require('zod');
const {
  TIPO_BLOQUE,
  ESTADO_PRESUPUESTO,
  FUENTE_PRESUPUESTO,
  NOTA_FINAL_DEFAULT,
} = require('../../shared/constants/presupuestos');

// ===== Helpers comunes =====

const requiredString = z.preprocess(
  (v) => (v == null ? '' : String(v).trim()),
  z.string().min(1, 'Este campo es obligatorio.'),
);

const optionalString = z.preprocess(
  (v) => (v == null || v === '' ? undefined : String(v).trim()),
  z.string().optional(),
);

const nullableTrimmedString = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  },
  z.union([z.string(), z.null()]).optional(),
);

// Teléfono: 10 dígitos exactos. Quita no-dígitos antes de validar.
// Defensa en profundidad: la columna cliente_telefono ya tiene CHECK constraint
// (CK_presupuestos_cliente_telefono_formato, migración 005).
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

// Versión requerida del telefono (para crearSolicitudPublicaSchema).
const telefonoRequerido = z.preprocess(
  (v) => (v == null ? '' : String(v).replace(/\D+/g, '')),
  z.string().regex(/^\d{10}$/, 'Teléfono debe ser 10 dígitos.'),
);

const optionalPositiveInt = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  },
  z.number().int().positive().optional(),
);

const moneyNumber = z.preprocess(
  (v) => {
    if (v == null || v === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  },
  z.number({ invalid_type_error: 'Debe ser un número.' }).min(0, 'No puede ser negativo.'),
);

// Cantidad estricta (DECIMAL(10,2) > 0).
const cantidadNumber = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return 1;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  },
  z.number().positive(),
);

const isoDateString = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const s = String(v).trim();
    return s === '' ? undefined : s;
  },
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'fecha debe ser YYYY-MM-DD')
    .optional(),
);

// ===== Item de bloque seccion_items =====

const itemSchema = z.object({
  descripcion: requiredString,
  cantidad: cantidadNumber.default(1),
  precio_unitario: moneyNumber.default(0),
  es_opcional: z.preprocess((v) => !!v, z.boolean()).default(false),
  orden: optionalPositiveInt,
});

// ===== Bloques (5 tipos via discriminated union) =====

const bloqueTextoSchema = z.object({
  tipo: z.literal(TIPO_BLOQUE.TEXTO),
  contenido_texto: requiredString,
  orden: optionalPositiveInt,
});

const bloqueListaVinetasSchema = z.object({
  tipo: z.literal(TIPO_BLOQUE.LISTA_VINETAS),
  vinetas: z.array(requiredString).min(1, 'lista_vinetas requiere al menos una viñeta.'),
  orden: optionalPositiveInt,
});

const bloqueGarantiasSchema = z.object({
  tipo: z.literal(TIPO_BLOQUE.GARANTIAS),
  garantias: z.array(requiredString).min(1, 'garantias requiere al menos una garantía.'),
  orden: optionalPositiveInt,
});

const bloqueApartadoCerradoSchema = z.object({
  tipo: z.literal(TIPO_BLOQUE.APARTADO_CERRADO),
  titulo: requiredString,
  contenido_texto: requiredString,
  subtotal: moneyNumber,
  orden: optionalPositiveInt,
});

const bloqueSeccionItemsSchema = z.object({
  tipo: z.literal(TIPO_BLOQUE.SECCION_ITEMS),
  titulo: requiredString,
  items: z.array(itemSchema).min(1, 'seccion_items requiere al menos un item.'),
  orden: optionalPositiveInt,
});

const bloqueSchema = z.discriminatedUnion('tipo', [
  bloqueTextoSchema,
  bloqueListaVinetasSchema,
  bloqueGarantiasSchema,
  bloqueApartadoCerradoSchema,
  bloqueSeccionItemsSchema,
]);

// ===== Header de presupuesto =====

const headerCommonFields = {
  cliente_nombre: requiredString,
  cliente_telefono: telefonoString,
  cliente_direccion: nullableTrimmedString,
  cliente_destinatario: nullableTrimmedString,
  ciudad: optionalString,
  fecha_documento: isoDateString,
  introduccion: nullableTrimmedString,
  nota_final: nullableTrimmedString,
  vigencia_dias: z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === '') return 7;
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    },
    z.number().int().positive(),
  ).default(7),
  adelanto_porcentaje: z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === '') return 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    },
    z.number().min(0).max(100),
  ).default(0),
  moneda: optionalString,
  notas_internas: nullableTrimmedString,
  servicio_id: optionalPositiveInt,
  tipo_servicio: nullableTrimmedString,
  numero_cliente: nullableTrimmedString,
  fuente: z
    .preprocess(
      (v) => (v === undefined || v === null || v === '' ? undefined : String(v).trim()),
      z.enum(Object.values(FUENTE_PRESUPUESTO), {
        errorMap: () => ({ message: 'fuente inválida.' }),
      }),
    )
    .optional()
    .default(FUENTE_PRESUPUESTO.ADMIN),
};

const crearPresupuestoSchema = z.object({
  ...headerCommonFields,
  // nota_final usa la cláusula estándar por default si no llega.
  nota_final: z.preprocess(
    (v) => {
      if (v === undefined) return NOTA_FINAL_DEFAULT;
      if (v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s;
    },
    z.union([z.string(), z.null()]),
  ),
  bloques: z.array(bloqueSchema).optional(),
});

// Update: todos los campos opcionales. Si llegan `bloques`, reemplaza el set.
const actualizarPresupuestoSchema = z
  .object({
    cliente_nombre: optionalString,
    cliente_telefono: telefonoString,
    cliente_direccion: nullableTrimmedString,
    cliente_destinatario: nullableTrimmedString,
    ciudad: optionalString,
    fecha_documento: isoDateString,
    introduccion: nullableTrimmedString,
    nota_final: nullableTrimmedString,
    vigencia_dias: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      },
      z.number().int().positive().optional(),
    ),
    adelanto_porcentaje: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      },
      z.number().min(0).max(100).optional(),
    ),
    moneda: optionalString,
    notas_internas: nullableTrimmedString,
    servicio_id: optionalPositiveInt,
    tipo_servicio: nullableTrimmedString,
    numero_cliente: nullableTrimmedString,
    asignado_a: optionalPositiveInt,
    bloques: z.array(bloqueSchema).optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'Nada que actualizar.' },
  );

// ===== Bloques sueltos (mutación independiente) =====

const agregarBloqueSchema = bloqueSchema;

// Update de bloque: no permite cambiar `tipo`. Aceptamos un objeto plano y
// validamos en el service según el tipo del bloque actual.
const actualizarBloqueSchema = z
  .object({
    titulo: nullableTrimmedString,
    contenido_texto: nullableTrimmedString,
    subtotal: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      },
      z.union([z.number().min(0), z.null()]).optional(),
    ),
    vinetas: z.array(requiredString).optional(),
    garantias: z.array(requiredString).optional(),
    orden: optionalPositiveInt,
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'Nada que actualizar.' },
  );

// ===== Items =====

const agregarItemSchema = itemSchema;

const actualizarItemSchema = z
  .object({
    descripcion: optionalString,
    cantidad: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      },
      z.number().positive().optional(),
    ),
    precio_unitario: z.preprocess(
      (v) => {
        if (v === undefined) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      },
      z.number().min(0).optional(),
    ),
    es_opcional: z.preprocess(
      (v) => (v === undefined ? undefined : !!v),
      z.boolean().optional(),
    ),
    orden: optionalPositiveInt,
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'Nada que actualizar.' },
  );

// ===== Solicitud pública (formulario web sin auth) =====

// Honeypot: campo invisible que debe venir vacío. Si llega con contenido,
// el endpoint silenciosamente ignora la solicitud (anti-bot).
const crearSolicitudPublicaSchema = z.object({
  cliente_nombre: requiredString,
  cliente_telefono: telefonoRequerido,
  cliente_direccion: nullableTrimmedString,
  tipo_servicio: z.preprocess(
    (v) => (v == null ? '' : String(v).trim()),
    z.string().min(1, 'tipo_servicio requerido.').max(100),
  ),
  descripcion_inicial: requiredString,
  // Honeypot: debe venir vacío. Aceptamos cualquier valor, el handler decide.
  honeypot: z.preprocess(
    (v) => (v == null ? '' : String(v).trim()),
    z.string(),
  ).optional().default(''),
});

// ===== Workflow =====

const cambiarEstadoSchema = z.object({
  estado: z.enum(Object.values(ESTADO_PRESUPUESTO), {
    errorMap: () => ({ message: 'Estado inválido.' }),
  }),
});

// Reasignación admin: asignado_a debe ser entero positivo o null.
const reasignarSchema = z.object({
  asignado_a: z.preprocess(
    (v) => {
      if (v === null) return null;
      if (v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    },
    z.union([z.number().int().positive(), z.null()]),
  ),
});

// ===== Param schemas =====

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const bloqueIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  bloqueId: z.coerce.number().int().positive(),
});

const itemIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  bloqueId: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

// ===== Query schemas =====

const listarQuerySchema = z.object({
  estado: optionalString,
  mine: z.preprocess(
    (v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const s = String(v).trim().toLowerCase();
      return s === '1' || s === 'true' ? true : s === '0' || s === 'false' ? false : undefined;
    },
    z.boolean().optional(),
  ),
  cliente: optionalString,
  numero_cliente: optionalString,
  desde: isoDateString,
  hasta: isoDateString,
  // Paginación opt-in: ambos opcionales. Sin ellos el listado no pagina
  // (comportamiento actual). limit acotado para evitar abusos.
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

module.exports = {
  // bloques
  itemSchema,
  bloqueSchema,
  // body schemas
  crearPresupuestoSchema,
  actualizarPresupuestoSchema,
  agregarBloqueSchema,
  actualizarBloqueSchema,
  agregarItemSchema,
  actualizarItemSchema,
  cambiarEstadoSchema,
  reasignarSchema,
  crearSolicitudPublicaSchema,
  // param schemas
  idParamSchema,
  bloqueIdParamSchema,
  itemIdParamSchema,
  // query schemas
  listarQuerySchema,
};
