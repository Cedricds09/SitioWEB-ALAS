// Validación Zod del INPUT del módulo ai.
// Defense layer #1: estructura del request HTTP antes de tocar el service.

const { z } = require('zod');

const MODOS = ['generar_inicial', 'mejorar', 'agregar'];

const sugerirBloquesSchema = z
  .object({
    presupuesto_id: z.preprocess(
      (v) => {
        if (v === undefined || v === null || v === '') return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
      },
      z.number().int().positive(),
    ),
    modo: z.enum(MODOS),
    descripcion_inicial: z
      .preprocess(
        (v) => (v == null ? undefined : String(v).trim()),
        z.string().min(10).max(3000),
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.modo === 'generar_inicial' && !data.descripcion_inicial) {
      // Nota: la regla "body wins, fallback a notas_internas" se aplica en service.
      // Aquí solo exigimos que SI se manda, sea válido. La omisión deja al service
      // recurrir al fallback. Si tampoco hay fallback, el service lanza 400.
    }
  });

// Schema del endpoint /chat-presupuesto (Fase 5 — asistente conversacional).
const chatPresupuestoSchema = z
  .object({
    cliente_nombre: z.preprocess(
      (v) => (v == null ? undefined : String(v).trim()),
      z.string().min(2).max(100),
    ).optional(),
    cliente_telefono: z.preprocess(
      (v) => {
        if (v == null) return undefined;
        const d = String(v).replace(/\D+/g, '');
        return d === '' ? undefined : d;
      },
      z.string().regex(/^\d{10}$/, 'Teléfono debe ser 10 dígitos.'),
    ).optional(),
    numero_cliente_existente: z.preprocess(
      (v) => (v == null ? undefined : String(v).trim().toUpperCase()),
      z.string().regex(/^CL-\d{1,4}$/i, 'Formato debe ser CL-XXXX.'),
    ).optional(),
    tipo_servicio: z.enum([
      'plomeria', 'electrica', 'gas', 'pintura', 'soldadura', 'mantenimiento_integral',
    ]),
    descripcion: z.preprocess(
      (v) => (v == null ? '' : String(v).trim()),
      z.string().min(10).max(2000),
    ),
    respuestas_adicionales: z.record(z.string().max(500)).optional().default({}),
  })
  .superRefine((data, ctx) => {
    if (!data.numero_cliente_existente && !data.cliente_nombre) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Falta cliente_nombre o numero_cliente_existente.',
        path: ['cliente_nombre'],
      });
    }
  });

// Schema del endpoint /consulta-negocio — consultas de datos sin Claude API.
const consultaNegocioSchema = z.object({
  tipo: z.enum([
    'activos',
    'urgentes',
    'sin_presupuesto',
    'sin_cerrar',
    'presupuestos_pendientes',
  ]),
});

module.exports = {
  sugerirBloquesSchema,
  chatPresupuestoSchema,
  consultaNegocioSchema,
  MODOS,
};
