// Preview SIN modificar DB: muestra el resumen "conceptos" que se generaría
// si se convirtiera el presupuesto N a servicio. Solo lee.
// Uso: node back/scripts/preview-conversion.js <presupuesto_id>
require('../src/shared/config/env');
const { getPool } = require('../src/shared/db/pool');
const presRepo = require('../src/modules/presupuestos/presupuestos.repository');
const { TIPO_BLOQUE } = require('../src/shared/constants/presupuestos');

const TIPO_SERVICIO_LABEL = {
  plomeria: 'Plomería',
  electrica: 'Eléctrica',
  gas: 'Gas',
  pintura: 'Pintura',
  soldadura: 'Soldadura',
  mantenimiento_integral: 'Mantenimiento integral',
};

// Misma lógica que _buildConceptosDeBloques en presupuestos.service.js.
// Mantener sincronizada si la del service cambia.
function buildResumen(p) {
  const cliente = (p.cliente_nombre || '').trim();
  const tipoLabel = p.tipo_servicio
    ? (TIPO_SERVICIO_LABEL[p.tipo_servicio] || p.tipo_servicio)
    : null;
  const header = tipoLabel ? `${tipoLabel} — ${cliente}` : cliente;

  const bodyLines = [];
  for (const b of (p.bloques || [])) {
    if (b.tipo === TIPO_BLOQUE.GARANTIAS) continue;
    if (!b.titulo) continue;

    if (b.tipo === TIPO_BLOQUE.SECCION_ITEMS) {
      const items = Array.isArray(b.items) ? b.items : [];
      const top3 = items.slice(0, 3).map((it) => {
        const opc = it.es_opcional ? ' (opcional)' : '';
        const desc = (it.descripcion || '').trim();
        const descCorta = desc.length > 60 ? desc.slice(0, 57) + '...' : desc;
        return `${descCorta}${opc}`;
      });
      const more = items.length > 3 ? ` y ${items.length - 3} más` : '';
      bodyLines.push(`${b.titulo}: ${top3.join(', ')}${more}`);
    } else {
      bodyLines.push(b.titulo);
    }
  }

  const MAX_BODY = 8;
  if (bodyLines.length > MAX_BODY) bodyLines.length = MAX_BODY;

  const totalNum = Number(p.total_general) || 0;
  const totalStr = `$${totalNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return [header, ...bodyLines, `Total: ${totalStr}`].join('\n');
}

(async () => {
  const id = parseInt(process.argv[2], 10) || 6;
  await getPool();
  const p = await presRepo.buscarPorIdCompleto(id);
  if (!p) {
    console.error(`Presupuesto id=${id} no encontrado.`);
    process.exit(1);
  }
  console.log(`=== PRESUPUESTO ${p.numero_presupuesto} (${p.estado}) ===`);
  console.log(`Cliente: ${p.cliente_nombre} · Tipo: ${p.tipo_servicio || '—'} · Total: $${p.total_general}`);
  console.log(`Bloques: ${p.bloques?.length || 0}`);
  console.log('');
  console.log('=== RESUMEN QUE SE GENERARÍA ===');
  console.log(buildResumen(p));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
