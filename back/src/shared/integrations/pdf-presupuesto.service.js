// Generación del PDF de Presupuesto.
// Replica el estilo visual del PDF de Reporte Técnico (pdf-reporte.service.js):
// header navy + accent violeta, secciones con título + línea, total destacado.

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const LOGO_PATH = path.join(__dirname, '..', '..', '..', '..', 'front', 'imagenes', 'logoprincipal.png');
const LOGO_OK = fs.existsSync(LOGO_PATH);

function fmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (isNaN(d.getTime())) return String(f);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  const isWhole = Math.abs(num - Math.round(num)) < 0.005;
  return (
    '$' +
    num.toLocaleString('es-MX', {
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Escribe el PDF del presupuesto al stream `res`.
 * No setea Content-Type/Content-Disposition; eso lo hace el controller.
 *
 * @param {import('express').Response} res
 * @param {object} p - presupuesto completo (header + bloques + items).
 */
function generarPresupuestoPdf(res, p) {
  const PT = 2.83465;
  const W = 595.28,
    H = 841.89; // A4
  const M = 18 * PT;
  const HEADER_H = 32 * PT;
  const NAVY = '#0a1230';
  const NAVY_SUB = '#b4becd';
  const ACCENT = '#6a3cff';
  const TEXT = '#282828';
  const MUTED = '#828282';
  const SECTION_LINE = '#cccccc';
  const ROW_BG = '#f0f2f8';
  const ROW_BORDER = '#d2d7e1';
  const TOTAL_BG = '#f3eeff';

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(res);
  doc.font('Helvetica');

  // ===== HEADER NAVY =====
  doc.rect(0, 0, W, HEADER_H).fill(NAVY);
  if (LOGO_OK) {
    try {
      doc.image(LOGO_PATH, M, 6 * PT, { fit: [20 * PT, 20 * PT] });
    } catch {
      // ignora
    }
  } else {
    doc.lineWidth(0.5).strokeColor('#fff').rect(M, 8 * PT, 16 * PT, 16 * PT).stroke();
    doc
      .fontSize(7)
      .fillColor('#c8d2e6')
      .text('LOGO', M, 14 * PT, { width: 16 * PT, align: 'center' });
  }
  const txtX = M + 22 * PT;
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor('#fff')
    .text('Servicios Integrales ALAS', txtX, 12 * PT);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(NAVY_SUB)
    .text('Mantenimiento Habitacional', txtX, 19 * PT)
    .text('Ciudad de México  ·  Tel. +52 55 3167 5824', txtX, 24 * PT);

  // Bloque derecho: PRESUPUESTO / folio / fecha
  const folio = String(p.numero_presupuesto || `PR-${p.id}`);
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#fff')
    .text('PRESUPUESTO', 0, 10 * PT, { width: W - M, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(folio, 0, 16 * PT, { width: W - M, align: 'right' });
  doc
    .fontSize(9)
    .fillColor(NAVY_SUB)
    .text(fmtFecha(p.fecha_documento || p.fecha_creacion), 0, 22 * PT, {
      width: W - M,
      align: 'right',
    });

  let y = HEADER_H + 8 * PT;
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(10);
  doc.text(p.ciudad ? `${p.ciudad.toUpperCase()}` : 'CDMX', M, y, {
    width: W - M * 2,
    align: 'left',
  });
  y += 14 * PT;
  doc.fillColor(TEXT);

  // Helpers
  function ensureSpace(needed) {
    if (y + needed > H - 20 * PT) {
      doc.addPage();
      y = M;
    }
  }
  function section(title) {
    ensureSpace(20 * PT);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT).text(title, M, y);
    y = doc.y + 2 * PT;
    doc.lineWidth(0.2).strokeColor(SECTION_LINE).moveTo(M, y).lineTo(W - M, y).stroke();
    y += 5 * PT;
  }
  function line(label, value) {
    if (!value) return;
    ensureSpace(13 * PT);
    doc.font('Helvetica').fontSize(10).fillColor(TEXT);
    const labelWidth = 75 * PT;
    doc.font('Helvetica-Bold').text(label, M, y, { width: labelWidth, continued: false });
    doc
      .font('Helvetica')
      .text(value, M + labelWidth, y, { width: W - M * 2 - labelWidth });
    y = doc.y + 2 * PT;
  }

  // ===== Cliente =====
  section('Cliente');
  line('Nombre:', p.cliente_nombre);
  if (p.cliente_destinatario) line('Atención a:', p.cliente_destinatario);
  if (p.cliente_telefono) line('Teléfono:', p.cliente_telefono);
  if (p.cliente_direccion) line('Dirección:', p.cliente_direccion);
  if (p.tipo_servicio) line('Servicio:', p.tipo_servicio);
  y += 6 * PT;

  // ===== Introducción =====
  if (p.introduccion) {
    section('Introducción');
    doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(p.introduccion, M, y, {
      width: W - M * 2,
      align: 'justify',
    });
    y = doc.y + 8 * PT;
  }

  // ===== Bloques =====
  const bloques = Array.isArray(p.bloques) ? p.bloques : [];
  for (const b of bloques) {
    if (b.tipo === 'texto') {
      ensureSpace(20 * PT);
      doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(b.contenido_texto || '', M, y, {
        width: W - M * 2,
        align: 'justify',
      });
      y = doc.y + 8 * PT;
    } else if (b.tipo === 'lista_vinetas') {
      let arr = [];
      try { arr = JSON.parse(b.contenido_texto || '[]'); } catch { /* noop */ }
      ensureSpace(15 * PT);
      doc.font('Helvetica').fontSize(10).fillColor(TEXT);
      arr.forEach((v) => {
        ensureSpace(13 * PT);
        const bullet = '•  ';
        doc.text(bullet + String(v), M + 4 * PT, y, { width: W - M * 2 - 4 * PT });
        y = doc.y + 1 * PT;
      });
      y += 4 * PT;
    } else if (b.tipo === 'garantias') {
      let arr = [];
      try { arr = JSON.parse(b.contenido_texto || '[]'); } catch { /* noop */ }
      section('Garantías');
      doc.font('Helvetica').fontSize(10).fillColor(TEXT);
      arr.forEach((g) => {
        ensureSpace(13 * PT);
        doc.text('✓  ' + String(g), M + 4 * PT, y, { width: W - M * 2 - 4 * PT });
        y = doc.y + 1 * PT;
      });
      y += 6 * PT;
    } else if (b.tipo === 'apartado_cerrado') {
      ensureSpace(40 * PT);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(b.titulo || '', M, y);
      y = doc.y + 3 * PT;
      doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(b.contenido_texto || '', M, y, {
        width: W - M * 2 - 70 * PT,
        align: 'justify',
      });
      const descBottom = doc.y;
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(TEXT)
        .text(fmtMoney(b.subtotal), 0, y, { width: W - M, align: 'right' });
      y = Math.max(descBottom, doc.y) + 8 * PT;
    } else if (b.tipo === 'seccion_items') {
      section(b.titulo || 'Sección');

      // Header de tabla
      ensureSpace(15 * PT);
      doc.rect(M, y, W - M * 2, 9 * PT).fillAndStroke(ROW_BG, ROW_BORDER);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT);
      doc.text('DESCRIPCIÓN', M + 3 * PT, y + 2.5 * PT, { width: W - M * 2 - 130 * PT });
      doc.text('CANT.', W - M - 110 * PT, y + 2.5 * PT, { width: 30 * PT, align: 'right' });
      doc.text('P.UNIT.', W - M - 75 * PT, y + 2.5 * PT, { width: 35 * PT, align: 'right' });
      doc.text('TOTAL', W - M - 40 * PT, y + 2.5 * PT, { width: 35 * PT, align: 'right' });
      y += 9 * PT;

      const items = Array.isArray(b.items) ? b.items : [];
      doc.font('Helvetica').fontSize(9).fillColor(TEXT);
      let subSec = 0;
      for (const it of items) {
        ensureSpace(13 * PT);
        const desc = String(it.descripcion || '') + (it.es_opcional ? '  (opcional)' : '');
        const total = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
        if (!it.es_opcional) subSec += total;

        const fontStyle = it.es_opcional ? 'Helvetica-Oblique' : 'Helvetica';
        doc.font(fontStyle);
        const descH = doc.heightOfString(desc, { width: W - M * 2 - 130 * PT });
        const rowH = Math.max(11 * PT, descH + 3 * PT);

        doc.text(desc, M + 3 * PT, y + 2 * PT, { width: W - M * 2 - 130 * PT });
        doc.text(String(Number(it.cantidad) || 0), W - M - 110 * PT, y + 2 * PT, { width: 30 * PT, align: 'right' });
        doc.text(fmtMoney(it.precio_unitario), W - M - 75 * PT, y + 2 * PT, { width: 35 * PT, align: 'right' });
        doc.text(fmtMoney(total), W - M - 40 * PT, y + 2 * PT, { width: 35 * PT, align: 'right' });

        doc
          .lineWidth(0.2)
          .strokeColor('#e6e8f0')
          .moveTo(M, y + rowH)
          .lineTo(W - M, y + rowH)
          .stroke();
        y += rowH;
      }

      // Subtotal de la sección (no opcionales)
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(TEXT)
        .text(`Subtotal sección: ${fmtMoney(subSec)}`, 0, y + 4 * PT, {
          width: W - M,
          align: 'right',
        });
      y += 16 * PT;
    }
  }

  // ===== Total general destacado =====
  ensureSpace(30 * PT);
  doc.lineWidth(1).strokeColor(ACCENT).moveTo(M, y).lineTo(W - M, y).stroke();
  y += 8 * PT;
  const totalBoxH = 14 * PT;
  const totalBoxW = 110 * PT;
  doc.rect(W - M - totalBoxW, y, totalBoxW, totalBoxH).fillAndStroke(TOTAL_BG, ACCENT);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(ACCENT)
    .text('TOTAL', W - M - totalBoxW + 4 * PT, y + 4 * PT)
    .text(fmtMoney(p.total_general), 0, y + 4 * PT, {
      width: W - M - 4 * PT,
      align: 'right',
    });
  y += totalBoxH + 12 * PT;

  // ===== Términos comerciales =====
  ensureSpace(40 * PT);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  if (p.vigencia_dias) {
    doc.text(`Vigencia: ${p.vigencia_dias} día(s) a partir de la emisión.`, M, y);
    y = doc.y + 2 * PT;
  }
  if (Number(p.adelanto_porcentaje) > 0) {
    doc.text(`Para iniciar el trabajo se requiere un adelanto del ${p.adelanto_porcentaje}%.`, M, y);
    y = doc.y + 2 * PT;
  }
  y += 4 * PT;

  // ===== Nota final =====
  if (p.nota_final) {
    ensureSpace(30 * PT);
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor(MUTED)
      .text(p.nota_final, M, y, { width: W - M * 2, align: 'justify' });
    y = doc.y + 6 * PT;
  }

  // ===== Footer =====
  const footerY = H - 18 * PT;
  doc
    .lineWidth(0.5)
    .strokeColor(SECTION_LINE)
    .moveTo(M, footerY - 8 * PT)
    .lineTo(W - M, footerY - 8 * PT)
    .stroke();
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text('Mantenimiento Integral e Instalaciones · Servicios Integrales ALAS', M, footerY - 4 * PT, {
      width: W - M * 2,
      align: 'center',
    });
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, M, footerY + 2 * PT, {
    width: W - M * 2,
    align: 'center',
  });

  doc.end();
}

module.exports = { generarPresupuestoPdf };
