// Shared page behaviour: current page in the nav and phone-friendly tables.
(function () {
  'use strict';
  const here = location.pathname.replace(/\/?$/, '/');
  document.querySelectorAll('.nav a').forEach(a => {
    const h = a.getAttribute('href');
    if (h === here) a.setAttribute('aria-current', 'page');
    else if (h !== '/' && here.startsWith(h)) a.setAttribute('aria-current', 'true');   // a bank page is inside "Bancos"
  });
  // any copy that is not the real site (test., preview links): say so on every page; the worker adds it on the pages it serves
  if (location.hostname !== 'renglon.com.ar' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' && !document.querySelector('.envbar')) {
    const bar = document.createElement('div'); bar.className = 'envbar'; bar.setAttribute('role', 'note');
    bar.textContent = 'Copia de prueba: lo que hagas acá no se guarda en las estadísticas.';
    document.body.prepend(bar);
  }
  // tables marked .cards: label every cell with its column name (each row becomes a card on phones, see site.css)
  const label = t => {
    const names = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach(tr => Array.from(tr.children).forEach((td, i) => { if (names[i] && td.dataset.label !== names[i]) td.dataset.label = names[i]; }));
  };
  document.querySelectorAll('table.cards').forEach(t => {
    label(t);
    const tb = t.querySelector('tbody');
    if (tb) new MutationObserver(() => label(t)).observe(tb, { childList: true });
  });
})();
