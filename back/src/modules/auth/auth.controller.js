// Controller — capa fina entre HTTP y service.

const service = require('./auth.service');
const {
  getSession,
  setAuthCookie,
  clearAuthCookie,
} = require('../../shared/auth/session');

async function login(req, res) {
  const { token, usuario, rol } = await service.login(req.body.usuario, req.body.password);
  setAuthCookie(res, token);
  res.json({ ok: true, data: { usuario, rol } });
}

function logout(_req, res) {
  clearAuthCookie(res);
  res.json({ ok: true });
}

function check(req, res) {
  const sess = getSession(req);
  res.json({
    ok: true,
    authed: !!sess,
    usuario: sess ? sess.usu : null,
    rol: sess ? sess.rol : null,
  });
}

module.exports = { login, logout, check };
