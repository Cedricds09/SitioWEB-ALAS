// Entry point del backend ALAS.
// La carga de env (valida variables al arrancar) va antes que todo lo demás.

const env = require('./shared/config/env'); // valida y aborta si falta algo crítico

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const pkg = require('../package.json'); // version para /api/health
const { getPool } = require('./shared/db/pool');
const errorMiddleware = require('./shared/middleware/error.middleware');
const { requireAuth } = require('./shared/middleware/auth.middleware');

// Routers de módulos migrados
const authRouter = require('./modules/auth/auth.routes');
const configRouter = require('./modules/config/config.routes');
const notasRouter = require('./modules/notas/notas.routes');
const clientesRouter = require('./modules/clientes/clientes.routes');
const usuariosRouter = require('./modules/usuarios/usuarios.routes');
const serviciosRouter = require('./modules/servicios/servicios.routes');
const presupuestosRouter = require('./modules/presupuestos/presupuestos.routes');
const aiRouter = require('./modules/ai/ai.routes');
const {
  publicRouter: resenasPublicRouter,
  adminRouter: resenasAdminRouter,
} = require('./modules/resenas/resenas.routes');

const app = express();
const PORT = env.PORT;

// front/ vive a la altura del repo: back/src/server.js -> ../../front
const FRONT_DIR = path.join(__dirname, '..', '..', 'front');

// No revelar el stack en headers.
app.disable('x-powered-by');

// Trust proxy: en producción el server vive detrás de NGINX/Cloudflare, así
// req.ip y X-Forwarded-For reflejan la IP real del cliente (clave para que el
// rate-limit cuente por IP correcta y no por la del proxy). Confiamos SOLO en
// el primer hop (1) — `true` permitiría spoofear X-Forwarded-For y burlar los
// limiters. En desarrollo queda en false (default) porque no hay proxy.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Headers de seguridad (helmet) + CSP a medida del frontend:
// Google Maps (JS API + embed), CDN de jspdf/qrious y estáticos propios.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://maps.googleapis.com',
          'https://maps.gstatic.com',
        ],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'data:'],
        // cdnjs incluido para los source maps (.map) de jspdf/qrious,
        // que el navegador pide vía connect-src.
        'connect-src': ["'self'", 'https://maps.googleapis.com', 'https://cdnjs.cloudflare.com'],
        'frame-src': ['https://www.google.com', 'https://maps.google.com'],
        // Anti-clickjacking moderno (complemento a X-Frame-Options de helmet).
        'frame-ancestors': ["'self'"],
        'worker-src': ["'self'", 'blob:'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        // Eliminado: rompería los estáticos http en desarrollo local.
        'upgrade-insecure-requests': null,
      },
    },
  }),
);

// CORS: en desarrollo refleja cualquier origen; en producción solo los
// listados en ALLOWED_ORIGIN. Acepta CSV ("https://a.com,https://b.com")
// para soportar múltiples subdominios. Sin valor en prod rechaza todo.
const allowedOrigins = String(env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOrigin = env.NODE_ENV === 'production'
  ? (origin, cb) => {
      // origin null = same-origin o request server-side (curl, health checks).
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS bloqueado: ${origin}`));
    }
  : true;

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Sanitiza query strings sensibles antes de loguear (PII en logs es P0).
// validacion = teléfono del cliente; password = obvio; token = sesión.
const SENSITIVE_QUERY_KEYS = /(validacion|telefono|password|token|api[_-]?key)=[^&]*/gi;
function sanitizeUrlForLog(url) {
  return String(url || '').replace(SENSITIVE_QUERY_KEYS, (m) => m.split('=')[0] + '=***');
}

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${sanitizeUrlForLog(req.originalUrl)}`);
  next();
});

// Modo mantenimiento: 503 + mantenimiento.html en TODAS las rutas excepto
// GET /api/health (para que UptimeRobot siga sondeando). Se registra solo si
// MAINTENANCE_MODE=true al arrancar; sin overhead cuando está apagado.
if (env.MAINTENANCE_MODE) {
  console.warn('[SERVER] MODO MANTENIMIENTO ACTIVO — solo GET /api/health responde normal.');
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.path === '/api/health') return next();
    res
      .status(503)
      .set('Retry-After', '3600')
      .sendFile(path.join(FRONT_DIR, 'mantenimiento.html'));
  });
}

app.get('/api/health', async (_req, res) => {
  // Datos siempre disponibles, no dependen de la DB.
  const meta = {
    version: pkg.version,
    uptime: Math.round(process.uptime()), // segundos desde el arranque
    maintenance: env.MAINTENANCE_MODE,
  };
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true, db: 'ok', ...meta });
  } catch (err) {
    res.status(500).json({ ok: false, db: 'error', error: err.message, ...meta });
  }
});

// Config público (incluye Maps API key restringida por dominio en GCP)
app.use('/api/config', configRouter);

// Auth admin
app.use('/api/admin', authRouter);

// Gestión de usuarios (rol admin validado dentro del router)
app.use('/api/admin/usuarios', requireAuth, usuariosRouter);

// Moderación de reseñas con sesión admin (requireAdmin en el PUT del router)
app.use('/api/admin/resenas', requireAuth, resenasAdminRouter);

// Notas públicas (consulta cliente)
app.use('/api/notas', notasRouter);

// Reseñas públicas (alta validada + listado de aprobadas)
app.use('/api/resenas', resenasPublicRouter);

// Servicios y clientes: protegidos por sesión admin
app.use('/api/servicios', requireAuth, serviciosRouter);
app.use('/api/clientes', requireAuth, clientesRouter);

// Presupuestos: autenticación interna del propio router
app.use('/api/presupuestos', presupuestosRouter);

// IA (Fase 3): autenticación interna del propio router
app.use('/api/ai', aiRouter);

// Sitio principal: ruta limpia /main que sirve main.html (la bienvenida en
// index.html lleva aquí). main.html sigue accesible directo vía estáticos.
app.get('/main', (_req, res) => {
  res.sendFile(path.join(FRONT_DIR, 'main.html'));
});

// Panel admin: sirve main.html (la SPA detecta /admin y muestra el panel)
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(FRONT_DIR, 'main.html'));
});

// Estáticos del frontend (incluye index.html en /)
app.use(express.static(FRONT_DIR));

// Middleware de errores tipados ANTES del 404 handler
app.use(errorMiddleware);

// 404 final
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Ruta no encontrada: ${req.originalUrl}` });
});

app.listen(PORT, () => {
  console.log(`[SERVER] ALAS backend escuchando en http://localhost:${PORT}`);
  getPool().catch(() => {
    console.warn('[SERVER] Pool no inicializado al arranque. Reintento en primera consulta.');
  });
});
