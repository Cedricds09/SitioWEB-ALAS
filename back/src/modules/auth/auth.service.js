// Service — reglas de negocio del módulo auth.

const bcrypt = require('bcryptjs');

const repo = require('./auth.repository');
const { UnauthorizedError } = require('../../shared/errors/AppError');
const { signToken, COOKIE_MAX_AGE_MS } = require('../../shared/auth/session');

// Hash dummy para mantener tiempo similar cuando user no existe (mitiga timing attacks).
const DUMMY_HASH = '$2a$10$0000000000000000000000000000000000000000000000000000a';

async function login(usuario, password) {
  console.log('[AUTH] login intento usuario=', usuario);

  const u = await repo.buscarPorUsuario(usuario);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);

  if (!u || !u.activo || !ok) {
    console.log('[AUTH] login fallido usuario=', usuario);
    throw new UnauthorizedError('Usuario o contraseña incorrectos.');
  }

  const token = signToken({
    uid: u.id,
    usu: u.usuario,
    rol: u.rol || 'admin',
    exp: Date.now() + COOKIE_MAX_AGE_MS,
  });

  console.log('[AUTH] login OK usuario=', u.usuario, 'id=', u.id);
  return { token, usuario: u.usuario, rol: u.rol };
}

module.exports = { login };
