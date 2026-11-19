// Edge worker for the bank statement converter (Renglón, renglon.com.ar).
// Shares the D1 database with Cleanbasis but uses its own tables (rs_*).
// - Static files come from public/ (assets binding). This script runs for /api/*, the home page,
//   /admin* and /robots.txt (assets.run_worker_first), to tell three hostnames apart:
//     PROD_HOSTS  the public site; counts usage. /admin does not exist here.
//     ADMIN_HOST  the usage monitor at its root.
//     any other   test copy (test.renglon.com.ar, preview URLs): same site, stores nothing, not indexed.
// - POST /api/event      anonymous usage rs_events (no IP, no file content, no amounts).
// - GET  /api/admin/*    dashboard data, requires the ADMIN_TOKEN secret.

const MAX_BODY = 2048;                 // bytes per event
const DAILY_EVENT_CAP = 50000;         // hard stop to stay far inside the D1 free tier
const TYPES = new Set(['view', 'select', 'convert', 'download', 'feedback', 'jserror']);
const OUTCOMES = new Set(['ok', 'mismatch', 'no_total', 'no_rows', 'no_text', 'error', 'password', 'too_large', 'too_many_pages', 'timeout', 'not_pdf', 'too_much_text']);
// kind of statement: bank account or credit card
const SOFTWARE = new Set(['cuenta', 'tarjeta', 'other']);
// issuer detected in the PDF (column name kept as 'broker' to share the admin panel code)
const BROKERS = new Set(['galicia', 'santander', 'nacion', 'provincia', 'bbva', 'macro', 'ciudad', 'icbc', 'supervielle', 'patagonia', 'credicoop', 'hsbc', 'bancor', 'santafe', 'hipotecario', 'comafi', 'columbia', 'brubank', 'arq', 'uala', 'mercadopago', 'naranjax', 'amex', 'visa', 'mastercard', 'cabal', 'sample', 'unknown']);
const FORMATS = new Set(['xlsx', 'csv']);
const PAGES = new Set(['/', '/admin', '/preguntas', '/privacidad', '/terminos', '/404']);
const REF_SOURCES = new Set(['direct', 'google', 'bing', 'duckduckgo', 'reddit', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'whatsapp', 'chatgpt', 'perplexity', 'email', 'other']);
const DEVICES = new Set(['desktop', 'mobile', 'tablet']);
const FEEDBACK = new Set(['totals_match', 'totals_differ']);
// columns added after the first release; created on the fly if missing
const EXTRA_COLUMNS = { sid: 'TEXT', fid: 'TEXT', ref: 'TEXT', utm: 'TEXT', device: 'TEXT', flagged: 'INTEGER', repeat_visit: 'INTEGER', feedback: 'TEXT', owner: 'INTEGER', bot: 'TEXT' };

const SCHEMA = `CREATE TABLE IF NOT EXISTS rs_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  page TEXT,
  country TEXT,
  outcome TEXT,
  error TEXT,
  software TEXT,
  broker TEXT,
  pages INTEGER,
  rows INTEGER,
  sections INTEGER,
  sections_ok INTEGER,
  ms INTEGER,
  size_kb INTEGER,
  format TEXT,
  version TEXT,
  ua TEXT
);
CREATE INDEX IF NOT EXISTS rs_events_ts ON rs_events(ts);`;

const LAYOUT_SCHEMA = `CREATE TABLE IF NOT EXISTS rs_layouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, country TEXT, broker TEXT, outcome TEXT, pages INTEGER, version TEXT, layout TEXT NOT NULL
)`;
const MAX_LAYOUT = 16384;
const DAILY_LAYOUT_CAP = 300;

const EXT_VIEW = 'CREATE VIEW rs_ext AS SELECT * FROM rs_events WHERE COALESCE(owner, 0) = 0 AND bot IS NULL';

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  const stmts = SCHEMA.split(';').map(x => x.trim()).filter(Boolean).map(x => db.prepare(x));
  await db.batch(stmts);
  const { results } = await db.prepare('PRAGMA table_info(rs_events)').all();
  const have = new Set(results.map(r => r.name));
  const add = Object.entries(EXTRA_COLUMNS).filter(([c]) => !have.has(c)).map(([c, t]) => db.prepare(`ALTER TABLE rs_events ADD COLUMN ${c} ${t}`));
  if (add.length) await db.batch(add);
  // statistics ignore the owner's own visits and automated ones; the live feed and file list still show them, labelled.
  // The view is rebuilt when its definition changes (it predates the bot column).
  const view = await db.prepare("SELECT sql FROM sqlite_master WHERE type='view' AND name='rs_ext'").first();
  if (!view || view.sql !== EXT_VIEW) await db.batch([db.prepare('DROP VIEW IF EXISTS rs_ext'), db.prepare(EXT_VIEW)]);
  await db.batch([db.prepare('CREATE INDEX IF NOT EXISTS rs_events_fid ON rs_events(fid)'), db.prepare('CREATE INDEX IF NOT EXISTS rs_events_sid ON rs_events(sid)'), db.prepare(LAYOUT_SCHEMA)]);
  schemaReady = true;
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

