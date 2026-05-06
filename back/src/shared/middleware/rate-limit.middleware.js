// Rate limiters reutilizables.
// Aplicar SOLO a endpoints públicos (sin auth) para mitigar spam y bots.

const rateLimit = require('express-rate-limit');

// Solicitudes públicas de cotización: 5 requests por IP cada 10 minutos.
const publicSolicitudLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
  },
  // Trust proxy se setea a nivel app si el deploy va detrás de reverse proxy.
});

module.exports = {
  publicSolicitudLimiter,
};
