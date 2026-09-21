/* Kern-Logik des Rechnungs-Extraktors.
   Environment-unabhängig: nimmt PDF-Textitems oder Textzeilen, gibt Felder/Tabellen zurück.
   Wird identisch im Browser (site/tool/index.html) und im Node-Test (pipeline/test_extract.mjs) benutzt. */

export const NUMC = '(?:-?\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})?|-?\\d+(?:,\\d{1,2})?)';
export const NUM = '(' + NUMC + ')';

export const toNum = (s) => (s == null || s === '' ? null : parseFloat(String(s).replace(/\./g, '').replace(',', '.')));

const WORDS = {
  total: '(?:gesamt(?:betrag)?|rechnungsbetrag|endbetrag|bruttobetrag|brutto|zu\\s*zahlen(?:der\\s*Betrag)?)',
  net: '(?:netto(?:betrag|summe)?|zwischensumme|warenwert)',
  vat: '(?:\\bust\\.?|umsatzsteuer|\\bmwst\\.?|mehrwertsteuer)',
  invNo: '(?:rechnungs?\\s*(?:nr|nummer)|re\\.?-?nr\\.?|beleg(?:nr|nummer)|invoice\\s*(?:no|number))'
};

export function firstMatch(lines, re, gi = 1) {
  for (const l of lines) {
    const m = l.match(re);
    if (m) return m[gi];
  }
  return null;
}

/* Erster Betrag nach einem Schlüsselwort — Prozentangaben ("USt 20%") werden übersprungen,
   der eigentliche Betrag direkt danach ("USt 20%: 305,60") wird weiterhin gefunden. */
export function findAmount(lines, wordSrc, { allowPercent = false } = {}) {
  const re = new RegExp(wordSrc + '\\D{0,24}?(' + NUMC + ')', 'gi');
  const afterPercent = new RegExp('^\\s*[:.]?\\s*(' + NUMC + ')');
  for (const l of lines) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(l)) !== null) {
      const rest = l.slice(m.index + m[0].length);
      if (!allowPercent && /^\s*%/.test(rest)) {
        const next = rest.replace(/^\s*%\s*/, '').match(afterPercent);
        if (next) return next[1];
        re.lastIndex = m.index + m[0].length;
        continue;
      }
      return m[1];
    }
  }
  return null;
}

/* Steuersatz: erkennt "USt 20%", "20% USt", "MwSt. 19 %" */
export function findVatRate(lines) {
  for (const l of lines) {
    const a = l.match(new RegExp(WORDS.vat + '\\D{0,8}?(\\d{1,2})\\s*%', 'i'));
    if (a) return a[1];
    const b = l.match(/(\d{1,2})\s*%\s*(?:ust|mwst|umsatzsteuer|mehrwertsteuer)/i);
    if (b) return b[1];
  }
  return null;
}

/* Textitems (pdf.js) → Textzeilen, gruppiert nach y-Position, sortiert nach x. */
export function bucketItems(items, round = 3) {
  const buckets = new Map();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5] / round) * round;
    if (!buckets.has(y)) buckets.set(y, []);
    buckets.get(y).push({ x: it.transform[4], s: it.str });
  }
  const lines = [];
  [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .forEach(([, arr]) => {
      const text = arr.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
      if (text) lines.push(text);
    });
  return lines;
}

export function guessVendor(fileName, lines) {
  const skip = /^(rechnung|invoice|seite|page|datum|kunden?|rechnungs|ust|mwst|gesamt|netto|zwischensumme|iban|bic|bank|tel|fax|mail|www|uid|fn\b|beleg|nr\.?|pos\.?|leistung|artikel|kunde)/i;
  const cands = [];
  for (const l of lines.slice(0, 24)) {
    if (skip.test(l) || l.length < 3 || l.length > 60) continue;
    if (/^\d/.test(l)) continue;
    if (!/[A-Za-zÄÖÜäöü]{3,}/.test(l)) continue;
    if (/@|www\.|https?:/i.test(l)) continue;
    const score =
      (/gmbh|kg\b|ag\b|e\.?u\.?|og\b|gesmbh|betrieb|werke?|shop|handel|service|technik|bau|elektro|installat/i.test(l) ? 3 : 0) +
      (l === l.toUpperCase() ? 1 : 0) +
      Math.min(2, l.split(/\s+/).length - 1);
    cands.push({ l: l.trim(), score });
  }
  cands.sort((a, b) => b.score - a.score);
  if (cands[0] && cands[0].l.length > 2) return cands[0].l;
  return String(fileName || '').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 40);
}

