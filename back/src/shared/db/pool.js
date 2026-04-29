// Pool singleton de SQL Server. Lazy init.
// Migración funcional de back/db.js — sin defaults hardcodeados, env validado por env.js.

const sql = require('mssql');
const env = require('../config/env');

const config = {
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  server: env.DB_SERVER,
  port: env.DB_PORT,
  database: env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    console.log(
      `[DB] Conectando TCP a ${config.server}:${config.port} / ${config.database} (user=${config.user})`,
    );

    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then((pool) => {
        console.log('[DB] Conexión establecida OK.');
        pool.on('error', (err) => {
          console.error('[DB] Pool error:', err.message);
        });
        return pool;
      })
      .catch((err) => {
        console.error('[DB] FALLO de conexión:');
        console.error('     message :', err.message);
        console.error('     code    :', err.code);
        if (err.originalError) {
          console.error('     origMsg :', err.originalError.message);
        }
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
