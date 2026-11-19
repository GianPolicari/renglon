// Visibility: who reads the site (search engines and AI crawlers), where the site is mentioned, and notices to search engines.
// Tables (shared D1, rs_* prefix):
//   rs_crawl     one row per crawler request to / or /robots.txt (bot name and kind only; no IP, no other data)
//   rs_mentions  pages that mention the site, found by the daily scan
//   rs_aichecks  the owner's own notes from asking an AI assistant about the site
//   rs_config    small settings and last results (Google Alerts feed, scan status, IndexNow status)

export const SITE = 'https://renglon.com.ar';
export const INDEXNOW_KEY = 'd6767970c4afc4595e7d5b23198dec3f';   // also public/<key>.txt, as the protocol asks
const DAILY_CRAWL_CAP = 3000;
const MAX_MENTIONS_PER_SOURCE = 25;

// What each crawler is for. Matched on the User-Agent, which a scanner can fake: Cloudflare's AI Crawl Control has verified numbers.
//   search     search engine index           ai_search  index used by an AI answer engine
//   ai_user    an AI fetching the page because a person asked it to      ai_train  collects text to train models
//   archive    web archives
const CRAWLERS = [
  ['ChatGPT-User', /ChatGPT-User/i, 'ai_user'], ['OAI-SearchBot', /OAI-SearchBot/i, 'ai_search'], ['GPTBot', /GPTBot/i, 'ai_train'],
  ['Claude-User', /Claude-User/i, 'ai_user'], ['Claude-SearchBot', /Claude-SearchBot/i, 'ai_search'], ['ClaudeBot', /ClaudeBot/i, 'ai_train'],
  ['Perplexity-User', /Perplexity-User/i, 'ai_user'], ['PerplexityBot', /PerplexityBot/i, 'ai_search'],
  ['Google-CloudVertexBot', /Google-CloudVertexBot/i, 'ai_user'], ['Googlebot', /Googlebot|Google-InspectionTool/i, 'search'],
  ['Bingbot', /bingbot|BingPreview/i, 'search'], ['Applebot', /Applebot/i, 'ai_search'], ['DuckDuckBot', /DuckDuckBot|DuckAssistBot/i, 'search'],
  ['YandexBot', /YandexBot/i, 'search'], ['Baiduspider', /Baiduspider/i, 'search'],
  ['MistralAI-User', /MistralAI-User/i, 'ai_user'], ['Meta-ExternalAgent', /meta-externalagent|meta-externalfetcher/i, 'ai_train'],
  ['CCBot', /CCBot/i, 'ai_train'], ['Amazonbot', /Amazonbot/i, 'ai_search'], ['Bytespider', /Bytespider/i, 'ai_train'],
  ['YouBot', /YouBot/i, 'ai_search'], ['cohere-ai', /cohere-ai/i, 'ai_train'], ['Diffbot', /Diffbot/i, 'ai_train'],
  ['archive.org_bot', /archive\.org_bot|ia_archiver/i, 'archive'],
];
export function crawlerOf(ua) {
  if (!ua) return null;
  for (const [name, re, kind] of CRAWLERS) if (re.test(ua)) return { name, kind };
  return null;
}

