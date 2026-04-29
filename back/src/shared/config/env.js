// Carga y valida variables de entorno al arrancar.
// Falla rápido si faltan variables críticas — evita errores en runtime.

const path = require('path');

// Carga .env desde la raíz del módulo back/ (dos niveles arriba: src/shared/config -> back/)
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const REQUIRED = ['DB_USER', 'DB_PASSWORD', 'DB_SERVER', 'DB_PORT', 'DB_NAME', 'SESSION_SECRET'];

const missing = REQUIRED.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
if (missing.length) {
  console.error('[ENV] Faltan variables requeridas:', missing.join(', '));
  console.error('[ENV] Define estas variables en back/.env antes de arrancar.');
  process.exit(1);
}

if (String(process.env.SESSION_SECRET).length < 16) {
  console.error('[ENV] SESSION_SECRET debe tener al menos 16 caracteres.');
  process.exit(1);
}

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 3000,

  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_SERVER: process.env.DB_SERVER,
  DB_PORT: parseInt(process.env.DB_PORT, 10),
  DB_NAME: process.env.DB_NAME,

  SESSION_SECRET: process.env.SESSION_SECRET,

  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
});

module.exports = env;
