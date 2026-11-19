// Reads an Argentine bank account or credit card statement (text extracted from the PDF by pdf.js)
// and returns its movements, the statement's own totals and a check of one against the other.
// Works in the browser (window.ResumenParser) and in Node (tests). No network, no eval.
(function (root) {
  'use strict';

  // ---- amounts -------------------------------------------------------------------------------
  // Argentine format 1.234.567,89; also 1234,56, -1.234,56, 1.234,56-, (1.234,56) and $ prefixes.
  // A US-format amount (1,234.56) is accepted only when it cannot be Argentine.
  const AMOUNT_RE = /^\(?[-−]?(?:\$|U\$S|US\$|USD)?\s?[-−]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}[-−]?\)?$|^\(?[-−]?(?:\$|U\$S|US\$|USD)?\s?[-−]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}[-−]?\)?$/;
  function parseAmount(s) {
    if (s == null) return null;
    let t = String(s).trim().replace(/−/g, '-').replace(/^(?:U\$S|US\$|USD|\$)\s?/, '');
    if (!t) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/^(?:U\$S|US\$|USD|\$)\s?/, '');
    if (t.endsWith('-')) { neg = !neg; t = t.slice(0, -1); }
    if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
    t = t.replace(/^(?:U\$S|US\$|USD|\$)\s?/, '');
    let v;
    if (/^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(t)) v = Number(t.replace(/\./g, '').replace(',', '.'));
    else if (/^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(t)) v = Number(t.replace(/,/g, ''));
    else return null;
    if (!isFinite(v)) return null;
    return Math.round((neg ? -v : v) * 100) / 100;
  }
  const isAmount = s => AMOUNT_RE.test(String(s).trim().replace(/−/g, '-'));
  const r2 = v => Math.round(v * 100) / 100;

  // ---- dates ---------------------------------------------------------------------------------
  const MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
  const DATE_FULL = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/;           // 05/10/2026, 5-10-26
  const DATE_MON = /^(\d{1,2})[\-\s.\/]?([A-Za-zÁÉÍÓÚáéíóú]{3})[a-z.]*[\-\s.\/]?(\d{2}|\d{4})?$/; // 05-Oct-26, 05Oct, 05-oct
  const DATE_SHORT = /^(\d{1,2})[\/\-](\d{1,2})$/;                                   // 05/10 (year from the statement)
  const fullYear = y => (y < 100 ? 2000 + y : y);
  function validDate(d, m, y) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }
  // Date at the start of a line: returns { iso | partial: {d, m}, used } where used = tokens consumed.
  const monthOf = w => { const k = String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,]$/, ''); return /^[a-z]{3,10}$/.test(k) ? MONTHS[k.slice(0, 3)] || null : null; };
  const WEEKDAY = /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo|lun|mie|jue|vie|sab|dom)[.,]?$/;
  const DATE_ISO = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/;                       // 2026-11-19
  // A date at the start of the token list. Returns { iso | partial: {d, m}, used } where used = tokens consumed.
  function readDate(tokens) {
    if (!tokens.length) return null;
    const clean = s => (s == null ? s : String(s).replace(/[,;:]$/, ''));
    // "Martes 19 de noviembre" / "Mar. 19/11": a weekday name before the date
    const w0 = String(tokens[0].s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (tokens.length > 1 && (WEEKDAY.test(w0) || (/^mar[.,]?$/.test(w0) && /^\d{1,2}/.test(tokens[1].s)))) {
      const r = readDate(tokens.slice(1));
      return r ? Object.assign(r, { used: r.used + 1 }) : null;
    }
    const a = clean(tokens[0].s), b = clean(tokens[1] && tokens[1].s), c = clean(tokens[2] && tokens[2].s);
    const d4 = clean(tokens[3] && tokens[3].s), e = clean(tokens[4] && tokens[4].s);
    let m;
    if ((m = DATE_FULL.exec(a))) { const iso = validDate(+m[1], +m[2], fullYear(+m[3])); return iso ? { iso, used: 1 } : null; }
    if ((m = DATE_ISO.exec(a))) { const iso = validDate(+m[3], +m[2], +m[1]); return iso ? { iso, used: 1 } : null; }
    if ((m = DATE_MON.exec(a)) && MONTHS[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)]) {
      const mo = MONTHS[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3)];
      if (m[3]) { const iso = validDate(+m[1], mo, fullYear(+m[3])); return iso ? { iso, used: 1 } : null; }
      return { partial: { d: +m[1], m: mo }, used: 1 };
    }
    // "19 de noviembre de 2026" / "19 de noviembre"
    if (/^\d{1,2}$/.test(a) && /^de$/i.test(b || '') && monthOf(c)) {
      const mo = monthOf(c);
      if (/^de$/i.test(d4 || '') && /^\d{4}$/.test(e || '')) { const iso = validDate(+a, mo, +e); return iso ? { iso, used: 5 } : null; }
      return { partial: { d: +a, m: mo }, used: 3 };
    }
    // "05 Oct 26", "19 nov. 2026" or "05 Oct" written as separate words
    if (/^\d{1,2}$/.test(a) && monthOf(b) && /^[A-Za-zÁÉÍÓÚáéíóú.]{3,11}$/.test(b)) {
      const mo = monthOf(b);
      if (c && /^(\d{2}|\d{4})$/.test(c)) { const iso = validDate(+a, mo, fullYear(+c)); return iso ? { iso, used: 3 } : null; }
      return { partial: { d: +a, m: mo }, used: 2 };
    }
    // "Nov 19, 2026" / "noviembre 19"
    if (monthOf(a) && /^\d{1,2}$/.test(b || '')) {
      const mo = monthOf(a);
      if (c && /^\d{4}$/.test(c)) { const iso = validDate(+b, mo, +c); return iso ? { iso, used: 3 } : null; }
      return { partial: { d: +b, m: mo }, used: 2 };
    }
    if ((m = DATE_SHORT.exec(a))) { const d = +m[1], mo = +m[2]; if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return { partial: { d, m: mo }, used: 1 }; }
    return null;
  }

  // ---- lines and words ------------------------------------------------------------------------
  // items: [{str, x, y, w}] for one page (pdf.js text items). Words keep their left and right edge.
  function toLines(items) {
    const sorted = items.filter(i => i.str && i.str.trim()).slice().sort((p, q) => q.y - p.y || p.x - q.x);
    const lines = [];
    for (const it of sorted) {
      const ln = lines.length ? lines[lines.length - 1] : null;
      if (ln && Math.abs(ln.y - it.y) <= 2.5) ln.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    for (const ln of lines) {
      ln.items.sort((p, q) => p.x - q.x);
      ln.tokens = words(ln.items);
      ln.text = ln.tokens.map(t => t.s).join(' ');
    }
    return lines;
  }
  // a bare number after an explicit sign: 35.2, 100, 56,689.95, 95.696,6 (the last separator with 1-2 digits is the decimal one)
  function signedNumber(s) {
    if (!/^\d[\d.,]*$/.test(s)) return null;
    const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    const dec = last >= 0 && s.length - last - 1 <= 2 ? s.slice(last + 1) : '';
    const int = (dec ? s.slice(0, last) : s).replace(/[.,]/g, '');
    if (!/^\d+$/.test(int) || int.length > 12) return null;
    return Number(int + '.' + (dec || '0'));
  }
  const fmtAr = v => (v < 0 ? '-' : '') + Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+\.)/g, '#').replace('.', ',').replace(/#/g, '.');
  function words(items) {
    const out = [];
    for (const it of items) {
      const str = it.str.replace(/[\u2010-\u2015\u2212]/g, '-'), cw = str.length ? (it.w || str.length * 4.5) / str.length : 4.5;   // typographic dashes and minus signs
      const re = /\S+/g; let m;
      while ((m = re.exec(str))) out.push({ s: m[0], x: it.x + m.index * cw, r: it.x + (m.index + m[0].length) * cw });
    }
    // "$" or "U$S" drawn apart from its amount, and "1.234,56" "-" drawn apart from its trailing sign
    const merged = [];
    for (let i = 0; i < out.length; i++) {
      const t = out[i], n = out[i + 1];
      if (n && /^[+\-−]$/.test(t.s) && n.x - t.r < 10) { const v = signedNumber(n.s); if (v != null) { merged.push({ s: fmtAr(t.s === '+' ? v : -v), x: t.x, r: n.r }); i++; continue; } }
      if (n && /^[-−]?(?:\$|U\$S|US\$|USD)$/.test(t.s) && isAmount(n.s) && n.x - t.r < 14) { merged.push({ s: t.s + ' ' + n.s, x: t.x, r: n.r, cur: /^[-−]?\$$/.test(t.s) ? 'ARS' : 'USD' }); i++; continue; }
      if (n && isAmount(t.s) && /^[-−]$/.test(n.s) && n.x - t.r < 6) { merged.push({ s: t.s + '-', x: t.x, r: n.r }); i++; continue; }
      merged.push(t);
    }
    return merged;
  }

  // ---- column headings ------------------------------------------------------------------------
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9$]/g, '');
  // one heading word (or two joined) -> column role
  function roleOf(w) {
    const n = norm(w);
    if (/^fecha|^fec$|^dia$/.test(n)) return 'date';
    if (/^(conceptos?|descripcion|descripciones|detalle|detalles|movimientos?|leyenda|operacion|operaciones|transaccion|transacciones|establecimiento|comercios?)$/.test(n)) return 'desc';
    if (/^(referencias?|ref|refer|comprobantes?|comprob|nrocomprobante|cupon|numero|nro|origen|codigo|cod)$/.test(n)) return 'ref';
    if (/^cuotas?$|^plan$/.test(n)) return 'cuota';
    if (/^(debitos?|debe|egresos?|retiros?|cargos?)$/.test(n)) return 'debit';
    if (/^(creditos?|haber|ingresos?|depositos?|abonos?)$/.test(n)) return 'credit';
    if (/^saldos?$/.test(n)) return 'balance';
    if (/^(importe|importes|monto|montos)$/.test(n)) return 'amount';
    if (/^(pesos|ars|\$)$/.test(n)) return 'ars';
    if (/^(dolares|usd|us\$|u\$s|dolar)$/.test(n) || /^u\$s$|^us\$$/i.test(w)) return 'usd';
    return null;
  }
  // a heading written on two lines, read as one phrase ("Caja de Ahorro / en pesos", "Cotización / del dólar")
  function roleOfPhrase(w) {
    const n = norm(w);
    if (/^(cajadeahorros?|cuentacorriente)/.test(n)) return 'amount';
    if (/^(cotizacion|tipodecambio|equivalente|pesosusados|montolocal)/.test(n)) return null;
    if (/^(importe|monto|valor)/.test(n)) return /dolar|u\$s|usd/.test(n) ? 'usd' : 'amount';
    if (/^saldo/.test(n)) return 'balance';
    return roleOf(w);
  }
  // join the heading cells of the line above to the cells they sit on (a cell: words one space apart)
  function cells(tokens) {
    const out = [];
    for (const t of tokens) {
      const c = out[out.length - 1];
      if (c && t.x - c.r < 6) { c.toks.push(t); c.r = t.r; } else out.push({ toks: [t], x: t.x, r: t.r });
    }
    return out;
  }
  function stack(cur, above) {
    const groups = cells(cur).map(c => ({ low: [c], up: [] }));
    for (const a of cells(above)) {
      const hit = groups.filter(g => g.low.some(t => t.x < a.r + 1 && t.r > a.x - 1));
      if (!hit.length) continue;
      for (const g of hit.slice(1)) { hit[0].low.push(...g.low); hit[0].up.push(...g.up); groups.splice(groups.indexOf(g), 1); }
      hit[0].up.push(a);
    }
    const byX = (p, q) => p.x - q.x, out = [];
    for (const g of groups) {
      if (!g.up.length) { for (const c of g.low) out.push(...c.toks); continue; }   // nothing above: the words as they were
      const all = [...g.up.sort(byX), ...g.low.sort(byX)];
      out.push({ s: all.map(c => c.toks.map(t => t.s).join(' ')).join(' '), x: Math.min(...all.map(c => c.x)), r: Math.max(...all.map(c => c.r)), multi: true });
    }
    return out;
  }
  const MONEY = new Set(['debit', 'credit', 'balance', 'amount', 'ars', 'usd']);
  // A heading line names a date column and at least one money column. `above`: the line right above, for headings on two lines.
  function readHeader(line, above) {
    if (line.tokens.some(t => isAmount(t.s))) return null;   // a heading has words, not amounts
    const plain = headerFrom(line.tokens);
    if (!above || Math.abs(above.y - line.y) > 14 || above.tokens.some(t => isAmount(t.s)) || readDate(above.tokens)) return plain;
    const st = headerFrom(stack(line.tokens, above.tokens));
    if (!st) return plain;
    if (!plain) return st.some(c => c.role === 'date') ? st : null;
    // the two-line reading wins when it keeps every non-money column and finds at least as many money columns
    const non = cs => cs.filter(c => !MONEY.has(c.role)).map(c => c.role).sort().join();
    const money = cs => cs.filter(c => MONEY.has(c.role)).length;
    return st.joined && non(st) === non(plain) && money(st) >= money(plain) ? st : plain;
  }
  function headerFrom(tokens) {
    const cols = [], others = [];
    let joined = false, lastTok = null, lastCol = null;
    for (const t of tokens) {
      const role = t.multi ? roleOfPhrase(t.s) : roleOf(t.s);
      if (t.multi) joined = true;
      if (!role) {
        // "Saldo en cuenta": words one space after a heading word belong to that heading
        if (lastCol && !t.multi && t.x - lastTok.r < 6) { lastCol.r = t.r; lastCol.c = (lastCol.x + lastCol.r) / 2; lastTok = t; continue; }
        others.push({ s: t.s, x: t.x, r: t.r, c: (t.x + t.r) / 2 }); lastCol = null; lastTok = t; continue;
      }
      const prev = cols.length ? cols[cols.length - 1] : null;
      lastTok = t;
      if (prev && prev.role === role && !t.multi && !prev.multi) { prev.r = t.r; prev.c = (prev.x + prev.r) / 2; lastCol = prev; continue; }         // "Saldo" "Saldos" side by side
      cols.push({ role, x: t.x, r: t.r, c: (t.x + t.r) / 2, multi: !!t.multi }); lastCol = cols[cols.length - 1];
    }
    const roles = new Set(cols.map(c => c.role));
    const money = cols.filter(c => MONEY.has(c.role)).length;
    if (!money || cols.length < 2) return null;
    if (!roles.has('date') && money < 2) return null;      // "PESOS DÓLARES" alone is a heading too
    cols.others = others; cols.joined = joined;
    // "Saldo en $" or "Débitos $" on a bank account: the "$" names the currency, not a pesos column
    if (roles.has('ars') && !roles.has('usd') && (roles.has('debit') || roles.has('credit') || roles.has('balance'))) return keep(cols.filter(c => c.role !== 'ars'));
    // "Importe" next to "Pesos"/"Dólares" headings is a group title, not a column of its own
    if (roles.has('ars') || roles.has('usd')) return keep(cols.filter(c => c.role !== 'amount'));
    return cols;
    function keep(list) { list.others = others; list.joined = joined; return list; }
  }
  // Which money column an amount belongs to: amounts are right-aligned under their heading.
  function moneyColumn(cols, tok) {
    let best = null, bd = Infinity;
    for (const c of cols) {
      if (!MONEY.has(c.role)) continue;
      if (tok.r < c.x - 25 || tok.r > c.r + 100) continue;  // not under this heading (wide columns: heading left, amount right)
      const d = Math.min(Math.abs(tok.r - c.r), Math.abs((tok.x + tok.r) / 2 - c.c));
      if (d < bd) { bd = d; best = c; }
    }
    // closer to a heading that is not a money column (e.g. "Equivalente"): it belongs there
    if (best && cols.others && cols.others.some(o => o.s.length > 3 && Math.min(Math.abs(tok.r - o.r), Math.abs((tok.x + tok.r) / 2 - o.c)) < bd - 4 && o.x > best.r)) return null;
    return best;
  }

  // ---- summary lines -------------------------------------------------------------------------
  const SUMMARY = [
    ['opening', /balance (de inicio|inicial)|saldo (anterior|inicial|al inicio)|saldo del (resumen|periodo) anterior|saldo ultimo (resumen|extracto)/],
    ['closing', /balance final|saldo (final|actual|al cierre|a la fecha|total)|saldo al\b|nuevo saldo|saldo del periodo|total a pagar|saldo de cierre/],
    ['total_debits', /total (de )?(debitos|debe|egresos)/],
    ['total_credits', /total (de )?(creditos|haber|ingresos)/],
    ['minimum', /pago minimo/],
    ['subtotal', /total (de )?consumos|subtotal/],
  ];
  function summaryKind(text) {
    const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (const [k, re] of SUMMARY) if (re.test(t)) return k;
    return null;
  }

  const CURRENCY_CODE = /^(ARS|BRL|USD|EUR|UYU|CLP|MXN|PYG|COP|PEN|BOB|GBP|CAD|AUD|JPY|CNY|CHF)$/;
  const hasLocal = cols => !!(cols && cols.others && cols.others.some(o => /^(equivalente|local)$|^pesos usados/i.test(o.s)));
  // a token that belongs to the local-currency columns: its code or its amount, right of the money column
  function takeLocal(cols, row, t) {
    if (!hasLocal(cols)) return false;
    if (CURRENCY_CODE.test(t.s) && !row.localCur) { row.localCur = t.s; return true; }
    const right = Math.max(...cols.filter(c => MONEY.has(c.role)).map(c => c.r));
    if (isAmount(t.s) && row.local == null && t.x > right) { row.local = parseAmount(t.s); return true; }
    return false;
  }
  const CUOTA_RE = /^(?:c\.?|cuota)?\s?(\d{1,2})\/(\d{1,2})$/i;

  // ---- issuer --------------------------------------------------------------------------------
  const ISSUERS = [
    ['galicia', /banco galicia|galicia/i], ['santander', /santander/i], ['nacion', /banco de la naci[oó]n|banco naci[oó]n|\bbna\b/i],
    ['provincia', /banco provincia|bancoprovincia|provincia de buenos aires/i], ['bbva', /bbva|franc[eé]s/i], ['macro', /banco macro|\bmacro\b/i],
    ['ciudad', /banco ciudad|ciudad de buenos aires/i], ['icbc', /icbc/i], ['supervielle', /supervielle/i], ['patagonia', /patagonia/i],
    ['credicoop', /credicoop/i], ['hipotecario', /hipotecario/i], ['comafi', /comafi/i], ['columbia', /banco columbia/i],
    ['brubank', /brubank/i], ['arq', /arqfinance|d[oó]larapp|\barq\b/i], ['uala', /ual[aá]/i], ['mercadopago', /mercado ?pago/i], ['naranjax', /naranja/i],
    ['amex', /american express|\bamex\b/i], ['cabal', /cabal/i], ['mastercard', /mastercard/i], ['visa', /\bvisa\b/i],
    ['sample', /banco ejemplo|ejemplo s\.a\.|resumen sint[eé]tico/i],
  ];
  function detectIssuer(pagesText) {
    const t = pagesText.slice(0, 6000);
    for (const [k, re] of ISSUERS) if (k === 'sample' && re.test(t)) return k;
    for (const [k, re] of ISSUERS) if (re.test(t)) return k;
    return 'unknown';
  }

  // ---- main ----------------------------------------------------------------------------------
  // pages: array of pdf.js text item arrays. Returns { kind, rows, summary, check, warnings, issuer }.
  // page-break carry-over lines ("Transporte", "Van", "Vienen") repeat a balance; they are not movements
  const CARRY_RE = /^(transporte|saldo transporte|a transportar|de transporte|van|vienen|saldo que pasa|saldo que viene)\b/i;
  const LEADING_DATE = /^\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\s+/;
  function dateOnly(ln) { const d = readDate(ln.tokens); return d && d.used === ln.tokens.length ? d : null; }

  function parse(pages) {
    const rows = [], warnings = [], summary = { ars: {}, usd: {} };
    let cols = null, last = null, latestIso = null, groupDate = null, refIso = null, lastSubtotalAt = -1, lastDated = null;
    const allText = [];
    const stats = { headers: 0, dateLines: 0, chars: 0, plain: 0 };   // only to say why nothing was read
    // one statement can hold several accounts (pesos, dollars, checking): each gets its own section and its own check
    const sections = [{ title: '', summary: {}, rows: 0 }];
    let sec = sections[0], lastPlain = '', headTitle = '';
    const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.011;
    function running() {
      let bal = sec.summary.opening != null ? sec.summary.opening : null;
      for (const r of rows) {
        if (r.acct !== sections.length - 1) continue;
        if (r.balance != null) bal = r.balance;
        else if (bal != null) bal = r2(bal + (r.amount != null ? r.amount : (r.credit || 0) - Math.abs(r.debit || 0)));
      }
      return bal;
    }

    pages.forEach((items, pi) => {
      const lines = toLines(items);
      allText.push(lines.map(l => l.text).join('\n'));
      let descLeft = null, descRight = null;
      for (const ln of lines) { stats.chars += ln.text.length; stats.plain += (ln.text.match(/[A-Za-z0-9ÁÉÍÓÚÑáéíóúñ .,:\/$%()*\-]/g) || []).length; }
      for (let li = 0; li < lines.length; li++) {
        const ln = lines[li];
        const h = readHeader(ln, lines[li - 1]);
        if (h) { cols = h; last = null; stats.headers++; headTitle = lastPlain; setDescBounds(); continue; }
        if (!refIso) for (let k = 0; k < ln.tokens.length; k++) { const dd = readDate(ln.tokens.slice(k)); if (dd && dd.iso) { refIso = dd.iso; break; } }
        if (!cols) {
          const sk = summaryKind(ln.text), am = ln.tokens.filter(t => isAmount(t.s));
          if ((sk === 'opening' || sk === 'closing') && am.length === 1 && summary.ars[sk] == null) summary.ars[sk] = parseAmount(am[0].s);
          if ((sk === 'opening' || sk === 'closing') && am.length === 1 && sec.summary[sk] == null) sec.summary[sk] = parseAmount(am[0].s);
          if (!sk && ln.text.length < 120) lastPlain = ln.text;
          continue;
        }
        let toks = ln.tokens;
        if (CARRY_RE.test(ln.text.replace(LEADING_DATE, ''))) continue;
        if (dateOnly(ln)) { stats.dateLines++; groupDate = dateOnly(ln); continue; }   // a date alone: for the movement beside it, or for the ones under it
        // the date may not be the first word (a code before it): take the one under the "Fecha" heading
        if (!readDate(toks)) {
          const dc = cols.find(c => c.role === 'date');
          const i = dc ? toks.findIndex(t => t.x <= dc.r + 15 && t.r >= dc.x - 15 && readDate([t])) : -1;
          if (i > 0) toks = [toks[i], ...toks.slice(0, i), ...toks.slice(i + 1)];
        }
        const amounts = toks.filter(t => isAmount(t.s));
        const kind = summaryKind(ln.text);
        const onlyBalance = !amounts.some(t => { const c = moneyColumn(cols, t); return c && c.role !== 'balance'; });
        if (kind && (!readDate(toks) || ((kind === 'opening' || kind === 'closing') && onlyBalance && cols.some(c => c.role === 'balance')))) {   // "Saldo anterior ... 12.345,67"
          for (const t of amounts) {
            const c = moneyColumn(cols, t);
            if (!c && !t.cur) continue;
            const cur = t.cur === 'USD' || (c && c.role === 'usd') ? 'usd' : 'ars';
            // several cardholders: one "Total consumos" each, and they add up
            if (kind === 'subtotal') summary[cur].subtotal = r2((summary[cur].subtotal || 0) + parseAmount(t.s));
            else if (summary[cur][kind] == null) summary[cur][kind] = parseAmount(t.s);
            // bank accounts: the balance column of opening and closing lines
            if (!c || (c.role !== 'balance' && !(kind === 'total_debits' || kind === 'total_credits'))) continue;
            const v = parseAmount(t.s);
            if (kind === 'opening') {
              // an opening balance that does not follow from what came before starts another account
              const fresh = sec.summary.opening == null && !sec.rows && sec.summary.closing == null;
              if (!fresh && (sec.rows ? !near(v, running()) : (sec.summary.closing != null || !near(v, sec.summary.opening)))) {
                sec = { title: headTitle, summary: {}, rows: 0 }; sections.push(sec);
              }
              if (sec.summary.opening == null) sec.summary.opening = v;
              if (!sec.title) sec.title = headTitle;
            } else if (kind === 'closing') {
              // the last closing line wins; one in the middle ("saldo final del día") is the balance after the movement above it
              sec.summary.closing = v;
              if (last && last.balance == null && last.acct === sections.length - 1) last.balance = v;
            } else if (sec.summary[kind] == null) sec.summary[kind] = v;
          }
          if (kind === 'subtotal') lastSubtotalAt = rows.length;
          last = null;
          continue;
        }
        let d = readDate(toks);
        if (d && d.iso && d.used === 3 && /^\d{2}$/.test(toks[0].s) && /^\d{1,2}$/.test(toks[2].s)) {
          const ry = +(latestIso || refIso || new Date().toISOString()).slice(0, 4), y = +d.iso.slice(0, 4), alt = validDate(+toks[2].s, +d.iso.slice(5, 7), fullYear(+toks[0].s));
          if (alt && Math.abs(y - ry) > 1 && Math.abs(+alt.slice(0, 4) - ry) <= 1) d = { iso: alt, used: 3 };
        }
        if (!d && lastDated && /^\d{1,2}$/.test(toks[0].s) && +toks[0].s >= 1 && +toks[0].s <= 31 && toks.length > 2) {
          const dc = cols.find(c => c.role === 'date'), t0 = toks[0];
          const inDateCol = dc ? t0.x <= dc.r + 40 && t0.r >= dc.x - 10 : t0.x < (descLeft != null ? descLeft : 0);
          const iso = inDateCol && amounts.some(t => moneyColumn(cols, t)) ? validDate(+t0.s, +lastDated.slice(5, 7), +lastDated.slice(0, 4)) : null;
          if (iso) d = { iso, used: 1 };
        }
        if (d) stats.dateLines++;
        if (d) {
          const row = { date: d.iso || null, partial: d.partial || null, desc: '', ref: '', cuota: '', debit: null, credit: null, amount: null, balance: null, ars: null, usd: null, page: pi + 1, flags: [] };
          if (d.iso && (!latestIso || d.iso > latestIso)) latestIso = d.iso;
          const text = [];
          for (const t of toks.slice(d.used)) {
            if (isAmount(t.s) && moneyColumn(cols, t)) {
              const c = moneyColumn(cols, t);
              const v = parseAmount(t.s);
              const role = t.cur === 'USD' && cols.some(k => k.role === 'usd') ? 'usd' : c.role;
              if (row[role] == null) row[role] = v; else row.flags.push('dos importes en la misma columna');
              continue;
            }
            const cm = CUOTA_RE.exec(t.s);
            if (cm && +cm[1] <= +cm[2] && +cm[2] <= 99) { row.cuota = `${cm[1].padStart(2, '0')}/${cm[2].padStart(2, '0')}`; continue; }
            // a voucher or reference number: digits, under a "Comprobante"/"Referencia" heading (some banks title the description "Referencia")
            const mid = (t.x + t.r) / 2;
            const refCol = cols.filter(c => c.role === 'ref').sort((p, q) => Math.abs(p.c - mid) - Math.abs(q.c - mid))[0];
            if (refCol && /^[\dA-Z\-]{3,}$/.test(t.s) && (/\d{5,}/.test(t.s) || (/^\d{4}$/.test(t.s) && !text.length && Math.abs(mid - refCol.c) < 25)) && Math.abs(mid - refCol.c) < 40 && !row.ref) { row.ref = t.s; continue; }
            if (takeLocal(cols, row, t)) continue;
            text.push(t.s);
          }
          row.desc = text.join(' ');
          if (row.cuota) row.desc = row.desc.replace(/\s+(?:cta|cuota|cuotas)\.?$/i, '');
          const hasMoney = ['debit', 'credit', 'amount', 'ars', 'usd'].some(k => row[k] != null);
          if (!hasMoney && row.balance == null) { last = null; continue; }   // a date line with no amount: not a movement
          row.acct = sections.length - 1; sec.rows++;
          rows.push(row); last = row; if (row.date) lastDated = row.date;
          continue;
        }
        // a line without a date: description continued on the next line, or a movement with no date of its own
        if (!amounts.some(t => moneyColumn(cols, t)) && last && ln.text.length < 120 && descLeft != null && toks[0].x >= descLeft - 30 && toks[0].x <= descRight + 30) {
          last.desc = (last.desc + ' ' + ln.text).trim();
          continue;
        }
        if (!amounts.length && ln.text.length < 120) lastPlain = ln.text;
        // the date printed on its own line, centred on a two-line movement (Santander and others)
        let nd = null;
        for (const j of [li + 1, li - 1]) { const o = lines[j]; if (o && Math.abs(o.y - ln.y) <= 10 && dateOnly(o)) { nd = dateOnly(o); break; } }
        if (!nd && groupDate && (!last || groupDate !== last.groupDate)) nd = groupDate;
        if (amounts.some(t => moneyColumn(cols, t)) && (last || nd) && toks.some(t => !isAmount(t.s)) && !kind) {
          // taxes and charges printed under the last movement without a date (common on card statements)
          const row = nd
            ? { date: nd.iso || null, partial: nd.partial || null, desc: '', ref: '', cuota: '', debit: null, credit: null, amount: null, balance: null, ars: null, usd: null, page: pi + 1, flags: [] }
            : { date: last.date, partial: last.partial, desc: '', ref: '', cuota: '', debit: null, credit: null, amount: null, balance: null, ars: null, usd: null, page: pi + 1, flags: ['sin fecha en el resumen: se usó la del movimiento anterior'] };
          if (nd && nd.iso && (!latestIso || nd.iso > latestIso)) latestIso = nd.iso;
          const text = [];
          for (const t of toks) {
            const c = isAmount(t.s) ? moneyColumn(cols, t) : null;
            if (c) { if (row[c.role] == null) row[c.role] = parseAmount(t.s); continue; }
            const mid = (t.x + t.r) / 2, refCol = cols.find(k => k.role === 'ref' && Math.abs(mid - k.c) < 40);
            if (refCol && !row.ref && /^\d{3,}$/.test(t.s)) { row.ref = t.s; continue; }
            if (takeLocal(cols, row, t)) continue;
            text.push(t.s);
          }
          row.desc = text.join(' ');
          row.acct = sections.length - 1; sec.rows++;
          rows.push(row); last = row;
        }
      }
      function setDescBounds() {
        const dc = cols.find(c => c.role === 'desc');
        const dateC = cols.find(c => c.role === 'date');
        const firstMoney = cols.filter(c => MONEY.has(c.role) || c.role === 'ref' || c.role === 'cuota').map(c => c.x).filter(x => !dateC || x > dateC.r).sort((a, b) => a - b)[0];
        descLeft = dc ? dc.x : (dateC ? dateC.r : null);
        descRight = firstMoney != null ? firstMoney : (dc ? dc.r + 200 : null);
      }
    });

    // dates printed without a year take it from the latest full date on the statement
    const ref = latestIso || refIso || null;
    for (const r of rows) {
      if (r.date || !r.partial) continue;
      if (!ref) { r.flags.push('fecha sin año'); continue; }
      const ry = +ref.slice(0, 4), rm = +ref.slice(5, 7);
      const y = r.partial.m > rm + 1 ? ry - 1 : ry;
      r.date = validDate(r.partial.d, r.partial.m, y);
    }
    for (const r of rows) delete r.partial;

    let kind = rows.some(r => r.ars != null || r.usd != null) ? 'tarjeta' : 'cuenta';
    const text6 = allText.join('\n').slice(0, 20000);
    if (kind === 'cuenta' && rows.length && !rows.some(r => r.balance != null || r.debit != null || r.credit != null)
        && (summary.ars.minimum != null || /total a pagar|pago m[ií]nimo|tarjeta de cr[eé]dito/i.test(text6))) {
      kind = 'tarjeta';
      for (const r of rows) { r.ars = r.amount; r.amount = null; }
    }
    // signed amount of every movement (credits positive, debits negative) for bank accounts
    if (kind === 'cuenta') {
      for (const r of rows) {
        if (r.amount == null && (r.debit != null || r.credit != null)) r.amount = r2((r.credit || 0) - Math.abs(r.debit || 0));
        if (r.debit != null && r.debit < 0) r.debit = Math.abs(r.debit);
        // a single signed "Importe" column: split it into debit and credit for the spreadsheet
        if (r.debit == null && r.credit == null && r.amount != null) { if (r.amount < 0) r.debit = -r.amount; else r.credit = r.amount; }
      }
    }
    // card statements: what each line is, so purchases can be checked against the statement's own "Total consumos"
    if (kind === 'tarjeta') rows.forEach((r, i) => {
      r.type = (r.ars || 0) < 0 || (r.usd || 0) < 0 ? 'pago'
        : lastSubtotalAt >= 0 ? (i < lastSubtotalAt ? 'consumo' : 'cargo')
        : (r.ref || r.cuota) ? 'consumo' : 'cargo';
    });
    // newest first (some banks print it that way): each account's movements go in date order, so balances can be followed
    sections.forEach((x, idx) => {
      const seg = rows.filter(r => r.acct === idx), d = seg.map(r => r.date).filter(Boolean);
      if (d.length < 3 || d[0] <= d[d.length - 1] || d.some((v, i) => i && v > d[i - 1])) return;
      rows.splice(rows.indexOf(seg[0]), seg.length, ...seg.reverse());
      x.reversed = true;
    });
    if (sections.some(x => x.reversed)) warnings.push('El resumen lista los movimientos del más nuevo al más viejo: acá están ordenados por fecha.');
    const used = sections.filter(x => x.rows);
    let check;
    if (kind !== 'cuenta') check = checkCard(rows, summary);
    else if (used.length <= 1) {
      const one = used[0] || sections[0];
      check = checkAccount(rows, Object.assign({}, summary.ars, one.summary));
    } else {
      // several accounts: each one is checked against its own balances
      const groups = used.map(x => rows.filter(r => r.acct === sections.indexOf(x)));
      groups.forEach((g, i) => { for (const r of g) r.acct = i + 1; });
      const parts = used.map((x, i) => {
        const mine = groups[i];
        const cur = /u\$s|us\$|usd|d[oó]lar/i.test(x.title) ? 'USD' : /\beur|euro/i.test(x.title) ? 'EUR' : 'ARS';
        return Object.assign(checkAccount(mine, x.summary), { title: x.title.replace(/\s+/g, ' ').trim().slice(0, 60), currency: cur, count: mine.length });
      });
      check = { state: parts.every(x => x.state === 'ok') ? 'ok' : parts.some(x => x.state === 'mismatch') ? 'mismatch' : 'no-total',
        breaks: parts.reduce((a, x) => a + x.breaks, 0), derivedOpening: parts.some(x => x.derivedOpening), accounts: parts };
    }
    if (!(check.accounts)) for (const r of rows) delete r.acct;
    if (!rows.length) warnings.push('No se encontraron movimientos. Puede que el formato de este resumen todavía no esté soportado.');
    // why nothing was read, as a code (never content): helps decide what to fix
    const diagnosis = rows.length ? null
      : stats.chars < 50 ? 'no_text'
      : stats.plain / stats.chars < 0.7 ? 'garbled_text'
      : !stats.headers ? 'no_header'
      : !stats.dateLines ? 'no_dates'
      : 'no_amounts_in_columns';
    return { kind, rows, summary, check, warnings, diagnosis, issuer: detectIssuer(allText.join('\n')) };
  }

  // Bank account: every running balance must follow from the one before it, and the last one must be the closing balance.
  function checkAccount(rows, s) {
    const withBal = rows.filter(r => r.balance != null);
    let opening = s.opening, derivedOpening = false;
    if (opening == null && withBal.length && withBal[0] === rows[0] && rows[0].amount != null) { opening = r2(rows[0].balance - rows[0].amount); derivedOpening = true; }
    const sum = r2(rows.reduce((a, r) => a + (r.amount || 0), 0));
    let prev = opening, breaks = 0;
    for (const r of rows) {
      if (r.amount == null) { r.flags.push('sin importe'); continue; }
      if (prev != null) prev = r2(prev + r.amount);
      if (r.balance != null) {
        if (prev != null && Math.abs(prev - r.balance) > 0.011) { r.flags.push('el saldo no coincide con el anterior más este movimiento'); breaks++; }
        prev = r.balance;
      }
    }
    const closing = s.closing != null ? s.closing : (withBal.length ? withBal[withBal.length - 1].balance : null);
    const result = { opening, closing, sum, expected: opening != null ? r2(opening + sum) : null, breaks, derivedOpening, closingFromRows: s.closing == null };
    if (opening == null || closing == null) result.state = 'no-total';
    else result.state = Math.abs(result.expected - closing) <= 0.011 && !breaks ? 'ok' : 'mismatch';
    if (s.total_debits != null) result.totalDebits = { statement: Math.abs(s.total_debits), read: r2(rows.reduce((a, r) => a + Math.abs(r.debit || 0), 0)) };
    if (s.total_credits != null) result.totalCredits = { statement: s.total_credits, read: r2(rows.reduce((a, r) => a + (r.credit || 0), 0)) };
    if (result.totalDebits && Math.abs(result.totalDebits.statement - result.totalDebits.read) > 0.011) result.state = 'mismatch';
    if (result.totalCredits && Math.abs(result.totalCredits.statement - result.totalCredits.read) > 0.011) result.state = 'mismatch';
    return result;
  }

  // Credit card: previous balance + every movement (purchases, payments, taxes) = new balance, in pesos and in dollars.
  function checkCard(rows, s) {
    const one = (cur) => {
      const key = cur === 'usd' ? 'usd' : 'ars';
      const used = rows.some(r => r[key] != null) || s[key].closing != null;
      if (!used) return null;
      const sum = r2(rows.reduce((a, r) => a + (r[key] || 0), 0));
      const opening = s[key].opening != null ? s[key].opening : null, closing = s[key].closing != null ? s[key].closing : null;
      const expected = opening != null ? r2(opening + sum) : null;
      const part = t => r2(rows.filter(r => r.type === t).reduce((a, r) => a + (r[key] || 0), 0));
      const consumos = part('consumo'), cargos = part('cargo'), pagos = r2(-part('pago'));
      const subtotal = s[key].subtotal != null ? s[key].subtotal : null;   // "Total consumos" printed on the statement
      let state = opening == null || closing == null ? 'no-total' : Math.abs(expected - closing) <= 0.011 ? 'ok' : 'mismatch';
      if (subtotal != null && Math.abs(subtotal - consumos) > 0.011 && state === 'ok') state = 'mismatch';
      return { opening, closing, sum, expected, state, consumos, cargos, pagos, subtotal };
    };
    const ars = one('ars'), usd = one('usd');
    const parts = [ars, usd].filter(Boolean);
    const state = parts.some(p => p.state === 'mismatch') ? 'mismatch' : parts.length && parts.every(p => p.state === 'ok') ? 'ok' : 'no-total';
    return { ars, usd, state };
  }

  const api = { parse, parseAmount, isAmount, readDate, toLines, readHeader, summaryKind, detectIssuer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ResumenParser = api;
})(typeof self !== 'undefined' ? self : this);
