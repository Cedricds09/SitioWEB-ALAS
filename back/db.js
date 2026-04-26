const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Admin@2026',
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 1433,
  database: process.env.DB_NAME || 'ALAS',
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
      `[DB] Conectando TCP a ${config.server}:${config.port} / ${config.database} (user=${config.user})`
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
