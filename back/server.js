const express = require('express');
const cors = require('cors');
require('dotenv').config();

const path = require('path');
const { getPool } = require('./db');
const notasRouter = require('./routes/notas');
const serviciosRouter = require('./routes/servicios');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'ALAS backend', status: 'running' });
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

app.use('/api/notas', notasRouter);
app.use('/api/servicios', serviciosRouter);

// Panel admin (sirve archivo estático front/admin.html)
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'front', 'admin.html'));
});
app.use('/admin/', express.static(path.join(__dirname, '..', 'front')));

app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Ruta no encontrada: ${req.originalUrl}` });
});

app.listen(PORT, () => {
  console.log(`[SERVER] ALAS backend escuchando en http://localhost:${PORT}`);
  getPool().catch(() => {
    console.warn('[SERVER] Pool no inicializado al arranque. Reintento en primera consulta.');
  });
});