// _headers is not applied to responses that pass through this script, so the page policy is repeated here.
const PAGE_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS } });
}

const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max) ? v : null;
const pick = (v, set) => (typeof v === 'string' && set.has(v)) ? v : null;
const code = v => (typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v)) ? v : null;
const rid = v => (typeof v === 'string' && /^[a-z0-9]{8,16}$/.test(v)) ? v : null;

function browserFamily(ua) {
  if (!ua) return 'unknown';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  if (/bot|crawl|spider/i.test(ua)) return 'bot';
  return 'other';
}

// Why a visit looks automated, or null for a person. Only events sent by the page's own script reach here,
// so these are programs that run JavaScript: crawlers, link previewers, uptime and security scanners.
//   'auto'   the browser says it is remote-controlled (navigator.webdriver: Puppeteer, Playwright, Selenium)
//   'ua'     the User-Agent names a crawler, a headless browser or an HTTP library
//   'dc'     the connection comes from a cloud or hosting network, where people do not browse from
// Cloudflare, Akamai and Fastly are left out of 'dc' on purpose: iCloud Private Relay sends real Safari users through them.
const BOT_UA = /bot\b|bot\/|crawl|spider|slurp|scan|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|facebookexternalhit|embedly|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|scrapy|phantom|puppeteer|playwright|selenium/i;
const DATACENTER = /google|amazon|aws|microsoft|azure|digitalocean|ovh|hetzner|linode|akamai connected cloud|oracle|alibaba|tencent|huawei cloud|vultr|choopa|contabo|leaseweb|scaleway|m247|datacamp|cdn77|colocrossing|hostinger|ionos|hostroyale|psychz|quadranet|servers\.com|g-core|gcore|constant|online s\.a\.s|netcup|hostwinds|interserver|limestone|tzulo|censys|shodan|internet measurement|palo alto|stark industries|pfcloud|aeza|kamatera|ipxo|dataforseo|semrush|ahrefs/i;
function botReason(request, e) {
  if (e.wd === 1) return 'auto';
  if (BOT_UA.test(request.headers.get('User-Agent') || '')) return 'ua';
  const org = (request.cf && request.cf.asOrganization) || '';
  if (DATACENTER.test(org)) return 'dc';
  return null;
}

