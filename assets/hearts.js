/* sandroleone.ch – Herzen für Gedanken und Gästebuch-Einträge */
window.Hearts = (() => {
  'use strict';
  const KEY = 'hearts-given';
  let given = new Set();
  try { given = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...given].slice(-500))); } catch (e) {} };

  function paint(btn, n, mine) {
    btn.classList.toggle('mine', mine);
    btn.querySelector('.h').textContent = mine ? '♥' : '♡';
    btn.querySelector('.n').textContent = n > 0 ? n : '';
    btn.setAttribute('aria-pressed', mine ? 'true' : 'false');
    btn.title = mine ? 'Du hast ein Herz gegeben' : 'Herz geben';
  }

  // kind: 'entry' | 'thought'
  function button(kind, id, count) {
    const key = kind + ':' + id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'heart';
    btn.innerHTML = '<span class="h"></span> <span class="n"></span>';
    let n = count || 0;
    paint(btn, n, given.has(key));
    btn.addEventListener('click', async () => {
      if (given.has(key) || btn.disabled) return;
      btn.disabled = true;
      // sofort anzeigen, bei Fehler zurücknehmen
      paint(btn, n + 1, true);
      btn.classList.add('pop');
      setTimeout(() => btn.classList.remove('pop'), 400);
      try {
        const r = await fetch(window.GB_API + '/hearts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, id })
        });
        if (!r.ok) throw new Error();
        const d = await r.json();
        n = d.hearts;
        given.add(key); save();
        paint(btn, n, true);
      } catch (e) {
        paint(btn, n, false);
      } finally {
        btn.disabled = false;
      }
    });
    return btn;
  }
  return { button };
})();
