// Generación del PDF de "Reporte técnico de servicio".
// Movido íntegramente desde routes/servicios.js (bloque GET /:id/reporte).
// El controller llama a esta función pasando el response y el servicio cargado.

const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const LOGO_PATH = path.join(__dirname, '..', '..', '..', '..', 'front', 'imagenes', 'logoprincipal.png');
const LOGO_OK = fs.existsSync(LOGO_PATH);

function fmtFecha(f) {
  if (!f) return '—';
  const d = new Date(f);
  if (isNaN(d.getTime())) return String(f);
  return d.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
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
 * Escribe el PDF del reporte técnico al stream `res`.
 * No setea Content-Type/Content-Disposition; eso lo hace el controller.
 *
 * @param {import('express').Response} res
 * @param {object} servicio - fila de dbo.servicios con todas sus columnas
 */
function generarReporteTecnico(res, s) {
  // ====================================================================
  // PDF replica el estilo visual de la nota cliente (pdf.js):
  // A4, márgenes 18mm, header navy, secciones con título + línea,
  // pero título "REPORTE TÉCNICO", folio basado en servicio,
  // y bloque destacado de RESOLUCIÓN.
  // Unidades: puntos (1pt = 1/72 inch). 1mm ≈ 2.835pt.
  // ====================================================================
  const PT = 2.83465;
  const W = 595.28,
    H = 841.89; // A4
  const M = 18 * PT; // 18mm
  const HEADER_H = 32 * PT;
  const NAVY = '#0a1230';
  const NAVY_SUB = '#b4becd';
  const ACCENT = '#6a3cff';
  const TEXT = '#282828';
  const MUTED = '#828282';
  const SECTION_LINE = '#cccccc';
  const RES_BG = '#f3eeff';
  const RES_BORDER = '#6a3cff';
  const ROW_BG = '#f0f2f8';
  const ROW_BORDER = '#d2d7e1';

  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(res);
  doc.font('Helvetica');

  // ===== HEADER NAVY (igual que nota) =====
  doc.rect(0, 0, W, HEADER_H).fill(NAVY);

  // Logo (si existe)
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

  // Bloque texto izquierdo
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

  // Bloque derecho: REPORTE / folio / fecha
  const folio = String(s.numero_nota || `SRV-${s.id}`);
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#fff')
    .text('REPORTE', 0, 10 * PT, { width: W - M, align: 'right' });
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(folio, 0, 16 * PT, { width: W - M, align: 'right' });
  doc
    .fontSize(9)
    .fillColor(NAVY_SUB)
    .text(`Servicio #${s.id}`, 0, 22 * PT, { width: W - M, align: 'right' });

  // Subtítulo bajo header
  let y = HEADER_H + 8 * PT;
  doc
    .fillColor(ACCENT)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('REPORTE TÉCNICO DE SERVICIO', M, y, { width: W - M * 2, align: 'left' });
  y += 14 * PT;

  doc.fillColor(TEXT);

  // ===== Helper sección (título + línea horizontal) =====
  function section(title) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TEXT).text(title, M, y);
    y = doc.y + 2 * PT;
    doc
      .lineWidth(0.2)
      .strokeColor(SECTION_LINE)
      .moveTo(M, y)
      .lineTo(W - M, y)
      .stroke();
    y += 5 * PT;
  }
  function line(label, value) {
    doc.font('Helvetica').fontSize(10).fillColor(TEXT);
    const labelWidth = 75 * PT;
    doc.font('Helvetica-Bold').text(label, M, y, { width: labelWidth, continued: false });
    doc
      .font('Helvetica')
      .text(value || '—', M + labelWidth, y, { width: W - M * 2 - labelWidth });
    y = doc.y + 2 * PT;
  }

  // ===== Cliente =====
  section('Cliente');
  line('Nombre:', s.nombre_cliente);
  line('N° cliente:', s.numero_cliente);
  line('Teléfono:', s.telefono);
  line('Dirección:', s.direccion);
  y += 6 * PT;

  // ===== Servicio =====
  section('Servicio');
  line('Fecha inicio:', fmtFecha(s.fecha_inicio));
  line('Fecha fin:', fmtFecha(s.fecha_fin));
  line('Técnico asignado:', s.tecnico_asignado);
  line('Atendido por:', s.atendido_por);
  line('Estado:', s.estado);
  if (s.numero_nota) line('Nota vinculada:', s.numero_nota);
  y += 6 * PT;

  // ===== Conceptos (estilo tabla, igual que nota) =====
  section('Conceptos');
  // Header tabla
  doc.rect(M, y, W - M * 2, 9 * PT).fillAndStroke(ROW_BG, ROW_BORDER);
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(TEXT)
    .text('CONCEPTO', M + 3 * PT, y + 2.5 * PT)
    .text('MONTO', 0, y + 2.5 * PT, { width: W - M - 3 * PT, align: 'right' });
  y += 9 * PT;

  const concepto = s.conceptos || '(Sin descripción)';
  const monto = fmtMoney(s.total);
  doc.font('Helvetica').fontSize(10).fillColor(TEXT);
  const conceptoH = doc.heightOfString(concepto, { width: W - M * 2 - 45 * PT });
  const rowH = Math.max(9 * PT, conceptoH + 4 * PT);
  doc.text(concepto, M + 3 * PT, y + 2 * PT, { width: W - M * 2 - 45 * PT });
  doc.text(monto, 0, y + 2 * PT, { width: W - M - 3 * PT, align: 'right' });
  doc
    .lineWidth(0.2)
    .strokeColor('#e6e8f0')
    .moveTo(M, y + rowH)
    .lineTo(W - M, y + rowH)
    .stroke();
  y += rowH + 4 * PT;

  if (s.ajuste) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1a8f4e').text('Ajuste:', M, y);
    y = doc.y + 1 * PT;
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(TEXT)
      .text(s.ajuste, M, y, {
        width: W - M * 2,
        align: 'justify',
      });
    y = doc.y + 4 * PT;
  }

  // Total destacado (mini caja navy igual que nota)
  const totalBoxW = 80 * PT,
    totalBoxH = 11 * PT;
  doc.rect(W - M - totalBoxW, y, totalBoxW, totalBoxH).fill(NAVY);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor('#fff')
    .text('TOTAL', W - M - totalBoxW + 3 * PT, y + 3 * PT)
    .text(monto, 0, y + 3 * PT, { width: W - M - 3 * PT, align: 'right' });
  y += totalBoxH + 14 * PT;

  // ===== Separador visual antes de RESOLUCIÓN =====
  doc
    .lineWidth(1)
    .strokeColor(ACCENT)
    .moveTo(M, y)
    .lineTo(W - M, y)
    .stroke();
  y += 12 * PT;

  // ===== RESOLUCIÓN (bloque destacado) =====
  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(ACCENT)
    .text('RESOLUCIÓN DEL SERVICIO', M, y);
  y = doc.y + 6 * PT;

  // Caja con fondo + barra lateral morada
  const resTxt = s.resolucion || '—';
  doc.font('Helvetica').fontSize(10).fillColor(TEXT);
  const resPadding = 8 * PT;
  const resTxtW = W - M * 2 - resPadding * 2;
  const resH = doc.heightOfString(resTxt, { width: resTxtW }) + resPadding * 2;
  doc.rect(M, y, W - M * 2, resH).fillAndStroke(RES_BG, RES_BORDER);
  doc.rect(M, y, 4 * PT, resH).fill(RES_BORDER);
  doc
    .fillColor(TEXT)
    .text(resTxt, M + resPadding + 4 * PT, y + resPadding, {
      width: resTxtW - 4 * PT,
      align: 'justify',
    });
  y = doc.y + 12 * PT;

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
    .text('Documento interno · Servicios Integrales ALAS', M, footerY - 4 * PT, {
      width: W - M * 2,
      align: 'center',
    });
  doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, M, footerY + 2 * PT, {
    width: W - M * 2,
    align: 'center',
  });

  doc.end();
}

module.exports = { generarReporteTecnico };
