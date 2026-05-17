// Validación Zod del módulo resenas.
// Capa de validación de backend (la 2ª de 3: frontend + backend + CHECK en DB).

const { z } = require('zod');

const TIPOS_SERVICIO = [
  'plomeria',
  'electrica',
  'gas',
  'pintura',
  'soldadura',
  'mantenimiento_integral',
];

// POST /api/resenas/verificar — paso 1 del formulario público.
const verificarSchema = z.object({
  numero_cliente: z.string().regex(/^CL-\d{4}$/i, 'Formato inválido. Ejemplo: CL-0001'),
  telefono: z.string().regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos'),
});

// POST /api/resenas/publico — alta de reseña.
const crearPublicaSchema = z.object({
  numero_cliente: z.string().regex(/^CL-\d{4}$/i, 'Formato inválido. Ejemplo: CL-0001'),
  telefono: z.string().regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos'),
  nombre_display: z
    .string()
    .min(2, 'El nombre es muy corto.')
    .max(100, 'El nombre es muy largo.'),
  colonia: z.string().max(100, 'La colonia es muy larga.').optional(),
  tipo_servicio: z.enum(TIPOS_SERVICIO).optional(),
  texto: z
    .string()
    .min(20, 'La reseña debe tener al menos 20 caracteres')
    .max(1000, 'La reseña no puede exceder 1000 caracteres'),
});

// PUT /api/admin/resenas/:id — moderación.
const moderarSchema = z.object({
  estado: z.enum(['aprobada', 'rechazada']),
});

// :id de ruta — coerción segura sin depender de z.coerce.
const idParamSchema = z
  .object({ id: z.unknown() })
  .transform((d) => ({ id: Number.parseInt(String(d.id), 10) }))
  .refine((d) => Number.isInteger(d.id) && d.id > 0, { message: 'ID inválido.' });

module.exports = {
  TIPOS_SERVICIO,
  verificarSchema,
  crearPublicaSchema,
  moderarSchema,
  idParamSchema,
};
