// Schema Zod para validar lo que devuelve Claude.
// Capa de defensa #2: si Claude desobedece las reglas inviolables, rechazamos
// la respuesta.

const { z } = require('zod');

// ============================================================
// Sub-schemas compartidos
// ============================================================

const TIPOS_SERVICIO = [
  'plomeria',
  'electrica',
  'gas',
  'pintura',
  'soldadura',
  'mantenimiento_integral'
];

const MODOS = ['generar_inicial', 'mejorar', 'agregar'];

// precio_unitario y cantidad deben ser null (Regla #1: la IA nunca pone
// precios). Si Claude intenta poner un número, Zod lo rechaza.
const itemSchema = z.object({
  descripcion: z.string().min(3).max(500),
  cantidad: z.null(), // inviolable: debe ser null
  precio_unitario: z.null(), // inviolable: debe ser null
  es_opcional: z.boolean().default(false)
});

// ============================================================
// Schemas de bloques: union discriminada por tipo
// ============================================================

const bloqueTextoSchema = z.object({
  tipo: z.literal('texto'),
  titulo: z.string().max(200).nullable(),
  contenido_texto: z.string().min(10).max(5000)
});

const bloqueListaVinetasSchema = z.object({
  tipo: z.literal('lista_vinetas'),
  titulo: z.string().max(200).nullable(),
  vinetas: z.array(z.string().min(3).max(500)).min(1).max(20)
});

const bloqueGarantiasSchema = z.object({
  tipo: z.literal('garantias'),
  titulo: z.string().max(200).nullable(),
  garantias: z.array(z.string().min(5).max(500)).min(1).max(10)
});

const bloqueApartadoCerradoSchema = z.object({
  tipo: z.literal('apartado_cerrado'),
  titulo: z.string().min(3).max(300),
  contenido_texto: z.string().min(10).max(5000),
  subtotal: z.null() // inviolable: debe ser null
});

const bloqueSeccionItemsSchema = z.object({
  tipo: z.literal('seccion_items'),
  titulo: z.string().min(3).max(300),
  items: z.array(itemSchema).min(1).max(30)
});

const bloqueSchema = z.discriminatedUnion('tipo', [
  bloqueTextoSchema,
  bloqueListaVinetasSchema,
  bloqueGarantiasSchema,
  bloqueApartadoCerradoSchema,
  bloqueSeccionItemsSchema
]);

// ============================================================
// Sub-schemas de mejoras / items_nuevos
// ============================================================

// Tolerante a string a number: Claude a veces devuelve IDs como strings
// ("12" en vez de 12) o con prefijo ("item_12"). Lo forzamos a número y
// validamos el resultado como entero positivo.
const idTolerantSchema = z.union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === 'number') return v;
    const m = String(v).match(/\d+/);
    return m ? parseInt(m[0], 10) : NaN;
  })
  .pipe(z.number().int().positive());

const mejoraSchema = z.object({
  item_id: idTolerantSchema,
  descripcion_original: z.string(),
  descripcion_mejorada: z.string().min(3).max(500)
});

const itemNuevoSchema = z.object({
  bloque_id_destino: idTolerantSchema,
  descripcion: z.string().min(3).max(500),
  cantidad: z.null(),
  precio_unitario: z.null(),
  es_opcional: z.literal(true) // inviolable: los items nuevos de la IA siempre son opcionales
});

// ============================================================
// Schema raíz
// ============================================================

const aiResponseSchema = z.object({
  modo: z.enum(MODOS),
  tipo_servicio_detectado: z.enum(TIPOS_SERVICIO).nullable(),
  bloques: z.array(bloqueSchema).max(15).default([]),
  mejoras: z.array(mejoraSchema).max(50).default([]),
  items_nuevos: z.array(itemNuevoSchema).max(20).default([]),
  notas_al_admin: z.string().max(2000).nullable()
}).superRefine((data, ctx) => {
  if (data.modo === 'generar_inicial') {
    if (data.mejoras.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'En modo generar_inicial, mejoras debe estar vacío.', path: ['mejoras'] });
    }
    if (data.items_nuevos.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'En modo generar_inicial, items_nuevos debe estar vacío.', path: ['items_nuevos'] });
    }
  }
  if (data.modo === 'mejorar' || data.modo === 'agregar') {
    if (data.bloques.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `En modo ${data.modo}, bloques debe estar vacío.`, path: ['bloques'] });
    }
  }
  if (data.modo === 'agregar' && data.mejoras.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'En modo agregar, mejoras debe estar vacío.', path: ['mejoras'] });
  }
});

function validateAiResponse(raw) {
  const result = aiResponseSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: 'La respuesta de la IA no cumple con el formato esperado.',
      details: result.error.format()
    };
  }
  return { ok: true, data: result.data };
}

module.exports = {
  aiResponseSchema,
  validateAiResponse,
  TIPOS_SERVICIO,
  MODOS
};
