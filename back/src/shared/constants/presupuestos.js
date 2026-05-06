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
  SOLICITUD:  'solicitud',
  BORRADOR:   'borrador',
  ENVIADO:    'enviado',
  APROBADO:   'aprobado',
  RECHAZADO:  'rechazado',
  CONVERTIDO: 'convertido',
});

// Tabla de transiciones permitidas. Estados terminales tienen lista vacía.
const TRANSICIONES_PERMITIDAS = Object.freeze({
  solicitud:  ['borrador', 'rechazado'],
  borrador:   ['enviado', 'rechazado'],
  enviado:    ['aprobado', 'rechazado'],
  aprobado:   ['convertido'],
  rechazado:  [],
  convertido: [],
});

// Tipos de servicio expuestos en el formulario público de cotización.
// Coinciden con las opciones del select en main.html.
const TIPO_SERVICIO = Object.freeze({
  GAS:          'Gas LP / Natural',
  PLOMERIA:     'Plomería',
  ELECTRICIDAD: 'Electricidad',
  PINTURA:      'Pintura',
  SOLDADURA:    'Soldadura',
  OTRO:         'Otro',
});

// Origen del presupuesto: creado en panel admin o llegó desde el formulario público.
const FUENTE_PRESUPUESTO = Object.freeze({
  ADMIN:              'admin',
  FORMULARIO_PUBLICO: 'formulario_publico',
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
  TIPO_SERVICIO,
  FUENTE_PRESUPUESTO,
  NOTA_FINAL_DEFAULT,
  PREFIJO_NUMERO,
  PAD_NUMERO,
  formatNumeroPresupuesto,
};
