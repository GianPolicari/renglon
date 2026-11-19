// Shared page behaviour: current page in the nav and phone-friendly tables.
(function () {
  'use strict';
  const here = location.pathname.replace(/\/?$/, '/');
  document.querySelectorAll('.nav a').forEach(a => { if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page'); });
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
