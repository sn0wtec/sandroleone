# sandroleone.ch

Persönliche Webseite. Statisch, gehostet über GitHub Pages (`CNAME` → sandroleone.ch).

- `index.html` + `assets/gang.js` – der begehbare Gang (Raycaster, Vanilla JS, keine Abhängigkeiten)
- `assets/retro.css` – Oldschool-Stil der Unterseiten
- `blog/`, `gaestebuch/`, `ueber-mich/`, `archiv/` – Unterseiten hinter den Türen
- `archiv/2025-sample/` – die ursprüngliche Testseite

Türen und Karte werden oben in `assets/gang.js` definiert (`map`, `DOORS`).
Lokal testen: `python3 -m http.server` im Repo-Ordner, dann http://localhost:8000
