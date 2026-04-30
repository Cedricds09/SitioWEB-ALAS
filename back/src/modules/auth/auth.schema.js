// Validación Zod del módulo auth.

const { z } = require('zod');

// Mensaje único "Usuario y contraseña requeridos." — preserva contrato original.
const loginSchema = z
  .object({
    usuario: z.unknown(),
    password: z.unknown(),
  })
  .transform((data) => ({
    usuario: typeof data.usuario === 'string' ? data.usuario.trim() : '',
    password: typeof data.password === 'string' ? data.password : '',
  }))
  .refine(
    ({ usuario, password }) => usuario.length > 0 && password.length > 0,
    { message: 'Usuario y contraseña requeridos.' },
  );

module.exports = { loginSchema };
