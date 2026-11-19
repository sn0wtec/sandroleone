/* sandroleone.ch – Besucherzähler: zählt jeden Browser einmal pro Sitzung */
(() => {
  const els = document.querySelectorAll('[data-visits]');
  const API = window.GB_API;
  if (!API) return;
  let counted = false;
  try { counted = sessionStorage.getItem('visit-counted') === '1'; } catch (e) {}
  fetch(API + (counted ? '/counter' : '/counter/hit'), { method: counted ? 'GET' : 'POST' })
    .then(r => r.json())
    .then(d => {
      if (!counted) { try { sessionStorage.setItem('visit-counted', '1'); } catch (e) {} }
      els.forEach(el => { el.textContent = String(d.visits).padStart(6, '0'); });
    })
    .catch(() => { els.forEach(el => { el.textContent = '??????'; }); });
})();
