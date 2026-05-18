// Service: reglas de negocio del módulo usuarios.

const bcrypt = require('bcryptjs');

const repo = require('./usuarios.repository');
const authRepo = require('../auth/auth.repository');
const { withTransaction } = require('../../shared/db/transaction');
const {
  NotFoundError,
  ConflictError,
} = require('../../shared/errors/AppError');
const ROL = require('../../shared/constants/roles');

async function listarTecnicos() {
  return repo.listarTecnicosConCarga();
}

async function listar() {
  return repo.listar();
}

async function crear({ usuario, password, rol, telefono }) {
  const dup = await repo.buscarPorUsuario(usuario);
  if (dup) throw new ConflictError('Usuario ya existe.');

  const hash = bcrypt.hashSync(password, 10);
  return repo.crear({ usuario, hash, rol, telefono: telefono ?? null });
}

// Edita un usuario. `cambios` solo trae los campos a modificar.
// `currentUid` evita que el admin se desactive o se quite el rol a sí mismo.
async function editar(id, cambios, currentUid) {
  if (currentUid === id) {
    if (cambios.activo === false) {
      throw new ConflictError('No puedes desactivar tu propia cuenta.');
    }
    if (cambios.rol && cambios.rol !== ROL.ADMIN) {
      throw new ConflictError('No puedes quitarte el rol admin a ti mismo.');
    }
  }

  return withTransaction(async (tx) => {
    const cur = await repo.buscarPorId(id, tx);
    if (!cur) throw new NotFoundError('Usuario no encontrado.');
    const oldUsuario = cur.usuario;

    if (cambios.usuario !== undefined && cambios.usuario !== oldUsuario) {
      const dup = await repo.buscarPorUsuario(cambios.usuario, tx);
      if (dup) throw new ConflictError('Usuario ya existe.');
    }

    const updated = await repo.actualizar(id, cambios, tx);
    if (!updated) throw new NotFoundError('Usuario no encontrado.');

    if (cambios.usuario !== undefined && cambios.usuario !== oldUsuario) {
      await repo.cascadeRenameEnServicios(oldUsuario, cambios.usuario, tx);
    }

    return updated;
  });
}

async function cambiarPassword(id, password) {
  const hash = bcrypt.hashSync(password, 10);
  const r = await repo.cambiarPassword(id, hash);
  if (!r) throw new NotFoundError('Usuario no encontrado.');

  // Invalida las sesiones previas del usuario, como es estándar al cambiar
  // contraseña. Best-effort: no rompe si falta la migración 009.
  try {
    await authRepo.incrementTokenVersion(id);
  } catch (err) {
    console.warn('[AUTH] token_version no incrementado tras cambio de contraseña:', err.message);
  }
}

module.exports = {
  listarTecnicos,
  listar,
  crear,
  editar,
  cambiarPassword,
};
