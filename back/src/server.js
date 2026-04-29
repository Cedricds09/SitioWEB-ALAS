// Entry point del backend ALAS (post-refactor).
// La carga de env (que valida variables al arrancar) ocurre antes de cualquier otra cosa.

const env = require('./shared/config/env'); // valida y aborta si falta algo crítico

const express = require('express');
const cors = require('cors');
const path = require('path');

const { getPool } = require('./shared/db/pool');
const errorMiddleware = require('./shared/middleware/error.middleware');

// Router del módulo migrado
const serviciosRouter = require('./modules/servicios/servicios.routes');

// Routers de módulos NO migrados (siguen viviendo en back/routes/*)
const notasRouter = require('../routes/notas');
const clientesRouter = require('../routes/clientes');
const usuariosRouter = require('../routes/usuarios');
const configRouter = require('../routes/config');
const { router: authRouter, requireAuth } = require('../routes/auth');

const app = express();
const PORT = env.PORT;

// front/ vive a la altura del repo: back/src/server.js -> ../../front
const FRONT_DIR = path.join(__dirname, '..', '..', 'front');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    res.status(500).json({ ok: false, db: 'down', error: err.message });
  }
});

// Config público (incluye Maps API key restringida por dominio en GCP)
app.use('/api/config', configRouter);

// Auth admin
app.use('/api/admin', authRouter);

// Gestión de usuarios (rol admin validado dentro del router)
app.use('/api/admin/usuarios', requireAuth, usuariosRouter);

// Notas públicas (consulta cliente)
app.use('/api/notas', notasRouter);

// Servicios (módulo refactorizado) y clientes — protegidos por sesión admin
app.use('/api/servicios', requireAuth, serviciosRouter);
app.use('/api/clientes', requireAuth, clientesRouter);

// Panel admin → sirve main.html (la SPA detecta /admin y muestra el panel)
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
