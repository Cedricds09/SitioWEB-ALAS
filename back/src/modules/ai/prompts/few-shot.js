// back/src/modules/ai/prompts/few-shot.js
// Real PDF examples converted to the JSON output format the model must emit.
// These teach Claude Adán's exact style, vocabulary, and structure.

const FEW_SHOT_EXAMPLES = [
  // ============================================================
  // EXAMPLE 1 — Gas LP maintenance, multi-departamento building
  // Real PDF: Bretaña #80-10 Col. Zacahuitzco — Dec 3 2024
  // ============================================================
  {
    user_input: {
      modo: "generar_inicial",
      cliente_nombre: "Administración Bretaña 80",
      cliente_direccion: "Bretaña #80-10 Col. Zacahuitzco, CDMX",
      tipo_servicio: "gas",
      descripcion_inicial: "El edificio de 20 departamentos requiere mantenimiento general de gas LP. Hay 5 reguladores en azotea (1 manómetro 04 kg CMS, 1 regulador 1757 CMS de alta presión, 4 reguladores de baja presión segunda etapa marca CMS). En interiores se identificaron llaves de paso no aptas para gas, mangueras vencidas, falta tapones en disparos no usados, y mantenimiento atrasado en calentadores. Algunos departamentos no estaban habitados o no se encontraban al momento de revisión."
    },
    assistant_output: {
      modo: "generar_inicial",
      tipo_servicio_detectado: "gas",
      bloques: [
        {
          tipo: "texto",
          titulo: null,
          contenido_texto: "Con el gusto de poder servirle, a continuación se presenta el siguiente resumen y cotización, en sugerencia y recomendación de reemplazar diversos accesorios de alimentación en gas \"LP\" en reguladores de tipo alta y baja presión, así como también en interiores de departamentos."
        },
        {
          tipo: "texto",
          titulo: null,
          contenido_texto: "Se describe que, en la zona de azotea, se sitúan 5 reguladores y aditamentos:"
        },
        {
          tipo: "lista_vinetas",
          titulo: null,
          vinetas: [
            "1 manómetro 04 Kg CMS",
            "1 regulador \"1757\" CMS de alta presión",
            "4 reguladores de baja presión segunda etapa, marca \"CMS\""
          ]
        },
        {
          tipo: "texto",
          titulo: null,
          contenido_texto: "En el caso de los reguladores en baja presión, la recomendación es cambiarlos de posición, de horizontal a vertical, debido a que se evitará salpicaduras y entrada de agua por la ventilación (Venteo) del mismo."
        },
        {
          tipo: "texto",
          titulo: "Nota aclaratoria",
          contenido_texto: "Los reguladores ya vienen regulados de fábrica. Esto se menciona ya que, en el caso de que algún departamento o condómino solicite probar la salida de presión, tendrá un costo extra, debido a que este es un servicio adicional y no viene contabilizado. Al ser nuevos, los reguladores emiten la presión necesaria (0.8 mts³ x hr) para los dispositivos que ocupen gas LP, como calentadores, estufas y centros de lavado, sin cambio o alteración alguna."
        },
        {
          tipo: "texto",
          titulo: "Especificaciones",
          contenido_texto: "Entrando a detalle con relación a los departamentos, con puntualización en accesorios, tales como llave de paso de gas de cierre rápido, mangueras y tapones, se sugiere realizar el cambio de estos, ya que algunos elementos ya cumplieron con su vida útil, lo que muchas veces genera fugas o inclusive accidentes. Los departamentos cuentan con 3 disparos (tuberías) de gas para los dispositivos a usar, como calentadores, secadoras y estufas. Es importante aclarar que muchos de estos no contienen 3 dispositivos y solo ocupan 2 disparos. Es aquí donde también se sugiere instalar tapones cónicos, ya que actualmente se tienen llaves de paso de gas y su uso como \"tapón\" no es tan seguro; al instalar tapones se elimina ese riesgo. En el caso de las llaves de paso, se identificó que son de uso diferente al contexto de gas (su uso recae en conducción hidráulica). El cambio sugerido eliminará el factor de riesgo, sustituyéndolas por llave de paso de gas marca IUSA, tipo ESFERA soldable 13mm (1/2)."
        },
        {
          tipo: "texto",
          titulo: "Extras",
          contenido_texto: "En cuanto a la limpieza de calentadores en cada departamento, con marcas como Bosh, Calorex u otros, si al revisarlos se detectara un componente dañado, se notificará para su reemplazo directamente con el servicio técnico según sea la marca, con la finalidad de reemplazarlo con piezas totalmente originales. Adicionalmente, en la mayoría de los calentadores se detectó falta de mantenimiento (limpieza), lo cual llega a desarrollar una mala quema de gas, originando dióxido de carbono, lo que a su vez genera un riesgo alto para la salud. Se sugiere que una vez al año se realice limpieza a los mismos y revisiones periódicas, con el fin de evitar accidentes."
        },
        {
          tipo: "garantias",
          titulo: "Garantía",
          garantias: [
            "La garantía de los reguladores es de 2 años a partir de su instalación.",
            "La garantía en mangueras, dicho por el fabricante, es de 10 años."
          ]
        },
        {
          tipo: "seccion_items",
          titulo: "Reguladores (azotea)",
          items: [
            { descripcion: "Regulador lobo CMS, segunda etapa, con válvula de esfera IUSA (4 unidades)", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Regulador 1757 AP con manómetro 04 Kg (1 unidad)", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Cambio de posición de los cuatro reguladores (horizontal a vertical)", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Cambio de llave de paso de gas de los cuatro reguladores", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Fijar tubería de media de gas", cantidad: null, precio_unitario: null, es_opcional: false }
          ]
        },
        {
          tipo: "seccion_items",
          titulo: "Departamentos (servicios típicos)",
          items: [
            { descripcion: "Cambio de manguera de gas para estufa", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Cambio de llave de paso de gas para estufa (marca IUSA, esfera soldable 13mm)", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Cambio de manguera de gas para calentador", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Mantenimiento (limpieza) de calentador", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Tapón cónico para llave de paso de gas", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Cambio de manguera para centro de lavado", cantidad: null, precio_unitario: null, es_opcional: false },
            { descripcion: "Mantenimiento preventivo a secadora de centro de lavado", cantidad: null, precio_unitario: null, es_opcional: true },
            { descripcion: "Fijar tuberías de PVC del calentador", cantidad: null, precio_unitario: null, es_opcional: true },
            { descripcion: "Corregir fuga de agua", cantidad: null, precio_unitario: null, es_opcional: true }
          ]
        }
      ],
      mejoras: [],
      items_nuevos: [],
      notas_al_admin: "El edificio tiene 20 departamentos. La cotización original desglosaba por departamento individual; aquí se generó una plantilla de servicios típicos para que el admin replique según el caso real de cada uno. Departamentos no habitados o ausentes el día de revisión deben anotarse al cliente como pendientes."
    }
  },

  // ============================================================
  // EXAMPLE 2 — Single fixed-price installation
  // Real PDF: Nicolas San Juan #304 Col. Narvarte — April 12 2026
  // ============================================================
  {
    user_input: {
      modo: "generar_inicial",
      cliente_nombre: "Administración Nicolas San Juan 304",
      cliente_direccion: "Nicolas San Juan #304, Col. Narvarte Poniente, Del. Benito Juárez, CDMX",
      tipo_servicio: "mantenimiento_integral",
      descripcion_inicial: "Se requiere instalación de aproximadamente 15 metros de tubo verde pesado eléctrico Condiut de 3 pulgadas para conducción de cable coaxial o fibra óptica, desde la parte alta del portón (lado norte-sur) hasta el destino. Incluye perforación circular de 3 pulgadas en portón, instalación de Mufa, 2 cajas cuadradas galvanizadas de 2 pulgadas, soportes tipo escuadra, soporte tipo pera, y conexiones (codos, coples, omegas). Trabajo en un solo paquete."
    },
    assistant_output: {
      modo: "generar_inicial",
      tipo_servicio_detectado: "mantenimiento_integral",
      bloques: [
        {
          tipo: "texto",
          titulo: "Presupuesto",
          contenido_texto: "A continuación se detallan los elementos a elaborar y procesos a realizar para la instalación de la conductividad de las instalaciones de cobre y fibra óptica."
        },
        {
          tipo: "lista_vinetas",
          titulo: null,
          vinetas: [
            "Instalación para conducción de cable coaxial con tubo verde pesado eléctrico \"Condiut\" o fibra óptica, aproximadamente 15 metros.",
            "Perforación circular a 3 pulgadas en parte alta de portón ubicado del lado norte a sur en Nicolas San Juan.",
            "Preparación e instalación de \"Mufa\" en parte alta de portón ubicado del lado norte a sur en Nicolas San Juan.",
            "Instalación de 2 cajas cuadradas galvanizadas de 2 pulgadas para mismo trazo de instalación de tubería.",
            "Fabricación de soportes tipo escuadras para soportería de la misma instalación.",
            "Soporte tipo pera para soportería de la instalación misma.",
            "Conexiones tipo codos, coples, omegas, etc., para misma instalación."
          ]
        },
        {
          tipo: "texto",
          titulo: "Nota aclaratoria",
          contenido_texto: "En esta instalación está contemplado el diámetro del tubo en 3 pulgadas, equivalente a 76 milímetros en medida estándar en todo el rango de la instalación. En caso de requerir una línea de tubo adicional, se notifica que esta tendrá un costo extra, tomando en cuenta que ya existirán los soportes para su instalación de ser requerida. En caso de existir detalle o elemento adicional a lo establecido aquí, se notificará para su correcta aprobación y desarrollo con su respectivo costo."
        },
        {
          tipo: "apartado_cerrado",
          titulo: "Instalación completa (sin adicionales)",
          contenido_texto: "Incluye los 15 metros de tubo Condiut de 3 pulgadas, perforación de portón, instalación de Mufa, 2 cajas cuadradas galvanizadas de 2 pulgadas, soportes tipo escuadra, soporte tipo pera, conexiones (codos, coples, omegas), así como materiales y mano de obra.",
          subtotal: null
        }
      ],
      mejoras: [],
      items_nuevos: [],
      notas_al_admin: "Trabajo presentado como paquete cerrado (apartado_cerrado) en lugar de items individuales, siguiendo el formato del cliente original. Si Adán prefiere desglose por componente, considerar convertir a seccion_items."
    }
  }
];

module.exports = { FEW_SHOT_EXAMPLES };
