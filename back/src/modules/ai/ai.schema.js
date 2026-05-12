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

module.exports = {
  sugerirBloquesSchema,
  MODOS,
};
