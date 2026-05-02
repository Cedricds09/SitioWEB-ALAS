'use strict';

// Constantes del dominio "presupuestos".
// Strings exactos como están en BD (CK constraints los validan).

const TIPO_BLOQUE = Object.freeze({
  TEXTO:            'texto',
  LISTA_VINETAS:    'lista_vinetas',
  GARANTIAS:        'garantias',
  APARTADO_CERRADO: 'apartado_cerrado',
  SECCION_ITEMS:    'seccion_items',
});

const ESTADO_PRESUPUESTO = Object.freeze({
  BORRADOR:   'borrador',
  ENVIADO:    'enviado',
  APROBADO:   'aprobado',
  RECHAZADO:  'rechazado',
  CONVERTIDO: 'convertido',
});

// Tabla de transiciones permitidas. Estados terminales tienen lista vacía.
const TRANSICIONES_PERMITIDAS = Object.freeze({
  borrador:   ['enviado', 'rechazado'],
  enviado:    ['aprobado', 'rechazado'],
  aprobado:   ['convertido'],
  rechazado:  [],
  convertido: [],
});

// Cláusula comercial estándar (se aplica como nota_final si el body no manda otra).
const NOTA_FINAL_DEFAULT =
  'Los precios establecidos en este presupuesto están sujetos a cambios sin previo aviso y tienen una validez ' +
  'según los días indicados a partir de su emisión. El costo establecido en el presupuesto incluye material y ' +
  'mano de obra. En caso de existir detalle o elemento adicional a lo establecido aquí, se notificará para su ' +
  'correcta aprobación y desarrollo con su respectivo costo.';

const PREFIJO_NUMERO = 'PR-';
const PAD_NUMERO = 4;

function formatNumeroPresupuesto(n) {
  return `${PREFIJO_NUMERO}${String(n).padStart(PAD_NUMERO, '0')}`;
}

module.exports = {
  TIPO_BLOQUE,
  ESTADO_PRESUPUESTO,
  TRANSICIONES_PERMITIDAS,
  NOTA_FINAL_DEFAULT,
  PREFIJO_NUMERO,
  PAD_NUMERO,
  formatNumeroPresupuesto,
};
