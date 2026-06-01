// Service: reglas de negocio del módulo auth.

const bcrypt = require('bcryptjs');

const repo = require('./auth.repository');
const { UnauthorizedError } = require('../../shared/errors/AppError');
const { signToken, COOKIE_MAX_AGE_MS } = require('../../shared/auth/session');

// Hash dummy para mantener tiempo similar cuando user no existe (mitiga timing attacks).
const DUMMY_HASH = '$2a$10$0000000000000000000000000000000000000000000000000000a';

// No se loguea el nombre de usuario en claro (revela cuentas válidas y patrones
// de intentos si los logs se comprometen). Se enmascara dejando la inicial.
function maskUser(u) {
  const s = String(u || '');
  return s ? `${s.slice(0, 1)}***` : '(vacío)';
}

async function login(usuario, password) {
  console.log('[AUTH] login intento usuario=', maskUser(usuario));

  const u = await repo.buscarPorUsuario(usuario);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);

  if (!u || !u.activo || !ok) {
    console.log('[AUTH] login fallido usuario=', maskUser(usuario));
    throw new UnauthorizedError('Usuario o contraseña incorrectos.');
  }

  // token_version actual del usuario, para incrustarlo en el token.
  let tv = 0;
  try {
    const v = await repo.getTokenVersion(u.id);
    if (typeof v === 'number') tv = v;
  } catch (err) {
    // Columna token_version ausente (migración 009 pendiente): tv queda en 0.
    console.warn('[AUTH] token_version no disponible al firmar — se usa 0:', err.message);
  }

  const token = signToken({
    uid: u.id,
    usu: u.usuario,
    rol: u.rol || 'admin',
    exp: Date.now() + COOKIE_MAX_AGE_MS,
    tv,
  });

  console.log('[AUTH] login OK uid=', u.id, 'rol=', u.rol);
  return { token, uid: u.id, usuario: u.usuario, rol: u.rol };
}

// Revoca la sesión actual. Incrementar token_version invalida de inmediato
// el token recién usado y cualquier copia de él.
async function logout(sesion) {
  if (sesion && sesion.uid != null) {
    await repo.incrementTokenVersion(sesion.uid);
  }
}

module.exports = { login, logout };
