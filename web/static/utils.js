function utcStrToDate(s) {
  if (!s) return null;
  const clean = String(s).substring(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(clean)) return null;
  const d = new Date(clean.replace(' ', 'T') + ':00Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function zeroPad(n) {
  return String(n).padStart(2, '0');
}

function fmtDt(s) {
  const d = utcStrToDate(s);
  if (!d) return s ? String(s) : '';
  return `${zeroPad(d.getDate())}/${zeroPad(d.getMonth() + 1)}/${d.getFullYear()} ${zeroPad(d.getHours())}:${zeroPad(d.getMinutes())}`;
}

function fmtDtShort(s) {
  const d = utcStrToDate(s);
  if (!d) return s ? String(s) : '';
  return `${zeroPad(d.getDate())}/${zeroPad(d.getMonth() + 1)} ${zeroPad(d.getHours())}:${zeroPad(d.getMinutes())}`;
}

if (typeof module !== 'undefined') module.exports = { fmtDt, fmtDtShort };
