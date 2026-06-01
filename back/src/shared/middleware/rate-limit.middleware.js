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

// Check de sesión: 30 requests por IP cada 15 minutos. Frena enumeración
// silenciosa de tokens válidos (un atacante con tokens robados podría
// validarlos en masa sin login).
const checkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiadas consultas de sesión.',
  },
});

// Logout: 20 requests por IP por hora. Sin esto, un atacante con cookie
// válida puede spam-revocar tokens (incrementa token_version sin parar).
const logoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Demasiados intentos.',
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

// Clave por usuario autenticado; fallback a IP normalizada (IPv6-safe). Se
// reutiliza en los limiters autenticados de abajo (corren tras requireAuth).
function uidKey(req) {
  const uid = req.session && req.session.uid;
  if (uid) return `uid:${uid}`;
  return ipKeyGenerator(req.ip);
}

// Búsqueda de clientes (A1): autocompletado del formulario de servicios. El
// front teclea con debounce, así que el uso legítimo genera pocas decenas por
// minuto; 120/min/usuario deja margen de sobra pero corta la enumeración en
// bucle (miles de q/seg) de toda la cartera de numero_cliente.
const clienteSearchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: uidKey,
  message: {
    ok: false,
    error: 'Demasiadas búsquedas. Intenta de nuevo en un momento.',
  },
});

// Servicios (A3): cap de seguridad para todos los endpoints autenticados del
// módulo (listado + acciones). 200/min/usuario es holgado para el panel admin
// (refrescos + acciones) y frena spam de creación/finalización.
const serviciosLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: uidKey,
  message: {
    ok: false,
    error: 'Demasiadas operaciones. Intenta de nuevo en un momento.',
  },
});

// Presupuestos (M4): cap para los endpoints autenticados. La edición es muy
// granular (un request por bloque/item/estado) y suma el chat IA, así que el
// tope es alto (300/min/usuario) para no estorbar la edición legítima, pero
// frena creación/borrado masivo o enumeración de IDs.
const presupuestosLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: uidKey,
  message: {
    ok: false,
    error: 'Demasiadas operaciones. Intenta de nuevo en un momento.',
  },
});

module.exports = {
  publicSolicitudLimiter,
  resenaPublicLimiter,
  resenaVerificarLimiter,
  loginLimiter,
  checkLimiter,
  logoutLimiter,
  notasLimiter,
  consultaNegocioLimiter,
  publicReadLimiter,
  clienteSearchLimiter,
  serviciosLimiter,
  presupuestosLimiter,
};
