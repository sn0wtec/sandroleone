# sandroleone.ch

Persönliche Webseite. Statisch, gehostet über GitHub Pages (`CNAME` → sandroleone.ch).

- `index.html` + `assets/gang.js` – der begehbare Gang (Raycaster, Vanilla JS, keine Abhängigkeiten)
- `assets/retro.css` – Oldschool-Stil der Unterseiten
- `blog/`, `gaestebuch/`, `ueber-mich/`, `archiv/` – Unterseiten hinter den Türen
- `archiv/2025-sample/` – die ursprüngliche Testseite

Türen und Karte werden oben in `assets/gang.js` definiert (`map`, `DOORS`).
Lokal testen: `python3 -m http.server` im Repo-Ordner, dann http://localhost:8000

## Gästebuch

- `gaestebuch-worker/` – API als Cloudflare Worker mit D1-Datenbank
- `.github/workflows/deploy-gaestebuch.yml` – deployt den Worker bei Änderungen in `gaestebuch-worker/`
- Benötigte Repo-Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GB_ADMIN_PASSWORD`
- Moderation an/aus: `MODERATION` in `gaestebuch-worker/wrangler.toml`
- Adresse des Workers: `assets/gb-config.js`
- Verwaltung: `/gaestebuch/admin/`

## Gedanken (Blog)

- Gleicher Worker, Tabelle `thoughts` (`migrations/0002_thoughts.sql`)
- Anzeige: `/blog/`, Schreiben/Bearbeiten/Löschen: `/blog/schreiben/` (gleiches Admin-Passwort)

Lokal: `cd gaestebuch-worker && npm install && npx wrangler d1 migrations apply sandroleone-gaestebuch --local && npx wrangler dev`
(Admin-Passwort lokal in `.dev.vars`: `ADMIN_PASSWORD=...`), dann `/gaestebuch/?api=http://localhost:8787`

## Weiteres

- `datenschutz/` – Datenschutzerklärung & Impressum (Zettel an der Wand beim Eingang)
- Besucherzähler: Worker-Route `/counter`, Anzeige über `assets/counter.js` (`data-visits`)
- Ton im Gang: synthetisch per WebAudio, standardmässig aus
