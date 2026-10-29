// Funzioni condivise tra processo principale (require) e renderer (<script>, global Util).
(function (root) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  const parseYmd = (s) => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };

  // Settimana ISO 8601 (lunedì primo giorno, settimana 1 = quella con il primo giovedì).
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  }
  const weekLabel = (d) => 'W' + isoWeek(d);
  const weekOfYmd = (s) => weekLabel(parseYmd(s));

  // "1h30", "1.5h", "45min", "90" (minuti) -> minuti. Stringa vuota -> 0. Non riconosciuto -> NaN.
  function parseDur(s) {
    s = String(s || '').trim().toLowerCase().replace(',', '.');
    if (!s) return 0;
    const mh = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d{1,2})?\s*m?(?:in)?$/);
    if (mh) {
      const raw = parseFloat(mh[1]);
      if (mh[1].indexOf('.') >= 0 && !mh[2]) return Math.round(raw * 60);
      return Math.round(raw) * 60 + (mh[2] ? parseInt(mh[2], 10) : 0);
    }
    const mm = s.match(/^(\d+)\s*m(?:in)?$/);
    if (mm) return parseInt(mm[1], 10);
    const n = s.match(/^(\d+(?:\.\d+)?)$/);
    if (n) return Math.round(parseFloat(n[1]));
    return NaN;
  }
  function fmtDur(min) {
    min = Math.round(min || 0);
    if (!min) return '';
    if (min < 60) return min + 'min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m ? pad(m) : '');
  }

  const api = { pad, ymd, today, parseYmd, isoWeek, weekLabel, weekOfYmd, parseDur, fmtDur };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Util = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
