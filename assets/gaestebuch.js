/* sandroleone.ch – Gästebuch (Frontend) */
(() => {
  'use strict';
  const API = window.GB_API;
  const list = document.getElementById('gb-list');
  const form = document.getElementById('gb-form');
  const status = document.getElementById('gb-status');
  const more = document.getElementById('gb-more');
  const counter = document.getElementById('gb-count');
  const shownAt = Date.now();
  let page = 1;

  const fmt = iso => {
    try {
      return new Date(iso).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  };

  function render(e) {
    const div = document.createElement('div');
    div.className = 'post';
    const h = document.createElement('h2');
    h.textContent = e.name;
    const meta = document.createElement('div');
    meta.className = 'date';
    meta.textContent = `#${e.id} · ${fmt(e.created_at)}`;
    if (e.homepage) {
      meta.append(' · ');
      const a = document.createElement('a');
      a.href = e.homepage; a.rel = 'nofollow ugc noopener'; a.target = '_blank';
      a.textContent = 'Homepage';
      meta.append(a);
    }
    const p = document.createElement('p');
    p.className = 'gb-msg';
    p.textContent = e.message;
    div.append(h, meta, p);
    return div;
  }

  async function load(reset) {
    if (reset) { page = 1; list.textContent = 'Lade Einträge …'; }
    try {
      const r = await fetch(`${API}/entries?page=${page}`);
      const d = await r.json();
      if (reset) list.textContent = '';
      if (!d.entries.length && page === 1) list.textContent = 'Noch keine Einträge. Sei die erste Person!';
      d.entries.forEach(e => list.append(render(e)));
      more.hidden = !d.hasMore;
      if (counter) counter.textContent = String(d.total).padStart(6, '0');
    } catch (err) {
      list.textContent = 'Das Gästebuch ist gerade nicht erreichbar. Versuch es später nochmals.';
    }
  }

  more.addEventListener('click', () => { page++; load(false); });

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button');
    btn.disabled = true;
    status.textContent = 'Wird gesendet …';
    try {
      const r = await fetch(`${API}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('name'),
          message: fd.get('message'),
          homepage: fd.get('homepage'),
          website: fd.get('website'),
          t: Date.now() - shownAt
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Fehler beim Senden.');
      form.reset();
      if (d.status === 'published') { status.textContent = '★ Danke für deinen Eintrag! ★'; load(true); }
      else status.textContent = '★ Danke! Dein Eintrag erscheint, sobald er freigeschaltet ist. ★';
    } catch (err) {
      status.textContent = err.message || 'Fehler beim Senden.';
    } finally {
      btn.disabled = false;
    }
  });

  load(true);
})();
