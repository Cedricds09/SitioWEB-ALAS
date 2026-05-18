// Controller: capa fina entre HTTP y service.

const service = require('./auth.service');
const {
  getSession,
  setAuthCookie,
  clearAuthCookie,
} = require('../../shared/auth/session');

async function login(req, res) {
  const { token, uid, usuario, rol } = await service.login(req.body.usuario, req.body.password);
  setAuthCookie(res, token);
  res.json({ ok: true, data: { uid, usuario, rol } });
}

async function logout(req, res) {
  // Intenta recuperar la sesión para revocar el token vía token_version.
  let sess = null;
  try {
    sess = await getSession(req);
  } catch {
    sess = null;
  }
  clearAuthCookie(res);
  try {
    if (sess && sess.uid != null) await service.logout(sess);
  } catch (err) {
    // No bloqueamos el logout si la revocación falla (ej. migración pendiente).
    console.error('[AUTH] logout: no se pudo revocar el token:', err.message);
  }
  res.json({ ok: true });
}

async function check(req, res) {
  let sess = null;
  try {
    sess = await getSession(req);
  } catch {
    // Token revocado, inválido o fallo de validación: no autenticado.
    sess = null;
  }
  res.json({
    ok: true,
    authed: !!sess,
    uid: sess ? sess.uid : null,
    usuario: sess ? sess.usu : null,
    rol: sess ? sess.rol : null,
  });
}

module.exports = { login, logout, check };