export function extractSummary(fileName, lines) {
  const invNo = firstMatch(lines, new RegExp(WORDS.invNo + '\\s*[:.]{0,3}\\s*([A-Z0-9][A-Z0-9\\-/._]{2,})', 'i'), 1);
  const date = firstMatch(lines, /(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})/);
  const rate = findVatRate(lines);
  let g = toNum(findAmount(lines, WORDS.total));
  let n = toNum(findAmount(lines, WORDS.net));
  let v = toNum(findAmount(lines, WORDS.vat));
  if (g == null) g = toNum(firstMatch(lines, new RegExp(NUMC + '\\s*(?:€|EUR)', 'i')));
  if (g == null && n != null && v != null) g = +(n + v).toFixed(2);
  if (v == null && g != null && n != null) v = +(g - n).toFixed(2);
  if (n == null && g != null) {
    const r = rate ? parseInt(rate, 10) : 20;
    n = +(g / (1 + r / 100)).toFixed(2);
    v = +(g - n).toFixed(2);
  }
  return {
    Datei: fileName,
    Lieferant: guessVendor(fileName, lines),
    Rechnungsnummer: invNo || '',
    Datum: date || '',
    'Netto (€)': n == null ? '' : n,
    'USt (€)': v == null ? '' : v,
    'Brutto (€)': g == null ? '' : g,
    'USt-Satz (%)': rate || '',
    IBAN: (firstMatch(lines, /\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}\s?[A-Z0-9]{0,4})\b/) || '').replace(/\s/g, ''),
    KdNr: firstMatch(lines, /(?:kunden?-?\s*(?:nr|nummer)|kundennummer)\s*[:.]{0,2}\s*([A-Z0-9\-/]{3,})/i) || '',
    Fällig: firstMatch(lines, /(?:zahlbar|fällig|faellig|zahlungsziel)\D{0,20}?(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i) || ''
  };
}

/* Positionszeilen: Zahlenlauf am Zeilenende bestimmen (Menge | Einzel | Gesamt).
   Maßangaben wie "5x2,5" oder "400W" zählen nicht als Zahl. */
export function extractItems(lines) {
  const tokenIsNum = (t) => new RegExp('^' + NUMC + '$').test(t);
  const out = [];
  for (const l of lines) {
    const tokens = l.split(/\s+/);
    let end = tokens.length;
    while (end > 0 && tokenIsNum(tokens[end - 1])) end--;
    const count = tokens.length - end;
    if (count === 0) continue;
    let label = tokens.slice(0, end).join(' ').trim();
    if (!label || !/[A-Za-zÄÖÜäöü]{3,}/.test(label)) continue;
    // Feldzeilen und Tabellenköpfe ausschließen
    if (/[:#]/.test(label)) continue;
    if (/^(pos\.?|pos\s*nr|bezeichnung|menge|einzel|anzahl|preis|summe|ges(?:amt)?|total|iban|bic|uid|fn|tel|fax|mail|www|kunde|bestell)/i.test(label)) continue;
    if (/^(summe|gesamt|netto|ust|mwst|zwischensumme|total|warenwert|endbetrag|rechnungsbetrag)/i.test(label)) continue;
    // Positionsnummer am Zeilenanfang (sonst nur akzeptieren, wenn >= 2 Zahlen folgen)
    const startsWithPosNo = /^\d{1,3}\s+\S/.test(label);
    if (!startsWithPosNo && count < 2) continue;
    const lead = label.match(/^(\d{1,3})\s*(.*)$/);
    const posNo = lead ? lead[1] : '';
    if (lead) label = lead[2].trim();
    if (!label) continue;
    const nums = tokens.slice(end).map(toNum);
    let qty = null, unit = null, total = null;
    if (count >= 3) [qty, unit, total] = nums.slice(-3);
    else if (count === 2) [qty, unit, total] = [null, nums[0], nums[1]];
    else [qty, unit, total] = [null, null, nums[0]];
    const gesamt = qty != null && unit != null ? +(qty * unit).toFixed(2) : total;
    out.push({
      Pos: posNo,
      Position: label,
      Menge: qty == null ? '' : qty,
      'Einzel (€)': unit == null ? '' : unit,
      'Gesamt (€)': Number.isFinite(gesamt) ? gesamt : (total ?? '')
    });
  }
  return out;
}

export function toCSV(headers, data) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const num = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
  const head = headers.map(esc).join(';');
  return '\uFEFF' + [head].concat(data.map((r) => headers.map((h) => esc(num(r[h]))).join(';'))).join('\r\n');
}

export const SUMMARY_HEADERS = ['Datei', 'Lieferant', 'Rechnungsnummer', 'Datum', 'Netto (€)', 'USt (€)', 'Brutto (€)', 'USt-Satz (%)', 'IBAN', 'KdNr', 'Fällig'];
export const ITEM_HEADERS = ['Pos', 'Position', 'Menge', 'Einzel (€)', 'Gesamt (€)'];

export function summarizeAll(files) {
  const rows = files.map((f) => extractSummary(f.name, f.lines));
  if (rows.length > 1) {
    const sum = (k) => +rows.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] : 0), 0).toFixed(2);
    rows.push({
      Datei: `Summe (${rows.length} Rechnungen)`, Lieferant: '', Rechnungsnummer: '', Datum: '',
      'Netto (€)': sum('Netto (€)'), 'USt (€)': sum('USt (€)'), 'Brutto (€)': sum('Brutto (€)'),
      'USt-Satz (%)': '', IBAN: '', KdNr: '', Fällig: '', __sum: true
    });
  }
  return rows;
}
