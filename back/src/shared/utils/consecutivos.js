// Helpers para formatear consecutivos. Mismos prefijos y padding que el código original.

const PREFIJO_NOTA = 'ALAS-';
const PAD_NOTA = 4;

const PREFIJO_CLIENTE = 'CL-';
const PAD_CLIENTE = 4;

function formatNotaCode(n) {
  return `${PREFIJO_NOTA}${String(n).padStart(PAD_NOTA, '0')}`;
}

function formatClienteCode(n) {
  return `${PREFIJO_CLIENTE}${String(n).padStart(PAD_CLIENTE, '0')}`;
}

module.exports = {
  PREFIJO_NOTA,
  PAD_NOTA,
  PREFIJO_CLIENTE,
  PAD_CLIENTE,
  formatNotaCode,
  formatClienteCode,
};
