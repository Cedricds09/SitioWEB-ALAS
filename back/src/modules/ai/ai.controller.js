// Controller del módulo ai — capa fina entre HTTP y service.
// No tiene try/catch (asyncHandler lo cubre). No tiene SQL ni lógica de negocio.

const service = require('./ai.service');

// POST /api/ai/sugerir-bloques
async function sugerirBloques(req, res) {
  const data = await service.sugerirBloques(req.body, req.session || {});
  res.json({ ok: true, data });
}

// POST /api/ai/chat-presupuesto — Fase 5 (asistente conversacional)
async function chatPresupuesto(req, res) {
  const data = await service.chatPresupuesto(req.body, req.session || {});
  res.json({ ok: true, data });
}

module.exports = {
  sugerirBloques,
  chatPresupuesto,
};
