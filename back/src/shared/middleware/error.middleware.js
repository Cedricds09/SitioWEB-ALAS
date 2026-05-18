// Middleware final de errores. Captura todo lo que pase por next(err).
// Un AppError tipado se traduce a respuesta limpia con su status.
// El resto: log con stack y 500 genérico.

const { AppError } = require('../errors/AppError');

// eslint-disable-next-line no-unused-vars
function errorMiddleware(err, req, res, next) {
  if (err instanceof AppError) {
    if (!res.headersSent) {
      const body = { ok: false, error: err.message, code: err.code };
      if (err.details) body.details = err.details;
      res.status(err.statusCode).json(body);
    }
    return;
  }

  console.error('[ERR]', req.method, req.originalUrl, '-', err.message);
  if (err.stack) console.error(err.stack);

  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
}

module.exports = errorMiddleware;
