// Formatters compartidos. Misma lógica que el frontend para coherencia visual.

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

module.exports = { fmtFecha, fmtMoney };
