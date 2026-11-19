/* sandroleone.ch – Gedanken (Blog) */
window.Gedanken = (() => {
  'use strict';
  const API = window.GB_API;

  const fmtDay = iso => {
    try { return new Date(iso).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return iso; }
  };
  const fmtTime = iso => {
    try { return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  };

  // Text mit klickbaren Links, ohne innerHTML
  function linkify(el, text) {
    const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      el.append(text.slice(last, m.index));
      const a = document.createElement('a');
      a.href = m[0]; a.textContent = m[0]; a.target = '_blank'; a.rel = 'noopener nofollow';
      el.append(a);
      last = m.index + m[0].length;
    }
    el.append(text.slice(last));
  }

  function render(t) {
    const div = document.createElement('div');
    div.className = 'post thought';
    const meta = document.createElement('div');
    meta.className = 'date';
    meta.textContent = `${fmtDay(t.created_at)}, ${fmtTime(t.created_at)}${t.updated_at ? ' (bearbeitet)' : ''}`;
    const p = document.createElement('p');
    p.className = 'gb-msg';
    linkify(p, t.text);
    div.append(meta, p);
    if (window.Hearts) div.append(Hearts.button('thought', t.id, t.hearts));
    return div;
  }

  async function fetchPage(page) {
    const r = await fetch(`${API}/thoughts?page=${page}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  return { API, render, fetchPage };
})();