let ready = false;
export async function ensureVisSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS rs_crawl (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, bot TEXT NOT NULL, kind TEXT, path TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS rs_crawl_ts ON rs_crawl(ts)'),
    db.prepare('CREATE TABLE IF NOT EXISTS rs_mentions (id INTEGER PRIMARY KEY AUTOINCREMENT, first_seen INTEGER NOT NULL, source TEXT NOT NULL, url TEXT NOT NULL UNIQUE, title TEXT, published TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS rs_aichecks (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, engine TEXT NOT NULL, result TEXT NOT NULL, note TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS rs_config (k TEXT PRIMARY KEY, v TEXT)'),
  ]);
  ready = true;
}
async function getConfig(db, k) { const r = await db.prepare('SELECT v FROM rs_config WHERE k=?').bind(k).first(); return r ? r.v : null; }
async function setConfig(db, k, v) { await db.prepare('INSERT INTO rs_config (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind(k, v).run(); }

// ---- crawler log (called for / and /robots.txt on the public host) ----
export async function logCrawl(env, request, path) {
  const c = crawlerOf(request.headers.get('User-Agent'));
  if (!c || !env.DB) return;
  try {
    await ensureVisSchema(env.DB);
    const dayStart = Math.floor(Date.now() / 86400000) * 86400000;
    const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM rs_crawl WHERE ts >= ?').bind(dayStart).first();
    if (n >= DAILY_CRAWL_CAP) return;
    await env.DB.prepare('INSERT INTO rs_crawl (ts, bot, kind, path) VALUES (?,?,?,?)').bind(Date.now(), c.name, c.kind, path).run();
  } catch (e) { console.log('crawl log', e && e.message); }
}

// ---- mentions ----
const UA = 'renglon-mentions/1.0 (+https://renglon.com.ar)';
const decode = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const own = u => /renglon\.com\.ar|github\.com\/GianPolicari\/renglon/i.test(u);
async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('http_' + r.status);
  return r.json();
}
const SOURCES = {
  hackernews: async () => {
    const j = await getJson('https://hn.algolia.com/api/v1/search_by_date?query=' + encodeURIComponent('renglon.com.ar') + '&hitsPerPage=' + MAX_MENTIONS_PER_SOURCE);
    return (j.hits || []).map(h => ({ url: 'https://news.ycombinator.com/item?id=' + h.objectID, title: decode(h.title || h.story_title || h.comment_text).slice(0, 200), published: h.created_at }));
  },
  reddit: async () => {
    const j = await getJson('https://www.reddit.com/search.json?sort=new&limit=' + MAX_MENTIONS_PER_SOURCE + '&q=' + encodeURIComponent('"renglon.com.ar"'));
    return ((j.data && j.data.children) || []).map(c => c.data).map(d => ({ url: 'https://www.reddit.com' + d.permalink, title: decode(d.title).slice(0, 200), published: new Date(d.created_utc * 1000).toISOString() }));
  },
  github: async () => {
    const j = await getJson('https://api.github.com/search/issues?per_page=' + MAX_MENTIONS_PER_SOURCE + '&q=' + encodeURIComponent('"renglon.com.ar"'));
    return (j.items || []).map(i => ({ url: i.html_url, title: decode(i.title).slice(0, 200), published: i.created_at }));
  },
  google_alerts: async (env) => {
    const feed = await getConfig(env.DB, 'alerts_rss');
    if (!feed) return null;   // not set up
    const r = await fetch(feed, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error('http_' + r.status);
    const xml = await r.text();
    const out = [];
    for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const e = m[1];
      let link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
      link = decode(link);
      try { const u = new URL(link); if (u.hostname.endsWith('google.com') && u.searchParams.get('url')) link = u.searchParams.get('url'); } catch (err) { continue; }
      out.push({ url: link, title: decode((e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]).slice(0, 200), published: (e.match(/<published>([^<]+)<\/published>/) || [])[1] || null });
    }
    return out.slice(0, MAX_MENTIONS_PER_SOURCE);
  },
};
export async function scanMentions(env) {
  const db = env.DB; if (!db) return null;
  await ensureVisSchema(db);
  const status = { ts: Date.now(), sources: {} };
  for (const [name, fn] of Object.entries(SOURCES)) {
    try {
      const found = await fn(env);
      if (found === null) { status.sources[name] = { ok: null, note: 'not_configured' }; continue; }
      let added = 0;
      for (const f of found) {
        if (!/^https:\/\//.test(f.url) || own(f.url)) continue;   // the site itself and its own repository are not mentions
        const r = await db.prepare('INSERT OR IGNORE INTO rs_mentions (first_seen, source, url, title, published) VALUES (?,?,?,?,?)').bind(Date.now(), name, f.url.slice(0, 500), f.title || null, f.published || null).run();
        added += (r.meta && r.meta.changes) || 0;
      }
      status.sources[name] = { ok: true, found: found.length, added };
    } catch (e) {
      status.sources[name] = { ok: false, error: String((e && e.message) || e).slice(0, 80) };
    }
  }
  await setConfig(db, 'scan_status', JSON.stringify(status));
  return status;
}

// ---- IndexNow: tells Bing (which ChatGPT search and Copilot use), Yandex and others when the pages change ----
export async function pingIndexNow(env, force = false) {
  const db = env.DB; if (!db || !env.ASSETS) return null;
  await ensureVisSchema(db);
  const sm = await (await env.ASSETS.fetch(new Request(SITE + '/sitemap.xml'))).text();
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => u.startsWith(SITE + '/'));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(urls.join('\n') + sm)))].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  if (!force && (await getConfig(db, 'sitemap_hash')) === hash) return { skipped: true };
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'renglon.com.ar', key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls }),
  });
  const status = { ts: Date.now(), http: r.status, urls: urls.length };
  await setConfig(db, 'indexnow_status', JSON.stringify(status));
  if (r.status === 200 || r.status === 202) await setConfig(db, 'sitemap_hash', hash);
  return status;
}

