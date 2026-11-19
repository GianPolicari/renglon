// Anonymous usage events. Never sends file names, file contents, amounts or descriptions.
// Country is added by the server from the connection; the IP address is not stored.
// sid: random id for this browser tab session only (sessionStorage), to follow one visit
// through view -> select -> convert -> download. No persistent user id is kept.
(function () {
  'use strict';
  const VERSION = '0.4.0';
  const optOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
  let sid = null, returning = 0, owner = 0;
  // "#soy-yo" (a link from the admin panel; fragments never reach the server) marks this browser as the owner's
  try { if (location.hash === '#soy-yo') { localStorage.setItem('td_owner', '1'); history.replaceState(null, '', location.pathname + location.search); } } catch (e) {}
  try { owner = localStorage.getItem('td_owner') === '1' ? 1 : 0; } catch (e) {}
  try { sid = sessionStorage.getItem('td_sid'); if (!sid) { sid = rand(); sessionStorage.setItem('td_sid', sid); } } catch (e) { sid = rand(); }
  try { returning = localStorage.getItem('td_seen') ? 1 : 0; localStorage.setItem('td_seen', '1'); } catch (e) {}

  function refSource() {
    let host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) {}
    if (!host || host === location.hostname) return 'direct';
    const map = [['google', /google\./], ['bing', /bing\.com/], ['duckduckgo', /duckduckgo/], ['reddit', /reddit\.com/], ['facebook', /facebook\.com|fb\.com/], ['instagram', /instagram\.com/],
      ['linkedin', /linkedin\.com/], ['x', /^(x|twitter|t)\.co(m)?$/], ['youtube', /youtube\.com/], ['whatsapp', /whatsapp\.com|wa\.me/], ['chatgpt', /chatgpt\.com|openai\.com/], ['perplexity', /perplexity\.ai/], ['email', /mail\./]];
    for (const [k, re] of map) if (re.test(host)) return k;
    return 'other';
  }
  const device = /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  const utm = (new URLSearchParams(location.search).get('utm_source') || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40) || undefined;

  function send(type, data) {
    if (optOut) return;
    const body = JSON.stringify(Object.assign({ type, version: VERSION, page: document.body.dataset.page, software: document.body.dataset.software, sid, device, owner: owner || undefined }, data || {}));
    if (body.length > 1800) return;
    try {
      fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch (e) { /* telemetry must never break the page */ }
  }
  // unexpected script errors: only the error type, never the message (it could contain data)
  let jsErrors = 0;
  window.addEventListener('error', ev => {
    if (++jsErrors > 3) return;
    const name = ((ev.error && ev.error.name) || 'error').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40) || 'error';
    send('jserror', { error: name });
  });
  window.TaxDropTelemetry = { send, newFileId: rand, off: optOut };
  send('view', { ref: refSource(), utm, returning });
})();
