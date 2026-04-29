// Wrapper para handlers async. Captura promesas rechazadas y manda al error middleware.
// Evita try/catch duplicado en cada controller.
// Uso: router.get('/x', asyncHandler(ctrl.fn))

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
