// Middleware de auth.
// requireAuth puebla req.session desde el token de cookie.
// requireAdmin/requireRole validan el rol del usuario ya autenticado.

const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');
const ROL = require('../constants/roles');
const { getSession } = require('../auth/session');

// Async: getSession consulta la DB (token_version) y puede lanzar.
async function requireAuth(req, _res, next) {
  let sess;
  try {
    sess = await getSession(req);
  } catch (err) {
    const msg = (err && err.message) || '';
    if (msg.includes('Sesión revocada')) {
      return next(new UnauthorizedError('Sesión revocada. Inicia sesión de nuevo.'));
    }
    if (msg.includes('Usuario no encontrado')) {
      return next(new UnauthorizedError('Sesión inválida. Inicia sesión de nuevo.'));
    }
    // Fallo de validación (DB caída, etc.): fail closed, no se deja pasar.
    console.error('[AUTH] requireAuth: no se pudo validar la sesión:', msg);
    return next(new UnauthorizedError('No se pudo validar la sesión. Intenta de nuevo.'));
  }
  if (!sess) return next(new UnauthorizedError('No autorizado'));
  req.session = sess;
  next();
}

function requireAdmin(req, _res, next) {
  if (!req.session || req.session.rol !== ROL.ADMIN) {
    return next(new ForbiddenError('Requiere rol admin.'));
  }
  next();
}

function requireRole(...roles) {
  const set = new Set(roles);
  return function (req, _res, next) {
    if (!req.session || !set.has(req.session.rol)) {
      return next(new ForbiddenError('Rol no autorizado.'));
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireRole,
};
