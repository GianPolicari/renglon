// Reads every sample statement with the same parser the site uses and compares with what the generator wrote.
const fs = require('fs'), path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const P = require('../public/resumen.js');
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'expected.json'), 'utf8'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.011;

async function pagesOf(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width })));
  }
  return pages;
}
module.exports = { pagesOf };

if (require.main === module) (async () => {
  for (const [name, exp] of Object.entries(expected)) {
    const res = P.parse(await pagesOf(path.join(__dirname, '..', 'public', 'samples', name)));
    console.log(`\n== ${name}: ${res.kind}, ${res.rows.length} rows, check ${res.check.state}, issuer ${res.issuer}`);
    ok(res.kind === exp.kind, 'kind ' + exp.kind);
    ok(res.rows.length === exp.rows, `rows ${res.rows.length} = ${exp.rows}`);
    ok(res.check.state === 'ok', 'check ok');
    ok(res.issuer === 'sample', 'issuer sample');
    ok(res.rows.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date || '')), 'every row has a full date');
    if (exp.kind === 'cuenta') {
      ok(near(res.check.opening, exp.opening), `opening ${res.check.opening}`);
      ok(near(res.check.closing, exp.closing), `closing ${res.check.closing}`);
      ok(near(res.rows.reduce((a, r) => a + (r.debit || 0), 0), exp.debits), 'debits sum');
      ok(near(res.rows.reduce((a, r) => a + (r.credit || 0), 0), exp.credits), 'credits sum');
      ok(res.rows.every(r => r.flags.length === 0), 'no flags: ' + JSON.stringify(res.rows.filter(r => r.flags.length).slice(0, 2)));
      if (name === 'sample_cuenta.pdf') ok(res.rows.some(r => /CUIT 20-12345678-9/.test(r.desc)), 'wrapped description joined');
    } else {
      ok(near(res.check.ars.closing, exp.ars.closing) && near(res.check.ars.opening, exp.ars.opening), 'pesos opening/closing');
      ok(near(res.check.usd.closing, exp.usd.closing) && near(res.check.usd.opening, exp.usd.opening), 'dollars opening/closing');
      ok(res.rows.filter(r => r.cuota).length === exp.cuotas, `installments ${res.rows.filter(r => r.cuota).length} = ${exp.cuotas}`);
      if (name === 'sample_tarjeta_consolidado.pdf') {
        ok(res.rows.some(r => r.desc === 'IVA RG 4240 21%( 20000,00)'), 'tax description kept whole');
        ok(res.rows.some(r => /^K SERVICIO\*JUEGOS USD 7,45$/.test(r.desc) && r.usd === 7.45 && r.ars == null), 'dollar amount inside the description stays text');
        ok(res.rows.some(r => r.desc === '* COMERCIO DEPORTES' && /^\d{6}$/.test(r.ref)), 'voucher number in its own column');
      }
    }
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
