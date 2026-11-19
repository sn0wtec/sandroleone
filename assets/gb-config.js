// Adresse des Gästebuch-Workers (nach dem ersten Deploy eintragen)
window.GB_API = 'https://sandroleone-gaestebuch.CHANGE-ME.workers.dev';
// Lokal testen: ?api=http://localhost:8787
try { const o = new URLSearchParams(location.search).get('api'); if (o && /^http:\/\/localhost:\d+$/.test(o)) window.GB_API = o; } catch (e) {}
