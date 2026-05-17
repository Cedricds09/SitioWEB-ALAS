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

// Alta de reseñas públicas: 3 requests por IP cada hora (anti-spam).
const resenaPublicLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiadas reseñas enviadas. Intenta de nuevo más tarde.',
  },
});

// Verificación de cliente (paso 1 del formulario): tope más holgado para
// permitir reintentos legítimos, pero acotado para frenar enumeración.
const resenaVerificarLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiados intentos. Intenta de nuevo más tarde.',
  },
});

module.exports = {
  publicSolicitudLimiter,
  resenaPublicLimiter,
  resenaVerificarLimiter,
};
