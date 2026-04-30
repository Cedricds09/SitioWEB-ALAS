// Validador genérico con Zod.
// Uso: validate({ body: schema, params: schema, query: schema })
// Si pasa, reemplaza req.body/params/query con datos parseados (con tipos coercionados).
// Si falla, lanza ValidationError con mensaje legible.

const { ValidationError } = require('../errors/AppError');

function formatZodIssues(issues) {
  return issues
    .map((i) => {
      const path = i.path.join('.');
      return path ? `${path}: ${i.message}` : i.message;
    })
    .join('; ');
}

// Express 5 hace `req.query` getter-only — `req.query = ...` falla silenciosamente.
// Object.defineProperty redefine la propiedad como writable. body/params siguen
// siendo writable en Express 5, pero usar defineProperty también para consistencia.
function replaceReqProp(req, key, value) {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

function validate(schemas) {
  return function (req, _res, next) {
    try {
      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body);
        if (!parsed.success) {
          return next(
            new ValidationError(formatZodIssues(parsed.error.issues), parsed.error.issues),
          );
        }
        replaceReqProp(req, 'body', parsed.data);
      }
      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          return next(
            new ValidationError(formatZodIssues(parsed.error.issues), parsed.error.issues),
          );
        }
        replaceReqProp(req, 'params', parsed.data);
      }
      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          return next(
            new ValidationError(formatZodIssues(parsed.error.issues), parsed.error.issues),
          );
        }
        replaceReqProp(req, 'query', parsed.data);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validate;