// constant-time comparison for the admin token
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function handleEvent(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  // same-origin only: the page itself is the only legitimate sender
  const origin = request.headers.get('Origin');
  const host = new URL(request.url).host;
  if (!origin || new URL(origin).host !== host) return json({ error: 'origin' }, 403);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({ error: 'type' }, 415);
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return json({ error: 'size' }, 413);

  // per-IP rate limit (the IP is used only here, in memory, never stored)
  if (env.EVENT_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.EVENT_LIMIT.limit({ key: ip });
    if (!success) return json({ error: 'rate' }, 429);
  }

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'size' }, 413);
  let e;
  try { e = JSON.parse(text); } catch { return json({ error: 'json' }, 400); }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return json({ error: 'shape' }, 400);
  const type = pick(e.type, TYPES);
  if (!type) return json({ error: 'event' }, 400);

  const db = env.DB;
  if (!db) return json({ ok: true, stored: false });
  // test/preview copies (other hostnames) never write to the real statistics
  const prodHosts = String(env.PROD_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean);
  if (prodHosts.length && !prodHosts.includes(host)) return json({ ok: true, stored: false, reason: 'preview' });
  await ensureSchema(db);

  const dayStart = Math.floor(Date.now() / 86400000) * 86400000;
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM rs_events WHERE ts >= ?').bind(dayStart).first();
  if (n >= DAILY_EVENT_CAP) return json({ ok: true, stored: false });

  const row = {
    ts: Date.now(),
    type,
    page: pick(e.page, PAGES) || (typeof e.page === 'string' && /^\/bancos(\/[a-z0-9-]{2,24})?$/.test(e.page) ? e.page : null),
    country: (request.cf && /^[A-Z]{2}$/.test(request.cf.country || '')) ? request.cf.country : 'XX',
    outcome: pick(e.outcome, OUTCOMES),
    error: code(e.error),
    software: pick(e.software, SOFTWARE),
    broker: pick(e.broker, BROKERS),
    pages: int(e.pages, 5000),
    rows: int(e.rows, 1000000),
    sections: int(e.sections, 20),
    sections_ok: int(e.sections_ok, 20),
    ms: int(e.ms, 600000),
    size_kb: int(e.size_kb, 1000000),
    format: pick(e.format, FORMATS),
    version: (typeof e.version === 'string' && /^[0-9a-z.\-]{1,16}$/.test(e.version)) ? e.version : null,
    ua: browserFamily(request.headers.get('User-Agent')),
    sid: rid(e.sid),
    fid: rid(e.fid),
    ref: pick(e.ref, REF_SOURCES),
    utm: code(e.utm),
    device: pick(e.device, DEVICES),
    flagged: int(e.flagged, 1000000),
    repeat_visit: e.returning === 1 ? 1 : (e.returning === 0 ? 0 : null),
    feedback: pick(e.feedback, FEEDBACK),
    owner: e.owner === 1 ? 1 : 0,
    bot: botReason(request, e),
  };
  const cols = Object.keys(row);
  await db.prepare(`INSERT INTO rs_events (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map(c => row[c])).run();
  // retention (privacy policy): about 1 request in 200 deletes rs_events and rs_layouts older than 24 months
  if (Math.random() < 0.005) {
    const cutoff = Date.now() - 730 * 86400000;
    try { await db.batch([db.prepare('DELETE FROM rs_events WHERE ts < ?').bind(cutoff), db.prepare('DELETE FROM rs_layouts WHERE ts < ?').bind(cutoff)]); } catch (err) { /* rs_layouts table may not exist yet */ }
  }
  return json({ ok: true });
}

// Layout of an unrecognized statement (headings with digits masked + value positions). See app.js buildLayout().
async function handleLayout(request, env) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const origin = request.headers.get('Origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return json({ error: 'origin' }, 403);
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({ error: 'type' }, 415);
  if (Number(request.headers.get('Content-Length') || 0) > MAX_LAYOUT + 1024) return json({ error: 'size' }, 413);
  if (env.EVENT_LIMIT) {
    const { success } = await env.EVENT_LIMIT.limit({ key: 'layout:' + (request.headers.get('CF-Connecting-IP') || 'unknown') });
    if (!success) return json({ error: 'rate' }, 429);
  }
  const text = await request.text();
  if (text.length > MAX_LAYOUT + 1024) return json({ error: 'size' }, 413);
  let e; try { e = JSON.parse(text); } catch { return json({ error: 'json' }, 400); }
  const layout = e && typeof e.layout === 'string' ? e.layout : '';
  // only the characters buildLayout() can produce; anything else is rejected outright
  if (!layout || layout.length > MAX_LAYOUT || !/^[\x20-\x7E\n–—]*$/.test(layout)) return json({ error: 'layout' }, 400);
  if (/\d{2,}/.test(layout.replace(/@\d+/g, '').replace(/--- page \d+/g, '').replace(/9+/g, ''))) return json({ error: 'digits' }, 400);
  const db = env.DB; if (!db) return json({ ok: true, stored: false });
  const prodHosts = String(env.PROD_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean);
  if (prodHosts.length && !prodHosts.includes(new URL(request.url).host)) return json({ ok: true, stored: false, reason: 'preview' });
  await ensureSchema(db);
  const dayStart = Math.floor(Date.now() / 86400000) * 86400000;
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM rs_layouts WHERE ts >= ?').bind(dayStart).first();
  if (n >= DAILY_LAYOUT_CAP) return json({ ok: true, stored: false });
  await db.prepare('INSERT INTO rs_layouts (ts, country, broker, outcome, pages, version, layout) VALUES (?,?,?,?,?,?,?)').bind(
    Date.now(), (request.cf && /^[A-Z]{2}$/.test(request.cf.country || '')) ? request.cf.country : 'XX',
    pick(e.broker, BROKERS), pick(e.outcome, OUTCOMES), int(e.pages, 5000),
    (typeof e.version === 'string' && /^[0-9a-z.\-]{1,16}$/.test(e.version)) ? e.version : null, layout).run();
  return json({ ok: true });
}

async function handleAdmin(request, env, path) {
  if (request.method !== 'GET') return json({ error: 'method' }, 405);
  if (env.ADMIN_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.ADMIN_LIMIT.limit({ key: ip });
    if (!success) return json({ error: 'rate' }, 429);
  }
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) return json({ error: 'admin_token_not_configured' }, 503);
  if (!token || !safeEqual(token, env.ADMIN_TOKEN)) return json({ error: 'unauthorized' }, 401);
  const db = env.DB;
  if (!db) return json({ error: 'no_database' }, 503);
  await ensureSchema(db);

  if (path === '/api/admin/feed') {
    const since = Number(new URL(request.url).searchParams.get('since') || 0);
    const { results } = await db.prepare('SELECT * FROM rs_events WHERE id > ? ORDER BY id DESC LIMIT 200').bind(Number.isFinite(since) ? since : 0).all();
    return json({ events: results });
  }
  if (path === '/api/admin/summary') {
    const now = Date.now();
    const q = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results;
    const day = now - 86400000, week = now - 7 * 86400000;
    const [totals] = await q(`SELECT
        SUM(type='view' AND ts>=?1) AS views_24h,
        SUM(type='convert' AND ts>=?1) AS conv_24h,
        SUM(type='convert' AND outcome='ok' AND ts>=?1) AS ok_24h,
        SUM(type='download' AND ts>=?1) AS dl_24h,
        SUM(type='view' AND ts>=?2) AS views_7d,
        SUM(type='convert' AND ts>=?2) AS conv_7d,
        SUM(type='convert' AND outcome='ok' AND ts>=?2) AS ok_7d,
        SUM(type='download' AND ts>=?2) AS dl_7d
      FROM rs_ext`, day, week);
    const countries = await q(`SELECT country, COUNT(*) AS n FROM rs_ext WHERE ts>=? GROUP BY country ORDER BY n DESC LIMIT 15`, week);
    const outcomes = await q(`SELECT outcome, COUNT(*) AS n FROM rs_ext WHERE type='convert' AND ts>=? GROUP BY outcome ORDER BY n DESC`, week);
    const errors = await q(`SELECT COALESCE(error, outcome) AS error, COUNT(*) AS n FROM rs_ext WHERE type='convert' AND outcome<>'ok' AND ts>=? GROUP BY 1 ORDER BY n DESC LIMIT 15`, week);
    const brokers = await q(`SELECT broker, COUNT(*) AS n, SUM(outcome='ok') AS ok FROM rs_ext WHERE type='convert' AND ts>=? GROUP BY broker ORDER BY n DESC`, week);
    const hourly = await q(`SELECT (ts/3600000)*3600000 AS hour, SUM(type='view') AS views, SUM(type='convert') AS conv FROM rs_ext WHERE ts>=? GROUP BY hour ORDER BY hour`, day);
    return json({ totals, countries, outcomes, errors, brokers, hourly });
  }
  if (path === '/api/admin/files') {
    const week = Date.now() - 7 * 86400000;
    const { results } = await db.prepare(`SELECT c.id, c.ts, c.country, c.broker, c.outcome, c.error, c.pages, c.rows, c.sections, c.sections_ok,
        c.flagged, c.ms, c.size_kb, c.ua, c.device, c.software, c.owner, c.bot,
        (SELECT GROUP_CONCAT(DISTINCT d.format) FROM rs_events d WHERE d.type='download' AND d.fid=c.fid AND c.fid IS NOT NULL) AS downloads,
        (SELECT f.feedback FROM rs_events f WHERE f.type='feedback' AND f.fid=c.fid AND c.fid IS NOT NULL AND f.feedback LIKE 'import%' ORDER BY f.id DESC LIMIT 1) AS feedback,
        (SELECT f.feedback FROM rs_events f WHERE f.type='feedback' AND f.fid=c.fid AND c.fid IS NOT NULL AND f.feedback LIKE 'totals%' ORDER BY f.id DESC LIMIT 1) AS totals_feedback
      FROM rs_events c WHERE c.type='convert' AND c.ts>=? ORDER BY c.id DESC LIMIT 300`).bind(week).all();
    return json({ files: results });
  }
  if (path === '/api/admin/layouts') {
    const { results } = await db.prepare('SELECT id, ts, country, broker, outcome, pages, version, layout FROM rs_layouts ORDER BY id DESC LIMIT 50').all();
    return json({ layouts: results });
  }
  if (path === '/api/admin/funnel') {
    const week = Date.now() - 7 * 86400000;
    const r = await db.prepare(`SELECT
        COUNT(DISTINCT CASE WHEN type='view' THEN sid END) AS visited,
        COUNT(DISTINCT CASE WHEN type='select' THEN sid END) AS selected,
        COUNT(DISTINCT CASE WHEN type='convert' AND outcome='ok' AND broker<>'sample' THEN sid END) AS converted,
        COUNT(DISTINCT CASE WHEN type='download' AND COALESCE(broker,'')<>'sample' THEN sid END) AS downloaded,
        COUNT(DISTINCT CASE WHEN type='feedback' AND feedback='totals_match' THEN sid END) AS imported,
        COUNT(DISTINCT CASE WHEN type='view' AND repeat_visit=1 THEN sid END) AS repeat_visits
      FROM rs_ext WHERE ts>=? AND sid IS NOT NULL`).bind(week).first();
    const refs = (await db.prepare(`SELECT COALESCE(ref,'unknown') AS ref, COUNT(DISTINCT sid) AS n FROM rs_ext WHERE type='view' AND ts>=? GROUP BY 1 ORDER BY n DESC LIMIT 12`).bind(week).all()).results;
    const devices = (await db.prepare(`SELECT COALESCE(device,'unknown') AS device, COUNT(DISTINCT sid) AS n FROM rs_ext WHERE type='view' AND ts>=? GROUP BY 1 ORDER BY n DESC`).bind(week).all()).results;
    const wants = (await db.prepare(`SELECT software, COUNT(DISTINCT sid) AS n FROM rs_ext WHERE type='notify' AND ts>=? GROUP BY software ORDER BY n DESC`).bind(Date.now() - 90 * 86400000).all()).results;
    const jserrors = (await db.prepare(`SELECT error, COUNT(*) AS n FROM rs_ext WHERE type='jserror' AND ts>=? GROUP BY error ORDER BY n DESC LIMIT 10`).bind(week).all()).results;
    return json({ funnel: r, refs, devices, jserrors, wants });
  }
  return json({ error: 'not_found' }, 404);
}

const hostList = v => String(v || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);

function withHeaders(res, extra = {}) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...PAGE_HEADERS, ...extra })) out.headers.set(k, v);
  return out;
}

async function notFound(request, env) {
  const res = await env.ASSETS.fetch(new Request(new URL('/404.html', request.url), request));
  return withHeaders(new Response(res.body, { status: 404, headers: res.headers }));
}

// Pages and robots.txt per hostname (see the header comment).
async function handlePage(request, env, url) {
  const host = url.hostname.toLowerCase();
  const admin = host === String(env.ADMIN_HOST || '').toLowerCase();
  const prod = hostList(env.PROD_HOSTS).includes(host);
  const isAdminPath = url.pathname === '/admin' || url.pathname.startsWith('/admin/');

  if (url.pathname === '/robots.txt') {
    if (prod) return withHeaders(await env.ASSETS.fetch(request));
    return withHeaders(new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  }
  if (admin) {
    const private_ = { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' };
    if (url.pathname === '/') return withHeaders(await env.ASSETS.fetch(new Request(new URL('/admin/', url), request)), private_);
    if (isAdminPath) return withHeaders(await env.ASSETS.fetch(request), private_);
    return Response.redirect(new URL('/', url), 302);
  }
  if (prod) {
    if (isAdminPath) return notFound(request, env);
    return withHeaders(await env.ASSETS.fetch(request));
  }
  // test copy: same files, a visible notice on the converter and kept out of search engines
  const res = withHeaders(await env.ASSETS.fetch(request), { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  res.headers.delete('ETag');
  return new HTMLRewriter()
    .on('head', { element: e => e.append('<meta name="robots" content="noindex,nofollow">', { html: true }) })
    .on('body', { element: e => e.prepend('<div class="envbar" role="note">Copia de prueba: lo que hagas acá no se guarda en las estadísticas.</div>', { html: true }) })
    .transform(res);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/event') return await handleEvent(request, env);
      if (url.pathname === '/api/layout') return await handleLayout(request, env);
      if (url.pathname.startsWith('/api/admin/')) return await handleAdmin(request, env, url.pathname);
      if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    } catch (err) {
      console.log('api error', err && err.message);
      return json({ error: 'server' }, 500);
    }
    if (url.pathname === '/' || url.pathname === '/robots.txt' || url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return handlePage(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
