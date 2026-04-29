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
        req.body = parsed.data;
      }
      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          return next(
            new ValidationError(formatZodIssues(parsed.error.issues), parsed.error.issues),
          );
        }
        req.params = parsed.data;
      }
      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          return next(
            new ValidationError(formatZodIssues(parsed.error.issues), parsed.error.issues),
          );
        }
        req.query = parsed.data;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validate;
