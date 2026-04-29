// Middleware de auth.
// requireAuth se mantiene en back/routes/auth.js (puebla req.session).
// Aquí re-exportamos requireAuth y agregamos requireAdmin / requireRole tipados con AppError.

const { ForbiddenError } = require('../errors/AppError');
const ROL = require('../constants/roles');
const { requireAuth } = require('../../../routes/auth');

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
