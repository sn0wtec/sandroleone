/* sandroleone.ch – Gästebuch-API (Cloudflare Worker + D1)
 *
 * Öffentlich:
 *   GET  /entries?page=1        freigegebene Einträge (neueste zuerst)
 *   POST /entries               neuen Eintrag anlegen
 * Admin (Header "Authorization: Bearer <ADMIN_PASSWORD>"):
 *   GET    /admin/entries               alle Einträge inkl. wartende
 *   POST   /admin/entries/:id/approve   freigeben
 *   DELETE /admin/entries/:id           löschen
 */

const PAGE_SIZE = 20;
const LIMITS = { name: 40, message: 1000, homepage: 200 };
const RATE_WINDOW_MIN = 10;   // Minuten
const RATE_MAX = 3;           // Einträge pro IP und Zeitfenster
const MIN_FILL_MS = 3000;     // Bots füllen schneller aus als Menschen

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/entries' && request.method === 'GET') return listPublic(url, env, cors);
      if (path === '/entries' && request.method === 'POST') return createEntry(request, env, cors);

      if (path.startsWith('/admin/')) {
        if (!(await isAdmin(request, env))) return json({ error: 'Nicht berechtigt.' }, 401, cors);
        if (path === '/admin/entries' && request.method === 'GET') return listAdmin(env, cors);
        const m = path.match(/^\/admin\/entries\/(\d+)(\/approve)?$/);
        if (m && m[2] && request.method === 'POST') return approve(+m[1], env, cors);
        if (m && !m[2] && request.method === 'DELETE') return remove(+m[1], env, cors);
      }

      if (path === '/') return json({ ok: true, service: 'sandroleone.ch Gästebuch' }, 200, cors);
      return json({ error: 'Nicht gefunden.' }, 404, cors);
    } catch (err) {
      console.error(err);
      return json({ error: 'Serverfehler.' }, 500, cors);
    }
  }
};

// ---------- Öffentlich ----------
async function listPublic(url, env, cors) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const { results } = await env.DB.prepare(
    'SELECT id, name, message, homepage, created_at FROM entries WHERE approved = 1 ORDER BY id DESC LIMIT ? OFFSET ?'
  ).bind(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM entries WHERE approved = 1').first('n');
  return json({
    entries: results.slice(0, PAGE_SIZE),
    page,
    hasMore: results.length > PAGE_SIZE,
    total
  }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function createEntry(request, env, cors) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Ungültige Anfrage.' }, 400, cors); }

  // Honeypot: dieses Feld ist für Menschen unsichtbar
  if (body.website) return json({ status: 'pending' }, 201, cors);
  if (typeof body.t !== 'number' || body.t < MIN_FILL_MS) {
    return json({ error: 'Das ging etwas schnell. Versuch es nochmals.' }, 400, cors);
  }

  const name = clean(body.name, LIMITS.name);
  const message = clean(body.message, LIMITS.message, true);
  let homepage = clean(body.homepage, LIMITS.homepage);
  if (!name) return json({ error: 'Bitte gib einen Namen an.' }, 400, cors);
  if (!message) return json({ error: 'Bitte schreib eine Nachricht.' }, 400, cors);
  if (homepage) {
    if (!/^https?:\/\//i.test(homepage)) homepage = 'https://' + homepage;
    try {
      const u = new URL(homepage);
      if (!/^https?:$/.test(u.protocol)) throw 0;
      homepage = u.href;
    } catch { return json({ error: 'Die Homepage-Adresse sieht ungültig aus.' }, 400, cors); }
  }

  const ipHash = await hashIp(request, env);
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entries WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)"
  ).bind(ipHash, `-${RATE_WINDOW_MIN} minutes`).first('n');
  if (recent >= RATE_MAX) {
    return json({ error: 'Du hast gerade schon geschrieben. Versuch es später nochmals.' }, 429, cors);
  }

  const moderated = env.MODERATION !== 'false';
  await env.DB.prepare(
    'INSERT INTO entries (name, message, homepage, approved, ip_hash) VALUES (?, ?, ?, ?, ?)'
  ).bind(name, message, homepage || null, moderated ? 0 : 1, ipHash).run();

  return json({ status: moderated ? 'pending' : 'published' }, 201, cors);
}

// ---------- Admin ----------
async function listAdmin(env, cors) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, message, homepage, approved, created_at FROM entries ORDER BY approved ASC, id DESC LIMIT 500'
  ).all();
  return json({ entries: results, moderation: env.MODERATION !== 'false' }, 200, { ...cors, 'Cache-Control': 'no-store' });
}

async function approve(id, env, cors) {
  const r = await env.DB.prepare('UPDATE entries SET approved = 1 WHERE id = ?').bind(id).run();
  return json({ ok: r.meta.changes > 0 }, r.meta.changes ? 200 : 404, cors);
}

async function remove(id, env, cors) {
  const r = await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(id).run();
  return json({ ok: r.meta.changes > 0 }, r.meta.changes ? 200 : 404, cors);
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Vergleich über Hashes, damit die Laufzeit nicht vom Inhalt abhängt
  const [a, b] = await Promise.all([sha256(given), sha256(env.ADMIN_PASSWORD)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- Hilfsfunktionen ----------
function clean(v, max, multiline = false) {
  if (typeof v !== 'string') return '';
  let s = v.replace(/\r\n?/g, '\n');
  s = multiline ? s.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  // Steuerzeichen entfernen
  s = s.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
  return s.slice(0, max);
}

// Die IP wird nie gespeichert, nur ein täglich wechselnder Hash davon (für das Rate-Limit)
async function hashIp(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  return sha256(`${ip}|${day}|${env.ADMIN_PASSWORD || ''}`);
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}
