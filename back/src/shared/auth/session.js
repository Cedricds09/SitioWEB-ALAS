// Sesión por cookie firmada con HMAC-SHA256.
// Token = base64url(JSON {uid, usu, rol, exp}) + '.' + hex(HMAC-SHA256)
// Validez: 8 horas desde emisión.

const crypto = require('crypto');
const env = require('../config/env');
const authRepo = require('../../modules/auth/auth.repository');

const COOKIE_NAME = 'alas_admin';
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 horas

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', env.SESSION_SECRET).update(body).digest('hex');
  return `${body}.${sig}`;
}

// Async: además de firma + expiración, valida el token_version contra la DB
// para soportar revocación de sesiones (M3).
// Devuelve el payload, null (token mal formado / firma inválida / expirado),
// o LANZA error en casos que el caller debe tratar como 401:
//   - 'Sesión revocada...'  → token_version no coincide.
//   - 'Usuario no encontrado o inactivo' → usuario borrado / desactivado.
//   - 'No se pudo validar la sesión.' → fallo de DB (fail closed).
async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(body).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number') return null;
  if (Date.now() > payload.exp) return null;

  // --- Revocación por token_version (M3) ---
  let tvDB;
  try {
    tvDB = await authRepo.getTokenVersion(payload.uid);
  } catch (err) {
    // Columna token_version ausente (migración 009 pendiente):
    // degradación controlada — no se bloquea durante el deploy.
    const msg = (err && err.message) || '';
    if ((err && err.number === 207) || /invalid column name|token_version/i.test(msg)) {
      console.warn('[AUTH] token_version ausente (migración 009 pendiente) — revocación inactiva temporalmente.');
      return payload;
    }
    // Cualquier otro fallo de DB → fail closed: el token NO se acepta.
    console.error('[AUTH] No se pudo validar token_version — token rechazado:', msg);
    throw new Error('No se pudo validar la sesión.');
  }

  // Usuario inexistente o inactivo.
  if (tvDB === null) {
    throw new Error('Usuario no encontrado o inactivo');
  }

  // Token emitido antes de la migración (sin tv): se permite hasta que expire.
  if (typeof payload.tv !== 'number') {
    console.warn('[AUTH] token sin tv (emitido pre-migración) — se permite hasta expirar.');
    return payload;
  }

  if (payload.tv !== tvDB) {
    throw new Error('Sesión revocada. Inicia sesión de nuevo.');
  }

  return payload;
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const found = raw
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

// Async (verifyToken consulta la DB). Puede lanzar — ver verifyToken.
async function getSession(req) {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = {
  COOKIE_NAME,
  COOKIE_MAX_AGE_MS,
  signToken,
  verifyToken,
  getSession,
  setAuthCookie,
  clearAuthCookie,
};
