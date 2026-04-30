// Validación Zod del módulo usuarios.

const { z } = require('zod');
const ROL = require('../../shared/constants/roles');

const ROLES_VALIDOS = [ROL.ADMIN, ROL.TECNICO];

const usuarioString = z.preprocess(
  (v) => (v == null ? '' : String(v).trim()),
  z.string().min(1, 'Usuario requerido.').max(50, 'Usuario máx 50 caracteres.'),
);

const passwordString = z.preprocess(
  (v) => (typeof v === 'string' ? v : ''),
  z.string().min(6, 'Contraseña mínimo 6 caracteres.'),
);

const rolString = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : 'admin'),
  z.enum(ROLES_VALIDOS, { errorMap: () => ({ message: 'Rol inválido.' }) }),
);

const telefonoNullable = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  },
  z.union([z.string().max(20, 'Teléfono máx 20 caracteres.'), z.null()]).optional(),
);

const crearUsuarioSchema = z.object({
  usuario: usuarioString,
  password: passwordString,
  rol: rolString.optional().default(ROL.ADMIN),
  telefono: telefonoNullable,
});

const editarUsuarioSchema = z
  .object({
    rol: z
      .preprocess(
        (v) => (v === undefined ? undefined : String(v).trim().toLowerCase()),
        z.enum(ROLES_VALIDOS, { errorMap: () => ({ message: 'Rol inválido.' }) }),
      )
      .optional(),
    activo: z.preprocess((v) => (v === undefined ? undefined : !!v), z.boolean().optional()),
    telefono: telefonoNullable,
    usuario: z
      .preprocess(
        (v) => (v === undefined ? undefined : String(v ?? '').trim()),
        z
          .string()
          .min(1, 'usuario vacío.')
          .max(50, 'usuario máx 50 caracteres.'),
      )
      .optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'Nada que actualizar.',
  });

const passwordSchema = z.object({
  password: passwordString,
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

module.exports = {
  crearUsuarioSchema,
  editarUsuarioSchema,
  passwordSchema,
  idParamSchema,
};
