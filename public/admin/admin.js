(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const KEY_NAME = 'taxdrop_admin_key';
  let key = null, lastId = 0, timer = null, sumTimer = null, visTimer = null;
  const store = {
    get() { try { return sessionStorage.getItem(KEY_NAME) || localStorage.getItem(KEY_NAME); } catch (e) { return null; } },
    set(v, remember) { try { sessionStorage.setItem(KEY_NAME, v); if (remember) localStorage.setItem(KEY_NAME, v); } catch (e) {} },
    clear() { try { sessionStorage.removeItem(KEY_NAME); localStorage.removeItem(KEY_NAME); } catch (e) {} },
  };
  const OUTCOME_CLASS = { ok: 'ok', mismatch: 'warn', no_rows: 'warn' };
  const BOT_WHY = { auto: 'remote-controlled browser', ua: 'crawler or tool User-Agent', dc: 'cloud / hosting network' };
  function botBadge(why) { const b = el('span', 'bot', 'badge'); b.title = BOT_WHY[why] || why; return b; }
  // flag, code and country name in the browser's language ("🇸🇰 SK · Eslovaquia"); Cloudflare sends XX or T1 when it can't tell
  let regionName = cc => cc;
  try { const dn = new Intl.DisplayNames([navigator.language, 'en'], { type: 'region' }); regionName = cc => { try { return dn.of(cc) || cc; } catch (e) { return cc; } }; } catch (e) {}
  const flag = cc => (/^[A-Z]{2}$/.test(cc) && cc !== 'XX') ? String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) + ' ' + cc + ' · ' + regionName(cc) : cc === 'T1' ? 'T1 · Tor' : (cc || 'Unknown');
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = String(text); if (cls) e.className = cls; return e; };

  async function api(path) {
    const r = await fetch(path, { headers: { Authorization: 'Bearer ' + key }, cache: 'no-store', credentials: 'omit' });
    if (r.status === 401) throw new Error('unauthorized');
    if (r.status === 429) throw new Error('rate');
    if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw new Error(j.error || ('http_' + r.status)); }
    return r.json();
  }

  async function apiPost(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', credentials: 'omit' });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401) throw new Error('unauthorized');
    if (!r.ok) throw new Error(j.error || ('http_' + r.status));
    return j;
  }

  // ---- visibility: search engines, AI assistants and mentions ----
  const KIND = { search: 'Search engine', ai_search: 'AI answers (search index)', ai_user: 'AI fetching it for someone', ai_train: 'AI training', archive: 'Web archive' };
  const ENGINE = { chatgpt: 'ChatGPT', perplexity: 'Perplexity', claude: 'Claude', copilot: 'Copilot', google_ai: 'Google AI Mode', gemini: 'Gemini' };
  const RESULT = { linked: ['Named it with a link', 'ok'], named: ['Named it, no link', 'warn'], not_named: ['Did not name it', 'bad'] };
  const SOURCE = { hackernews: 'Hacker News', reddit: 'Reddit', github: 'GitHub', google_alerts: 'Google Alerts' };
  const ASK = { chatgpt: 'https://chatgpt.com/?q=', perplexity: 'https://www.perplexity.ai/search?q=', claude: 'https://claude.ai/new?q=', copilot: 'https://copilot.microsoft.com/?q=', google_ai: 'https://www.google.com/search?udm=50&q=' };
  const day = ts => ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '–';
  const when = ts => ts ? new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
  function link(href, text) { const a = el('a', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  function aiLinks() {
    const q = $('#aiQ').value, box = $('#aiLinks'); box.replaceChildren();
    for (const [k, base] of Object.entries(ASK)) { const a = link(base + encodeURIComponent(q), 'Ask ' + ENGINE[k]); a.className = 'btn'; box.append(a); }
  }
  async function pollVisibility() {
    try {
      const v = await api('/api/admin/visibility');
      const k = $('#visKpis'); k.replaceChildren();
      const kpi = (label, n, sub) => { const d = el('div', null, 'kpi'); d.append(el('small', label), el('b', n), el('span', sub)); k.append(d); };
      kpi('From AI assistants', v.fromAi, 'visits, 30 days');
      kpi('From search engines', v.fromSearch, 'visits, 30 days');
      kpi('Crawlers seen', v.crawlers.length, v.crawlers.filter(c => c.kind !== 'search' && c.kind !== 'archive').length + ' of them AI');
      kpi('Mentions found', v.mentions.length, v.mentions.length ? 'latest ' + day(v.mentions[0].first_seen) : 'none yet');
      const refs = v.refs.filter(r => v.aiRefs.includes(r.ref) || v.searchRefs.includes(r.ref));
      list('#visRefs', refs.length ? refs : [{ ref: 'None yet', n: '' }], r => (v.aiRefs.includes(r.ref) ? 'AI · ' : v.searchRefs.includes(r.ref) ? 'Search · ' : '') + r.ref, r => r.n);
      $('#visUtm').textContent = v.utms.length ? 'Campaign tags (utm_source): ' + v.utms.map(u => `${u.utm} ${u.n}`).join(', ') : '';
      list('#visHosts', v.hosts.length ? v.hosts : [{ host: 'None yet', n: '' }], h => h.host, h => h.n);
      const tb = $('#visCrawl'); tb.replaceChildren();
      if (!v.crawlers.length) { const tr = el('tr'); const td = el('td', 'None logged yet: they show up here when they next read the site.'); td.colSpan = 6; tr.append(td); tb.append(tr); }
      for (const c of v.crawlers) { const tr = el('tr'); tr.append(el('td', c.bot), el('td', KIND[c.kind] || c.kind), el('td', c.n7, 'n'), el('td', c.total, 'n'), el('td', day(c.first)), el('td', when(c.last))); tb.append(tr); }
      const s = v.scan;
      $('#visScan').textContent = s ? `Last check ${when(s.ts)}: ` + Object.entries(s.sources).map(([n, r]) => `${SOURCE[n] || n} ${r.ok === true ? 'ok' : r.ok === null ? 'not set up' : 'failed (' + r.error + ')'}`).join(' · ') : 'Not checked yet: the first check runs tonight, or use "Check now".';
      const mb = $('#visMentions'); mb.replaceChildren();
      if (!v.mentions.length) { const tr = el('tr'); const td = el('td', 'No mentions found yet.'); td.colSpan = 3; tr.append(td); mb.append(tr); }
      for (const m of v.mentions) { const tr = el('tr'); const td = el('td'); td.append(link(m.url, m.title || m.url)); tr.append(el('td', day(m.first_seen)), el('td', SOURCE[m.source] || m.source), td); mb.append(tr); }
      if (v.alertsRss && !$('#alertsUrl').value) $('#alertsUrl').value = v.alertsRss;
      const ab = $('#aiChecks'); ab.replaceChildren();
      for (const c of v.aichecks) {
        const li = el('li'); const [txt, cls] = RESULT[c.result] || [c.result, ''];
        const left = el('span', `${day(c.ts)} · ${ENGINE[c.engine] || c.engine}${c.note ? ' · ' + c.note : ''}`); li.append(left, el('span', txt, 'badge ' + cls)); ab.append(li);
      }
      const ix = v.indexnow;
      $('#visIndex').textContent = ix ? `Bing and other IndexNow engines last told about ${ix.urls} pages on ${when(ix.ts)} (answer ${ix.http}${ix.http === 200 || ix.http === 202 ? ', accepted' : ''}).` : 'Bing has not been notified yet (it happens on the daily check).';
    } catch (e) { if (e.message === 'unauthorized') logout('That key was not accepted.'); }
  }
  $('#aiQ').addEventListener('change', aiLinks); aiLinks();
  $('#aiForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await apiPost('/api/admin/aicheck', { engine: $('#aiEngine').value, result: $('#aiResult').value, note: $('#aiNote').value }); $('#aiNote').value = ''; pollVisibility(); } catch (err) { alertMsg(err); }
  });
  $('#alertsForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { await apiPost('/api/admin/alerts', { url: $('#alertsUrl').value.trim() }); $('#alertsMsg').textContent = 'Saved. It is read on every check.'; pollVisibility(); }
    catch (err) { $('#alertsMsg').textContent = err.message === 'bad_feed' ? 'That is not a Google Alerts feed link.' : 'Could not save (' + err.message + ').'; }
  });
  $('#scanNow').addEventListener('click', async () => {
    const b = $('#scanNow'); b.disabled = true; b.textContent = 'Checking…';
    try { await apiPost('/api/admin/scan', {}); } catch (err) { alertMsg(err); }
    b.disabled = false; b.textContent = 'Check now'; pollVisibility();
  });
  function alertMsg(err) { const m = $('#dashMsg'); m.textContent = 'Could not save (' + (err && err.message) + ').'; m.hidden = false; }

  const REASONS = {
    admin_token_not_configured: 'The server has no ADMIN_TOKEN, or it is shorter than 24 characters. Add it under Settings → Variables and Secrets (runtime, type Secret), not under Build variables.',
    no_database: 'The D1 database is not connected to the Worker.',
    server: 'The server hit an error. Check Workers → cleanbasis → Observability → Logs.',
    rate: 'Too many requests in the last minute. It will retry on its own.',
  };
  function setLive(on, reason) {
    const l = $('#live'); l.textContent = on ? 'live' : 'offline'; l.classList.toggle('on', on);
    const m = $('#dashMsg'); if (m) { m.textContent = on ? '' : (REASONS[reason] || ('Cannot reach the server (' + (reason || 'network') + ').')); m.hidden = on; }
  }

  function addRows(events, isNew) {
    const tb = $('#feed');
    const frag = document.createDocumentFragment();
    for (const e of events) {
      const tr = el('tr'); if (isNew) tr.className = 'new';
      const t = new Date(e.ts);
      tr.append(el('td', t.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })));
      const ctd = el('td', flag(e.country)); if (e.owner) ctd.append(' ', el('span', 'you', 'badge warn')); if (e.bot) ctd.append(' ', botBadge(e.bot)); tr.append(ctd);
      tr.append(el('td', e.type + (e.format ? ' · ' + e.format : '')));
      const res = el('td'); if (e.outcome) res.append(el('span', e.outcome, 'badge ' + (OUTCOME_CLASS[e.outcome] || 'bad'))); tr.append(res);
      tr.append(el('td', e.error || ''));
      tr.append(el('td', e.broker || ''));
      tr.append(el('td', e.pages ?? '', 'n'));
      tr.append(el('td', e.rows ?? '', 'n'));
      tr.append(el('td', e.sections != null ? `${e.sections_ok}/${e.sections}` : '', 'n'));
      tr.append(el('td', e.ms ?? '', 'n'));
      tr.append(el('td', e.ua || ''));
      frag.append(tr);
    }
    tb.prepend(frag);
    while (tb.children.length > 300) tb.lastChild.remove();
  }

  async function pollFeed() {
    try {
      const { events } = await api('/api/admin/feed?since=' + lastId);
      if (events.length) { addRows(events, lastId > 0); lastId = Math.max(lastId, ...events.map(e => e.id)); }
      setLive(true);
    } catch (e) { setLive(false, e.message); if (e.message === 'unauthorized') return logout('That key was not accepted.'); }
  }

  function list(id, rows, label, value) {
    const ul = $(id); ul.replaceChildren();
    if (!rows.length) { ul.append(el('li', 'No data yet')); return; }
    for (const r of rows) { const li = el('li'); li.append(el('span', label(r)), el('b', value(r))); ul.append(li); }
  }

  async function pollSummary() {
    try {
      const s = await api('/api/admin/summary');
      const t = s.totals || {};
      const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
      const k = $('#kpis'); k.replaceChildren();
      for (const [label, v, sub] of [
        ['Visits · 24 h', t.views_24h || 0, `${t.views_7d || 0} in 7 days`],
        ['Conversions · 24 h', t.conv_24h || 0, `${t.conv_7d || 0} in 7 days`],
        ['Success rate · 7 d', pct(t.ok_7d || 0, t.conv_7d || 0), `${t.ok_7d || 0} matched totals`],
        ['Downloads · 24 h', t.dl_24h || 0, `${t.dl_7d || 0} in 7 days`],
      ]) { const d = el('div', null, 'kpi'); d.append(el('small', label), el('b', v), el('span', sub)); k.append(d); }
      list('#countries', s.countries, r => flag(r.country), r => r.n);
      list('#errors', s.errors, r => r.error || 'unknown', r => r.n);
      list('#brokers', s.brokers, r => r.broker || 'unknown', r => `${r.n} (${pct(r.ok, r.n)} ok)`);
      const h = $('#hourly'); h.replaceChildren();
      const max = Math.max(1, ...s.hourly.map(x => Math.max(x.views, x.conv)));
      const now = Date.now();
      for (let i = 23; i >= 0; i--) {
        const hour = Math.floor((now - i * 3600000) / 3600000) * 3600000;
        const x = s.hourly.find(r => r.hour === hour) || { views: 0, conv: 0 };
        const bar = el('div'); bar.style.height = (100 * x.conv / max) + '%';
        bar.title = `${new Date(hour).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}: ${x.views} visits, ${x.conv} conversions`;
        h.append(bar);
      }
    } catch (e) { if (e.message === 'unauthorized') logout('That key was not accepted.'); }
  }

  async function pollFiles() {
    try {
      const { files } = await api('/api/admin/files');
      const tb = $('#files'); tb.replaceChildren();
      if (!files.length) { const tr = el('tr'); const td = el('td', 'No files yet'); td.colSpan = 13; tr.append(td); tb.append(tr); return; }
      for (const f of files) {
        const tr = el('tr');
        tr.append(el('td', new Date(f.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })));
        const ctd = el('td', flag(f.country)); if (f.owner) ctd.append(' ', el('span', 'you', 'badge warn')); if (f.bot) ctd.append(' ', botBadge(f.bot));
        tr.append(ctd, el('td', f.broker || ''));
        const res = el('td'); if (f.outcome) res.append(el('span', f.outcome, 'badge ' + (OUTCOME_CLASS[f.outcome] || 'bad'))); tr.append(res);
        tr.append(el('td', f.error || ''), el('td', f.size_kb ?? '', 'n'), el('td', f.pages ?? '', 'n'), el('td', f.rows ?? '', 'n'), el('td', f.flagged ?? '', 'n'),
          el('td', f.sections != null ? `${f.sections_ok}/${f.sections}` : '', 'n'), el('td', f.ms ?? '', 'n'), el('td', f.downloads || 'no'));
        const yn = (v, good) => el('span', v === good ? 'yes' : 'no', 'badge ' + (v === good ? 'ok' : 'bad'));
        const tf = el('td'); if (f.totals_feedback) tf.append(yn(f.totals_feedback, 'totals_match')); tr.append(tf);
        tb.append(tr);
      }
    } catch (e) { if (e.message === 'unauthorized') logout('That key was not accepted.'); }
  }

  async function pollLayouts() {
    try {
      const { layouts } = await api('/api/admin/layouts');
      const box = $('#layouts'); box.replaceChildren();
      if (!layouts.length) { box.append(el('p', 'None yet.', 'notice')); return; }
      for (const l of layouts) {
        const d = el('details', null, 'qa');
        d.append(el('summary', `#${l.id} · ${new Date(l.ts).toLocaleString()} · ${flag(l.country)} · ${l.broker || 'unknown'} · ${l.outcome || ''} · ${l.pages ?? '?'} pages`));
        const pre = el('pre', l.layout, 'layoutpre'); d.append(pre);
        box.append(d);
      }
    } catch (e) { if (e.message === 'unauthorized') logout('That key was not accepted.'); }
  }

  async function pollFunnel() {
    try {
      const s = await api('/api/admin/funnel');
      const f = s.funnel || {};
      const steps = [['Visited', f.visited], ['Chose a file', f.selected], ['Converted OK', f.converted], ['Downloaded', f.downloaded], ['Totals match', f.imported]];
      const top = Math.max(1, f.visited || 0);
      const box = $('#funnel'); box.replaceChildren();
      steps.forEach(([label, n], i) => {
        n = n || 0;
        const d = el('div', null, 'step');
        const prev = i ? (steps[i - 1][1] || 0) : null;
        d.append(el('small', label), el('b', n), el('span', i ? (prev ? Math.round(100 * n / prev) + '% of previous step' : '–') : `${f.repeat_visits || 0} returning`));
        const m = el('div', null, 'meter'); const bar = el('i'); bar.style.width = (100 * n / top) + '%'; m.append(bar); d.append(m);
        box.append(d);
      });
      list('#refs', s.refs, r => r.ref, r => r.n);
      list('#devices', s.devices, r => r.device, r => r.n);
      list('#jserrors', s.jserrors, r => r.error || 'unknown', r => r.n);
      list('#wants', s.wants || [], r => r.software === 'other' ? 'turbotax (txf, before it existed)' : r.software, r => r.n);
    } catch (e) { if (e.message === 'unauthorized') logout('That key was not accepted.'); }
  }

  function markOwner() { try { localStorage.setItem('td_owner', '1'); } catch (e) {} }
  function start() {
    markOwner(); // this browser belongs to the owner: its visits are labelled and left out of the statistics
    $('#login').hidden = true; $('#dash').hidden = false;
    lastId = 0; $('#feed').replaceChildren();
    pollFeed(); pollSummary(); pollFiles(); pollFunnel(); pollLayouts(); pollVisibility();
    timer = setInterval(pollFeed, 5000);
    sumTimer = setInterval(() => { pollSummary(); pollFiles(); pollFunnel(); pollLayouts(); }, 30000);
    visTimer = setInterval(pollVisibility, 300000);
  }
  function logout(msg) {
    clearInterval(timer); clearInterval(sumTimer); clearInterval(visTimer); store.clear(); key = null;
    $('#dash').hidden = true; $('#login').hidden = false; $('#loginMsg').textContent = msg || ''; setLive(false);
  }

  $('#keyForm').addEventListener('submit', e => {
    e.preventDefault();
    key = $('#key').value.trim(); $('#key').value = '';
    store.set(key, $('#remember').checked);
    start();
  });
  $('#logout').addEventListener('click', () => logout('Key removed from this device.'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && key) { pollFeed(); pollSummary(); pollFiles(); pollFunnel(); } });
  key = store.get();
  if (key) start();
})();
