// Reads the made-up statements that copy other banks' layouts (test/make_layouts.py) and checks every movement and balance.
const path = require('path');
const { pagesOf } = require('./run.js');
const P = require('../public/resumen.js');
const exp = require('./layouts/expected.json');
let fails = 0;
(async () => {
  for (const [k, e] of Object.entries(exp)) {
    const res = P.parse(await pagesOf(path.join(__dirname, 'layouts', k + '.pdf')));
    const c = res.check || {};
    const near = (a, b) => a != null && Math.abs(a - b) < 0.011;
    const good = res.rows.length === e.rows && c.state === 'ok' && (e.card
      ? res.kind === 'tarjeta' && near(c.ars.opening, e.ars.opening) && near(c.ars.closing, e.ars.closing) && (!e.usd || (near(c.usd.opening, e.usd.opening) && near(c.usd.closing, e.usd.closing)))
      : e.sections ? (c.accounts || []).length === e.sections.length && e.sections.every((x, i) => near(c.accounts[i].opening, x.opening) && near(c.accounts[i].closing, x.closing) && c.accounts[i].count === x.rows)
      : near(c.opening, e.opening) && near(c.closing, e.closing));
    if (!good) fails++;
    console.log(`${good ? 'ok  ' : 'FAIL'} ${k.padEnd(18)} ${res.rows.length}/${e.rows} rows, check ${c.state}`);
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