// ---- admin ----
const AI_REFS = ['chatgpt', 'perplexity', 'gemini', 'copilot', 'claude', 'deepseek', 'grok', 'meta_ai', 'you'];
const SEARCH_REFS = ['google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'brave'];
export const VIS_REF_SOURCES = [...AI_REFS, 'yahoo', 'ecosia', 'brave'];
export async function adminVisibility(db) {
  await ensureVisSchema(db);
  const now = Date.now(), month = now - 30 * 86400000, week = now - 7 * 86400000;
  const q = async (sql, ...b) => (await db.prepare(sql).bind(...b).all()).results;
  const refs = await q(`SELECT COALESCE(ref,'unknown') AS ref, COUNT(DISTINCT sid) AS n FROM rs_ext WHERE type='view' AND ts>=? GROUP BY 1 ORDER BY n DESC`, month);
  // links from AI answers often carry utm_source (ChatGPT adds utm_source=chatgpt.com)
  const utms = await q(`SELECT utm, COUNT(DISTINCT sid) AS n FROM rs_ext WHERE type='view' AND utm IS NOT NULL AND ts>=? GROUP BY 1 ORDER BY n DESC LIMIT 20`, month);
  const hosts = await q(`SELECT ref_host AS host, COUNT(DISTINCT sid) AS n, MAX(ts) AS last FROM rs_ext WHERE type='view' AND ref_host IS NOT NULL AND ts>=? GROUP BY 1 ORDER BY n DESC LIMIT 30`, month);
  const crawlers = await q(`SELECT bot, kind, SUM(ts>=?1) AS n7, COUNT(*) AS total, MIN(ts) AS first, MAX(ts) AS last FROM rs_crawl GROUP BY bot, kind ORDER BY last DESC`, week);
  const mentions = await q(`SELECT first_seen, source, url, title, published FROM rs_mentions ORDER BY first_seen DESC LIMIT 100`);
  const aichecks = await q(`SELECT ts, engine, result, note FROM rs_aichecks ORDER BY ts DESC LIMIT 40`);
  const cfg = async k => { const v = await getConfig(db, k); try { return v ? JSON.parse(v) : null; } catch (e) { return v; } };
  // one visit counts once, whether the AI shows as the referrer, as the campaign tag or both
  const inList = l => l.map(x => `'${x}'`).join(',');
  const { n: fromAi } = await db.prepare(`SELECT COUNT(DISTINCT sid) AS n FROM rs_ext WHERE type='view' AND ts>=? AND (ref IN (${inList(AI_REFS)})
    OR utm LIKE '%chatgpt%' OR utm LIKE '%openai%' OR utm LIKE '%perplexity%' OR utm LIKE '%gemini%' OR utm LIKE '%copilot%' OR utm LIKE '%claude%' OR utm LIKE '%deepseek%' OR utm LIKE '%grok%')`).bind(month).first();
  const { n: fromSearch } = await db.prepare(`SELECT COUNT(DISTINCT sid) AS n FROM rs_ext WHERE type='view' AND ts>=? AND ref IN (${inList(SEARCH_REFS)})`).bind(month).first();
  return { refs, utms, hosts, crawlers, mentions, aichecks, fromAi, fromSearch, aiRefs: AI_REFS, searchRefs: SEARCH_REFS,
    scan: await cfg('scan_status'), indexnow: await cfg('indexnow_status'), alertsRss: await getConfig(db, 'alerts_rss') };
}
const ENGINES = new Set(['chatgpt', 'perplexity', 'claude', 'copilot', 'gemini', 'google_ai']);
const RESULTS = new Set(['named', 'linked', 'not_named']);
export async function adminVisibilityPost(db, env, path, body) {
  await ensureVisSchema(db);
  if (path === '/api/admin/aicheck') {
    if (!ENGINES.has(body.engine) || !RESULTS.has(body.result)) return { error: 'bad_check' };
    const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) : null;
    await db.prepare('INSERT INTO rs_aichecks (ts, engine, result, note) VALUES (?,?,?,?)').bind(Date.now(), body.engine, body.result, note || null).run();
    return { ok: true };
  }
  if (path === '/api/admin/alerts') {
    const u = typeof body.url === 'string' ? body.url.trim() : '';
    if (u && !/^https:\/\/www\.google\.com\/alerts\/feeds\/\d+\/\d+$/.test(u)) return { error: 'bad_feed' };
    if (u) await setConfig(db, 'alerts_rss', u); else await db.prepare("DELETE FROM rs_config WHERE k='alerts_rss'").run();
    return { ok: true };
  }
  if (path === '/api/admin/scan') return { ok: true, scan: await scanMentions(env), indexnow: await pingIndexNow(env, !!body.indexnow) };
  return null;
}
