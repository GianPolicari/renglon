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
    const good = res.rows.length === e.rows && c.state === 'ok' && Math.abs(c.opening - e.opening) < 0.011 && Math.abs(c.closing - e.closing) < 0.011;
    if (!good) fails++;
    console.log(`${good ? 'ok  ' : 'FAIL'} ${k.padEnd(18)} ${res.rows.length}/${e.rows} rows, check ${c.state}`);
  }
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
