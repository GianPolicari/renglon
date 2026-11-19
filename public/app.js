// Converter page: read the PDF in the browser, parse it (resumen.js), show the balance check, export xlsx/csv.
(function () {
  'use strict';
  const P = window.ResumenParser;
  const APP_VERSION = '0.1.0';
  // PDF.js (ES module) and its worker are fetched once the page is idle, so a conversion also works with the
  // network off: anyone can load the page, cut the connection and convert to see that nothing is sent.
  let pdfjsLoading = null;
  function pdfLib() {
    if (!pdfjsLoading) {
      pdfjsLoading = import('/vendor/pdfjs/pdf.min.mjs').then(m => {
        m.GlobalWorkerOptions.workerPort = new Worker('/vendor/pdfjs/pdf.worker.min.mjs', { type: 'module' });
        return m;
      }).catch(e => { pdfjsLoading = null; throw new Stop('error', 'No se pudo cargar el lector de PDF. Revisá la conexión y recargá la página.'); });
    }
    return pdfjsLoading;
  }
  const warmUp = () => { pdfLib().catch(() => {}); };
  if ('requestIdleCallback' in window) requestIdleCallback(warmUp, { timeout: 4000 }); else setTimeout(warmUp, 2000);
  const $ = s => document.querySelector(s);
  const fmt = v => v == null ? '' : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dmy = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
  const T = (type, data) => { try { window.TaxDropTelemetry && window.TaxDropTelemetry.send(type, data); } catch (e) {} };
  let result = null, baseName = 'resumen', runId = 0, fid = null, lastLayout = null, lastOutcome = null, isSample = false, lastPages = null;

  // Safety limits: a hostile or broken PDF must not freeze the browser.
  const LIMITS = { bytes: 25 * 1024 * 1024, pages: 300, textChars: 3000000, itemsPerPage: 25000, totalMs: 60000, pageMs: 8000 };
  class Stop extends Error { constructor(outcome, msg) { super(msg); this.outcome = outcome; } }
  const withTimeout = (p, ms, outcome, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Stop(outcome, msg)), ms))]);
  const isPdf = buf => String.fromCharCode.apply(null, new Uint8Array(buf, 0, Math.min(1024, buf.byteLength))).indexOf('%PDF-') !== -1;

  async function extract(buf, run) {
    const task = (await pdfLib()).getDocument({ data: buf, isEvalSupported: false, disableFontFace: true, useSystemFonts: false,
      disableAutoFetch: true, disableStream: true, stopAtErrors: false, enableXfa: false });
    task.onPassword = () => task.destroy();
    let doc;
    try { doc = await withTimeout(task.promise, 15000, 'timeout', 'Abrir el PDF tardó demasiado.'); }
    catch (e) {
      if (e && e.name === 'PasswordException') throw new Stop('password', 'Este PDF tiene contraseña. Bajá una copia sin contraseña desde el home banking, o abrilo y guardalo de nuevo como PDF.');
      throw e;
    }
    const started = performance.now();
    try {
      if (doc.numPages > LIMITS.pages) throw new Stop('too_many_pages', `Este PDF tiene ${doc.numPages} páginas. El límite es ${LIMITS.pages}.`);
      const pages = []; let chars = 0;
      for (let i = 1; i <= doc.numPages; i++) {
        if (performance.now() - started > LIMITS.totalMs) throw new Stop('timeout', 'La lectura tardó demasiado y se frenó.');
        const tc = await withTimeout(doc.getPage(i).then(pg => pg.getTextContent()), LIMITS.pageMs, 'timeout', `La página ${i} tardó demasiado y se frenó.`);
        if (tc.items.length > LIMITS.itemsPerPage) throw new Stop('too_much_text', `La página ${i} tiene una cantidad de texto fuera de lo común y no se procesó.`);
        const items = tc.items.map(it => ({ str: String(it.str || '').slice(0, 500), x: it.transform[4], y: it.transform[5], w: it.width }));
        chars += items.reduce((a, it) => a + it.str.length, 0);
        if (chars > LIMITS.textChars) throw new Stop('too_much_text', 'Este PDF tiene una cantidad de texto fuera de lo común y no se procesó.');
        pages.push(items);
        if (run === runId) $('#status').textContent = `Leyendo la página ${i} de ${doc.numPages}…`;
      }
      return pages;
    } finally { doc.destroy(); }
  }

  async function handle(buf, name) {
    const run = ++runId;
    fid = window.TaxDropTelemetry ? window.TaxDropTelemetry.newFileId() : null;
    const sizeKb = Math.round(buf.byteLength / 1024);
    T('select', { fid, size_kb: sizeKb });
    ['#results', '#warnCard', '#dlCard', '#rowsCard', '#layoutCard', '#tfb'].forEach(s => $(s).hidden = true);
    result = null; lastLayout = null;
    baseName = (name || 'resumen').replace(/\.pdf$/i, '').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'resumen';
    const t0 = performance.now();
    const fail = (outcome, msg, error) => { if (run !== runId) return; $('#status').textContent = msg; $('#status').dataset.state = 'bad'; T('convert', { fid, outcome, error: error || outcome, size_kb: sizeKb, ms: Math.round(performance.now() - t0) }); };
    if (buf.byteLength > LIMITS.bytes) return fail('too_large', `Este archivo pesa ${(buf.byteLength / 1048576).toFixed(1)} MB. El límite es 25 MB.`);
    if (!isPdf(buf)) return fail('not_pdf', 'Este archivo no es un PDF.');
    $('#status').textContent = 'Leyendo el PDF…'; $('#status').dataset.state = '';
    try {
      const pages = await extract(buf, run);
      if (run !== runId) return;
      lastPages = pages;
      if (pages.reduce((a, p) => a + p.reduce((b, i) => b + i.str.length, 0), 0) < 50) return fail('no_text', 'Este PDF no tiene texto que se pueda leer (seguramente es un escaneo o una foto). Usá el PDF original del home banking.');
      result = P.parse(pages);
      const ms = Math.round(performance.now() - t0);
      render(result, pages.length);
      const st = result.check.state;
      const outcome = !result.rows.length ? 'no_rows' : st === 'ok' ? 'ok' : st === 'mismatch' ? 'mismatch' : 'no_total';
      lastOutcome = outcome;
      lastLayout = outcome === 'ok' ? null : buildLayout(pages);
      offerLayout();
      if (outcome === 'no_rows' && !isSample) $('#layoutCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
      T('convert', { fid, outcome, error: outcome === 'ok' ? null : outcome === 'no_rows' ? (result.diagnosis || 'layout_not_recognized') : outcome, software: result.kind, broker: result.issuer,
        pages: pages.length, rows: result.rows.length, sections: 1, sections_ok: st === 'ok' ? 1 : 0, flagged: result.rows.filter(r => r.flags.length).length, ms, size_kb: sizeKb });
    } catch (e) {
      if (e instanceof Stop) return fail(e.outcome, e.message);
      console.error(e);
      fail('error', 'No se pudo leer este PDF. Puede estar dañado o tener un formato que no soportamos.', ((e && e.name) || 'unknown').replace(/[^A-Za-z0-9_]/g, '').toLowerCase().slice(0, 40) || 'unknown');
    }
  }

  const STATE = { ok: ['ok', 'Cierra'], mismatch: ['bad', 'No cierra'], 'no-total': ['warn', 'Sin saldo para controlar'] };
  // reconciliation: opening + additions - subtractions = calculated closing, against the statement's own figures.
  // lines: [op, label, value, statementFigure?] where a statement figure is shown as a "según el resumen" line.
  function card(title, sub, c, lines) {
    const [cls, txt] = STATE[c.state] || STATE['no-total'];
    const v = x => x == null ? '<span class="na">—</span>' : fmt(x);
    const differs = (a, b) => a != null && b != null && Math.abs(a - b) > 0.011;
    const body = lines.map(([op, label, val, stmt, stmtLabel]) =>
      `<tr><td class="op">${op}</td><th scope="row">${label}</th><td class="n">${v(val)}</td></tr>` +
      (stmt != null ? `<tr class="stmt sub${differs(val, stmt) ? ' off' : ''}"><td class="op"></td><th scope="row">${stmtLabel}</th><td class="n">${v(stmt)}</td></tr>` : '')).join('');
    const el = document.createElement('div'); el.className = 'box ' + cls;
    el.innerHTML = `<div class="h"><div class="t"><b>${title}</b><span>${sub}</span></div><span class="pill ${cls}">${c.state === 'ok' ? '✓ ' : ''}${txt}</span></div>
      <table class="rec"><tbody>
      <tr><td class="op"></td><th scope="row">Saldo anterior</th><td class="n">${v(c.opening)}</td></tr>
      ${body}
      <tr class="total"><td class="op">=</td><th scope="row">Saldo calculado</th><td class="n">${v(c.expected)}</td></tr>
      <tr class="stmt${differs(c.expected, c.closing) ? ' off' : ''}"><td class="op"></td><th scope="row">Saldo final según el resumen</th><td class="n">${v(c.closing)}</td></tr>
      </tbody></table>`;
    return el;
  }
  const r2 = x => Math.round(x * 100) / 100;

  function render(res, nPages) {
    const n = res.rows.length, st = res.check.state;
    $('#status').textContent = !n ? 'No se encontraron movimientos en este PDF. Puede que su formato todavía no esté soportado.'
      : `Se leyeron ${n} movimientos de ${nPages} página${nPages === 1 ? '' : 's'}. ` + (st === 'ok' ? 'Los saldos cierran.' : st === 'mismatch' ? 'Los saldos no cierran: revisá lo marcado abajo.' : 'No encontramos el saldo anterior o el final para controlar: compará con el resumen.');
    $('#status').dataset.state = !n ? 'bad' : st === 'ok' ? 'ok' : 'warn';
    const sum = $('#sum'); sum.replaceChildren();
    if (res.kind === 'cuenta') {
      const c = res.check;
      const cred = r2(res.rows.reduce((a, r) => a + (r.credit || 0), 0)), deb = r2(res.rows.reduce((a, r) => a + (r.debit || 0), 0));
      sum.appendChild(card('Cuenta', `${n} movimientos${c.breaks ? `, ${c.breaks} con el saldo cortado` : ''}`, c,
        [['+', 'Créditos', cred, c.totalCredits ? c.totalCredits.statement : null, 'Total créditos según el resumen'], ['−', 'Débitos', deb, c.totalDebits ? c.totalDebits.statement : null, 'Total débitos según el resumen']]));
    } else {
      for (const [key, title, word] of [['ars', 'Pesos', 'en pesos'], ['usd', 'Dólares', 'en dólares']]) {
        const c = res.check[key]; if (!c) continue;
        const count = res.rows.filter(r => r[key] != null).length;
        sum.appendChild(card(title, `${count} movimientos ${word}`, c, [
          ['+', 'Consumos', c.consumos, c.subtotal, 'Total consumos según el resumen'],
          ['+', 'Impuestos, cargos e intereses', c.cargos],
          ['−', 'Pagos y devoluciones', c.pagos]]));
      }
    }
    $('#results').hidden = !n;
    const q = $('#tfb'); q.hidden = isSample || !n; delete q.dataset.done;
    q.querySelector('.fbq').textContent = '¿Los saldos coinciden con tu resumen?'; q.querySelectorAll('button').forEach(b => { b.hidden = false; });

    const warns = res.warnings.slice();
    const flagged = res.rows.filter(r => r.flags.length).length;
    if (flagged) warns.push(`${flagged} movimiento${flagged === 1 ? '' : 's'} para revisar: están marcados en la tabla y en la columna "Revisar" del Excel.`);
    if (res.kind === 'cuenta' && res.check.derivedOpening) warns.push('El resumen no muestra el saldo anterior: lo calculamos con el primer movimiento.');
    const w = $('#warns'); w.replaceChildren();
    warns.forEach(x => { const li = document.createElement('li'); li.textContent = x; w.appendChild(li); });
    $('#warnCard').hidden = !warns.length || !n;
    $('#dlCard').hidden = !n; $('#rowsCard').hidden = !n;
    $('#rowCount').textContent = `(${n})`;
    renderRows();
  }

  const TYPE = { consumo: 'Consumo', cargo: 'Impuesto o cargo', pago: 'Pago o devolución' };
  const COLS = {
    cuenta: [['Fecha', r => dmy(r.date)], ['Descripción', r => r.desc], ['Referencia', r => r.ref], ['Débito', r => fmt(r.debit), 1], ['Crédito', r => fmt(r.credit), 1], ['Saldo', r => fmt(r.balance), 1], ['Pág.', r => r.page], ['Revisar', r => r.flags.join('; ')]],
    tarjeta: [['Fecha', r => dmy(r.date)], ['Descripción', r => r.desc], ['Tipo', r => TYPE[r.type] || ''], ['Comprobante', r => r.ref], ['Cuota', r => r.cuota], ['Pesos', r => fmt(r.ars), 1], ['Dólares', r => fmt(r.usd), 1], ['Pág.', r => r.page], ['Revisar', r => r.flags.join('; ')]],
  };
  function renderRows() {
    if (!result) return;
    const cols = COLS[result.kind];
    const th = $('#thead'); th.innerHTML = '<tr>' + cols.map(c => `<th${c[2] ? ' class="n"' : ''}>${c[0]}</th>`).join('') + '</tr>';
    const only = $('#onlyFlag').checked, tb = $('#tbody'); tb.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const r of result.rows) {
      if (only && !r.flags.length) continue;
      const tr = document.createElement('tr'); if (r.flags.length) tr.className = 'flag';
      for (const c of cols) { const td = document.createElement('td'); td.textContent = c[1](r) ?? ''; if (c[2]) td.className = 'n'; tr.appendChild(td); }
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
  }
  $('#onlyFlag').addEventListener('change', renderRows);

  // ---- exports ----
  function sheet() {
    const M = v => v == null ? '' : { money: v }, D = iso => iso ? { date: iso } : '';
    if (result.kind === 'cuenta') return { head: ['Fecha', 'Descripción', 'Referencia', 'Débito', 'Crédito', 'Importe', 'Saldo', 'Página', 'Revisar'], widths: [12, 48, 14, 14, 14, 14, 16, 8, 30],
      rows: result.rows.map(r => [D(r.date), r.desc, r.ref, M(r.debit), M(r.credit), M(r.amount), M(r.balance), r.page, r.flags.join('; ')]) };
    return { head: ['Fecha', 'Descripción', 'Tipo', 'Comprobante', 'Cuota', 'Pesos', 'Dólares', 'Página', 'Revisar'], widths: [12, 44, 18, 13, 8, 16, 14, 8, 30],
      rows: result.rows.map(r => [D(r.date), r.desc, TYPE[r.type] || '', r.ref, r.cuota, M(r.ars), M(r.usd), r.page, r.flags.join('; ')]) };
  }
  function download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('#dlX').addEventListener('click', () => {
    if (!result) return;
    const s = sheet();
    const out = window.TaxDropXlsx.build([s.head, ...s.rows], 'Movimientos', { header: true, widths: s.widths });
    T('download', { fid, format: 'xlsx', broker: result.issuer, software: result.kind });
    download(`${baseName}.xlsx`, new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  });
  $('#dlC').addEventListener('click', () => {
    if (!result) return;
    const s = sheet();
    // Excel in Spanish expects ";" between columns and "," as the decimal mark; text that starts like a formula is neutralised
    const cell = v => {
      if (v == null || v === '') return '';
      if (typeof v === 'object' && v.date) return dmy(v.date);
      if (typeof v === 'object' && typeof v.money === 'number') return v.money.toFixed(2).replace('.', ',');
      let t = String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const text = '﻿' + [s.head, ...s.rows].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
    T('download', { fid, format: 'csv', broker: result.issuer, software: result.kind });
    download(`${baseName}.csv`, new Blob([text], { type: 'text/csv;charset=utf-8' }));
  });

  // ---- does it match the paper statement? (not asked for the samples) ----
  document.querySelectorAll('#tfb [data-tfb]').forEach(b => b.addEventListener('click', () => {
    const q = $('#tfb'); if (q.dataset.done) return;
    T('feedback', { fid, feedback: b.dataset.tfb }); q.dataset.done = '1';
    q.querySelector('.fbq').textContent = b.dataset.tfb === 'totals_match' ? 'Gracias. Ese es el control que más importa.'
      : 'Gracias. Contanos qué no coincide (qué línea y qué importe) a gianfrancopolicari@gmail.com, o mandanos el diseño del resumen sin tus datos desde abajo.';
    q.querySelectorAll('button').forEach(x => { x.hidden = true; });
    if (b.dataset.tfb === 'totals_differ' && !lastLayout && lastPages) { lastLayout = buildLayout(lastPages); offerLayout('differ'); }
  }));

  // ---- layout of an unrecognized statement, safe to share ----
  // Heading lines keep only words from a fixed vocabulary of statement column and section labels (every other word
  // becomes T, every digit 9); other lines keep only the kind and position of each value (D date, M amount, N number, T word).
  const LAYOUT_KEYWORDS = /fecha|concepto|descripci[oó]n|detalle|movimiento|referencia|comprobante|d[eé]bito|cr[eé]dito|saldo|importe|pesos|d[oó]lares|u\$s|cuota|total|anterior|actual|final|pago|consumos|transporte/i;
  const LAYOUT_VOCAB = /^(fecha|fec|concepto|descripci[oó]n|detalle|de|del|la|el|movimientos?|referencia|ref|comprobante|nro|n[º°]|d[eé]bitos?|cr[eé]ditos?|debe|haber|saldos?|importes?|monto|pesos|d[oó]lares|u\$s|usd|\$|cuotas?|total|totales|anterior|actual|final|inicial|pago|m[ií]nimo|consumos|transacci[oó]n|operaci[oó]n|cierre|vencimiento|per[ií]odo|al|en|su)$/i;
  const layoutWord = s => { const w = s.replace(/^[(\[]+|[)\],.:;]+$/g, ''); return LAYOUT_VOCAB.test(w) ? s.replace(/\d/g, '9').slice(0, 24) : /^[\d$,.()\-–—\/]+$/.test(s) ? s.replace(/\d/g, '9').slice(0, 16) : 'T'; };
  function buildLayout(pages, anyPage) {
    const out = []; let budget = 11000;
    pages.slice(0, 12).forEach((items, pi) => {
      const lines = P.toLines(items);
      if (!anyPage && !lines.some(l => LAYOUT_KEYWORDS.test(l.text))) return;
      out.push(`--- page ${pi + 1}`);
      for (const l of lines) {
        let row = LAYOUT_KEYWORDS.test(l.text)
          ? 'H ' + l.tokens.map(t => layoutWord(t.s) + '@' + Math.round(t.x)).join(' ')
          : 'R ' + l.tokens.map(t => (/^\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?$/.test(t.s) ? 'D' : P.isAmount(t.s) ? 'M' : /^[\d,.]+$/.test(t.s) ? 'N' : /^[$\-–—*]+$/.test(t.s) ? t.s.slice(0, 2) : 'T') + '@' + Math.round(t.x)).join(' ');
        if (row.length > 400) row = row.slice(0, 400);
        budget -= row.length + 1; if (budget < 0) return;
        out.push(row);
      }
    });
    if (!out.length && !anyPage) return buildLayout(pages.slice(0, 2), true);   // no heading word anywhere: the first pages, as types only
    return out.join('\n');
  }
  function offerLayout(reason) {
    $('#layoutCard').hidden = !lastLayout || isSample;
    $('#layoutWhy').textContent = reason === 'differ' ? 'Si algo no coincide con tu resumen, podés mandarnos ' : 'Este formato no se pudo leer completo. Podés mandarnos ';
    $('#layoutPreview').textContent = lastLayout || ''; $('#layoutPreview').hidden = true;
    $('#layoutMsg').textContent = ''; $('#layoutSend').disabled = false;
  }
  $('#layoutShow').addEventListener('click', () => { const pre = $('#layoutPreview'); pre.hidden = !pre.hidden; });
  $('#layoutSend').addEventListener('click', async () => {
    if (!lastLayout) return;
    $('#layoutSend').disabled = true;
    try {
      const r = await fetch('/api/layout', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broker: result ? result.issuer : 'unknown', outcome: lastOutcome, pages: Math.min(5000, (lastLayout.match(/^--- page/gm) || []).length), version: APP_VERSION, layout: lastLayout }) });
      $('#layoutMsg').textContent = r.ok ? 'Enviado. Gracias: así se suman bancos nuevos.' : 'No se pudo enviar ahora. Probá más tarde.';
      if (!r.ok) $('#layoutSend').disabled = false;
    } catch (e) { $('#layoutMsg').textContent = 'No se pudo enviar ahora. Probá más tarde.'; $('#layoutSend').disabled = false; }
  });

  // ---- file input, drag and drop, samples ----
  const input = $('#file'), drop = $('#drop');
  const own = () => { isSample = false; $('#sampleNote').hidden = true; };
  input.addEventListener('change', async () => { const f = input.files[0]; if (f) { own(); handle(await f.arrayBuffer(), f.name); } input.value = ''; });
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', async e => { const f = e.dataTransfer.files[0]; if (f) { own(); handle(await f.arrayBuffer(), f.name); } });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });

  const SAMPLES = { cuenta: '/samples/sample_cuenta.pdf', importe: '/samples/sample_cuenta_importe.pdf', tarjeta: '/samples/sample_tarjeta.pdf' };
  async function demo(key) {
    const file = SAMPLES[key]; isSample = true;
    const a = document.createElement('a'); a.href = file; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Abrí el PDF de ejemplo';
    const n = $('#sampleNote'); n.replaceChildren('Es un resumen inventado (banco y datos de ejemplo). ', a, ' para compararlo con el resultado.'); n.hidden = false;
    const r = await fetch(file); handle(await r.arrayBuffer(), file.split('/').pop());
  }
  $('#demo1').addEventListener('click', () => demo('cuenta'));
  $('#demo2').addEventListener('click', () => demo('importe'));
  $('#demo3').addEventListener('click', () => demo('tarjeta'));
  const wanted = new URLSearchParams(location.search).get('ejemplo');
  if (Object.prototype.hasOwnProperty.call(SAMPLES, wanted)) demo(wanted);
})();
