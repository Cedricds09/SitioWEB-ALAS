// Middleware de auth.
// requireAuth puebla req.session a partir del token de cookie.
// requireAdmin/requireRole validan rol del usuario ya autenticado.

const { UnauthorizedError, ForbiddenError } = require('../errors/AppError');
const ROL = require('../constants/roles');
const { getSession } = require('../auth/session');

function requireAuth(req, _res, next) {
  const sess = getSession(req);
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
