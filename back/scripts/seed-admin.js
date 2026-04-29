// Crea o actualiza un usuario admin con password hasheada (bcrypt).
// Uso:
//   node scripts/seed-admin.js [usuario] [password]
//   (defaults: ADMIN_USER y ADMIN_PASS desde .env, o "admin" / "AdminAlas26*")

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, getPool } = require('../src/shared/db/pool');

(async () => {
  const usuario = process.argv[2] || process.env.ADMIN_USER || 'admin';
  const password = process.argv[3] || process.env.ADMIN_PASS || 'AdminAlas26*';

  if (!password || password.length < 6) {
    console.error('Password debe tener al menos 6 caracteres.');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(password, 10);

  try {
    const pool = await getPool();

    const exists = await pool
      .request()
      .input('usuario', sql.NVarChar(50), usuario)
      .query('SELECT id FROM dbo.usuarios WHERE usuario = @usuario');

    if (exists.recordset.length) {
      await pool
        .request()
        .input('usuario', sql.NVarChar(50), usuario)
        .input('hash', sql.NVarChar(255), hash)
        .query(`
          UPDATE dbo.usuarios
          SET password_hash = @hash, activo = 1
          WHERE usuario = @usuario
        `);
      console.log(`[SEED] Password actualizada para usuario "${usuario}".`);
    } else {
      await pool
        .request()
        .input('usuario', sql.NVarChar(50), usuario)
        .input('hash', sql.NVarChar(255), hash)
        .input('rol', sql.NVarChar(20), 'admin')
        .query(`
          INSERT INTO dbo.usuarios (usuario, password_hash, rol, activo, fecha_creacion)
          VALUES (@usuario, @hash, @rol, 1, GETDATE())
        `);
      console.log(`[SEED] Usuario "${usuario}" creado.`);
    }

    console.log(`[SEED] Listo. Login con: ${usuario} / ${password}`);
    process.exit(0);
  } catch (err) {
    console.error('[SEED] Error:', err.message);
    process.exit(1);
  }
})();
