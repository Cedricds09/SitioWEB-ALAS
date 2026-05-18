// Rate limiters reutilizables.
// Los públicos frenan spam/bots y enumeración; los autenticados limitan el abuso por usuario.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

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

// Login admin (A1): 5 intentos por IP cada 15 minutos, frena fuerza bruta.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // No cuenta los logins exitosos: solo penaliza intentos fallidos.
  skipSuccessfulRequests: true,
  message: {
    ok: false,
    error: 'Demasiados intentos de acceso. Intenta de nuevo en unos minutos.',
  },
});

// Consulta pública de notas (A2): 10 requests por IP cada 10 minutos.
// Frena la enumeración de pares cliente/nota.
const notasLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiadas consultas. Intenta de nuevo más tarde.',
  },
});

// Consultas de negocio del asistente (B2): 30 requests por usuario cada hora.
// La clave es el uid de sesión (el endpoint corre tras requireAuth).
const consultaNegocioLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Clave por usuario; si no hay sesión, fallback a IP con el helper de
  // express-rate-limit (normaliza IPv6, evita ERR_ERL_KEY_GEN_IPV6).
  keyGenerator: (req) => {
    const uid = req.session && req.session.uid;
    if (uid) return `uid:${uid}`;
    return ipKeyGenerator(req.ip);
  },
  message: {
    ok: false,
    error: 'Demasiadas consultas. Intenta de nuevo más tarde.',
  },
});

// Lecturas públicas de bajo riesgo (config, listado de reseñas aprobadas):
// 60 requests por IP cada 10 minutos. Holgado para uso legítimo (una llamada
// por carga de página), pero frena scraping y abuso del ORDER BY NEWID().
const publicReadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiadas consultas. Intenta de nuevo más tarde.',
  },
});

module.exports = {
  publicSolicitudLimiter,
  resenaPublicLimiter,
  resenaVerificarLimiter,
  loginLimiter,
  notasLimiter,
  consultaNegocioLimiter,
  publicReadLimiter,
};
