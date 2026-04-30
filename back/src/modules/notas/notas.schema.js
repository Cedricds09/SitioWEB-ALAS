// Validación Zod del módulo notas.
// Mensaje preserva contrato original: faltar cualquiera de los dos da el mismo string.

const { z } = require('zod');

const PARAMS_MISSING = 'Parámetros requeridos: cliente (param) y validacion (query).';

const buscarParamSchema = z
  .object({ cliente: z.unknown() })
  .transform((d) => ({
    cliente: typeof d.cliente === 'string' ? d.cliente.trim() : '',
  }))
  .refine((d) => d.cliente.length > 0, { message: PARAMS_MISSING });

const buscarQuerySchema = z
  .object({ validacion: z.unknown() })
  .transform((d) => ({
    validacion: typeof d.validacion === 'string' ? d.validacion.trim() : '',
  }))
  .refine((d) => d.validacion.length > 0, { message: PARAMS_MISSING });

module.exports = {
  buscarParamSchema,
  buscarQuerySchema,
};
