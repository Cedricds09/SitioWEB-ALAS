// Estados de servicios y notas. Strings exactos como están en BD.
// No "normalizar" mayúsculas — coincide con datos existentes y queries actuales.

const ESTADO_SERVICIO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  EN_PROCESO: 'EN_PROCESO',
  TERMINADO: 'TERMINADO',
});

const ESTADO_NOTA = Object.freeze({
  PAGADO: 'PAGADO',
});

const ESTADOS_ACTIVOS = Object.freeze([ESTADO_SERVICIO.PENDIENTE, ESTADO_SERVICIO.EN_PROCESO]);

module.exports = {
  ESTADO_SERVICIO,
  ESTADO_NOTA,
  ESTADOS_ACTIVOS,
};
