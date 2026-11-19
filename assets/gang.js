/* sandroleone.ch – der Gang
 * Kleiner Raycaster (Wolfenstein-Stil) in Vanilla JS.
 * Jede Tür führt auf eine echte Unterseite.
 */
(() => {
  'use strict';

  // ---------- Grundeinstellungen ----------
  const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = 320, H = 180;          // interne Auflösung (wird pixelig hochskaliert)
  const TEX = 128;                 // Texturgrösse
  const PLANE = 0.72;              // Sichtfeld
  const K = W / (2 * PLANE);       // Projektionsfaktor (quadratische Wände)
  const MOVE_SPEED = 2.4;          // Felder pro Sekunde
  const TURN_SPEED = 2.2;          // rad pro Sekunde
  const RADIUS = 0.22;             // Kollisionsradius
  const OPEN_DIST = 1.7;           // ab dieser Distanz lässt sich eine Tür öffnen

  const canvas = document.getElementById('view');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);

  const promptEl = document.getElementById('prompt');
  const fadeEl = document.getElementById('fade');

  // ---------- Karte ----------
  // 0 = frei, 1 = Backstein, 2/3 = Plakat, 10+ = Türen
  const MAP_W = 4, MAP_H = 17;
  const map = [];
  for (let y = 0; y < MAP_H; y++) map.push(y === 0 || y === MAP_H - 1 ? [1, 1, 1, 1] : [1, 0, 0, 1]);
  map[0][1] = 2; map[0][2] = 3;                 // Plakat "SANDRO LEONE" hinter dem Start
  map[4][0] = 10;                               // Blog
  map[7][3] = 11;                               // Gästebuch
  map[10][0] = 12;                              // Über mich
  map[13][3] = 13;                              // ??? (verschlossen)
  map[16][2] = 14; map[16][1] = 15;             // Doppeltür Archiv (links/rechts)

  const DOORS = {
    10: { label: 'GEDANKEN', name: 'Gedanken', href: 'blog/', wood: [122, 62, 32] },
    11: { label: 'GÄSTEBUCH', name: 'Gästebuch', href: 'gaestebuch/', wood: [40, 84, 62] },
    12: { label: 'ÜBER MICH', name: 'Über mich', href: 'ueber-mich/', wood: [44, 58, 110] },
    13: { label: '???', name: '???', locked: true, wood: [70, 70, 70] },
    14: { label: 'ARCHIV', name: 'Archiv', href: 'archiv/', wood: [96, 30, 30] },
    15: null // rechte Hälfte, zeigt auf 14
  };
  DOORS[15] = DOORS[14];

  const LAMPS = [
    { x: 2, y: 2.5 }, { x: 2, y: 6.5 }, { x: 2, y: 10.5, flicker: true }, { x: 2, y: 14.5 }
  ];

  // ---------- Texturen (prozedural) ----------
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function toTex(c, sx = 0) {
    const d = c.getContext('2d').getImageData(sx, 0, TEX, TEX).data;
    return new Uint32Array(d.buffer.slice(0));
  }
  function noise(g, w, h, amount) {
    const id = g.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * amount;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(id, 0, 0);
  }
  const rgb = (a, f = 1) => `rgb(${a[0] * f | 0},${a[1] * f | 0},${a[2] * f | 0})`;

  function drawBricks(g) {
    g.fillStyle = '#4a4440';
    g.fillRect(0, 0, TEX, TEX);
    const bh = 16, bw = 32;
    for (let row = 0; row < TEX / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < TEX + bw; x += bw) {
        const t = 0.8 + rnd() * 0.35;
        g.fillStyle = rgb([134, 64, 48], t);
        g.fillRect(x + off + 1, row * bh + 1, bw - 2, bh - 2);
      }
    }
    noise(g, TEX, TEX, 26);
  }

  function texBricks() {
    const c = makeCanvas(TEX, TEX), g = c.getContext('2d');
    drawBricks(g);
    return toTex(c);
  }

  function texPoster(text) {
    const c = makeCanvas(TEX, TEX), g = c.getContext('2d');
    drawBricks(g);
    g.fillStyle = '#e8dcb8';
    g.fillRect(14, 22, 100, 76);
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 2;
    g.strokeRect(18, 26, 92, 68);
    g.fillStyle = '#1a1a1a';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, text, 64, 60, 84, 30);
    g.fillStyle = '#b8b8b8';
    for (const [x, y] of [[17, 25], [111, 25], [17, 95], [111, 95]]) g.fillRect(x - 1, y - 1, 3, 3);
    noise(g, TEX, TEX, 14);
    return toTex(c);
  }

  function fitText(g, text, x, y, maxW, size) {
    let s = size;
    do {
      g.font = `bold ${s}px "Courier New", Courier, monospace`;
      s--;
    } while (g.measureText(text).width > maxW && s > 6);
    g.fillText(text, x, y);
  }

  function drawDoor(g, x0, w, door, knobSide) {
    const wood = door.wood;
    // Zarge
    g.fillStyle = '#2b2522';
    g.fillRect(x0, 0, w, TEX);
    // Türblatt
    g.fillStyle = rgb(wood);
    g.fillRect(x0 + 10, 8, w - 20, TEX - 8);
    // Maserung
    for (let i = 0; i < 40; i++) {
      g.fillStyle = rgb(wood, 0.75 + rnd() * 0.4);
      g.fillRect(x0 + 10 + rnd() * (w - 22), 8, 1, TEX - 8);
    }
    // Kassetten
    g.strokeStyle = rgb(wood, 0.55); g.lineWidth = 3;
    g.strokeRect(x0 + 20, 52, w - 40, 30);
    g.strokeRect(x0 + 20, 90, w - 40, 30);
    g.strokeStyle = rgb(wood, 1.3); g.lineWidth = 1;
    g.strokeRect(x0 + 22, 54, w - 44, 26);
    g.strokeRect(x0 + 22, 92, w - 44, 26);
    // Türknauf
    g.fillStyle = '#d4a93a';
    const kx = knobSide === 'left' ? x0 + 18 : x0 + w - 18;
    g.beginPath(); g.arc(kx, 76, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff3b0'; g.fillRect(kx - 2, 74, 2, 2);
  }

  function drawPlate(g, cx, text) {
    g.fillStyle = '#c9a24a';
    g.fillRect(cx - 44, 18, 88, 26);
    g.fillStyle = '#8a6a22';
    g.fillRect(cx - 44, 42, 88, 2);
    g.fillRect(cx + 42, 18, 2, 26);
    g.fillStyle = '#1b140a';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, text, cx, 32, 80, 16);
  }

  function texDoor(door) {
    const c = makeCanvas(TEX, TEX), g = c.getContext('2d');
    drawBricks(g);
    drawDoor(g, 14, TEX - 28, door, 'right');
    drawPlate(g, 64, door.label);
    noise(g, TEX, TEX, 10);
    return toTex(c);
  }

  function texDoubleDoor(door) {
    const c = makeCanvas(TEX * 2, TEX), g = c.getContext('2d');
    g.fillStyle = '#4a4440'; g.fillRect(0, 0, TEX * 2, TEX);
    drawDoor(g, 0, TEX, door, 'right');
    drawDoor(g, TEX, TEX, door, 'left');
    g.fillStyle = '#1a1512'; g.fillRect(TEX - 1, 8, 2, TEX);
    drawPlate(g, TEX, door.label);
    noise(g, TEX * 2, TEX, 10);
    return [toTex(c, 0), toTex(c, TEX)];
  }

  function texFloor() {
    const c = makeCanvas(TEX, TEX), g = c.getContext('2d');
    const half = TEX / 2;
    g.fillStyle = '#5e5a52'; g.fillRect(0, 0, TEX, TEX);
    g.fillStyle = '#3a3733';
    g.fillRect(0, 0, half, half); g.fillRect(half, half, half, half);
    g.fillStyle = '#26231f';
    g.fillRect(0, 0, TEX, 1); g.fillRect(0, 0, 1, TEX);
    g.fillRect(0, half, TEX, 1); g.fillRect(half, 0, 1, TEX);
    noise(g, TEX, TEX, 18);
    return toTex(c);
  }

  function texCeil() {
    const c = makeCanvas(TEX, TEX), g = c.getContext('2d');
    g.fillStyle = '#6b6a66'; g.fillRect(0, 0, TEX, TEX);
    g.fillStyle = '#3d3c39';
    g.fillRect(0, 0, TEX, 2); g.fillRect(0, 0, 2, TEX);
    for (let i = 0; i < 160; i++) { g.fillStyle = '#55544f'; g.fillRect(rnd() * TEX, rnd() * TEX, 2, 2); }
    noise(g, TEX, TEX, 10);
    return toTex(c);
  }

  const T = {};
  T[1] = texBricks();
  T[2] = texPoster('SANDRO');
  T[3] = texPoster('LEONE');
  for (const id of [10, 11, 12, 13]) T[id] = texDoor(DOORS[id]);
  // Von innen gesehen liegt x=2 links und x=1 rechts
  [T[14], T[15]] = texDoubleDoor(DOORS[14]);
  const TFLOOR = texFloor();
  const TCEIL = texCeil();

  // ---------- Licht ----------
  let time = 0;
  // Bewusst KEIN Flackern: Eine "müde" Lampe dimmt nur langsam und weich
  // (unter 0.2 Hz, nie unter ~65 %). Keine Blitze, kein harter Wechsel (WCAG 2.3.1).
  // Bei "Bewegung reduzieren" im Betriebssystem leuchtet sie konstant.
  function flick(t) {
    if (REDUCED_MOTION) return 1;
    return 0.83 + 0.1 * Math.sin(t * 1.1) + 0.06 * Math.sin(t * 0.43 + 1);
  }
  const lampPower = new Float32Array(LAMPS.length);
  function lightAt(x, y) {
    let l = 0.16;
    for (let i = 0; i < LAMPS.length; i++) {
      const dx = x - LAMPS[i].x, dy = y - LAMPS[i].y;
      l += lampPower[i] * Math.exp(-(dx * dx + dy * dy) / 3.4);
    }
    return l > 1.3 ? 1.3 : l;
  }

  function shade(c, f) {
    let r = (c & 255) * f, g = ((c >> 8) & 255) * f, b = ((c >> 16) & 255) * f;
    if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
    return 0xff000000 | (b << 16) | (g << 8) | r;
  }

  // ---------- Spieler ----------
  let px = 2, py = 1.6, pa = Math.PI / 2;   // Start: Blick den Gang hinunter
  try {
    const s = JSON.parse(sessionStorage.getItem('gang-pos') || 'null');
    if (s && map[s.y | 0] && map[s.y | 0][s.x | 0] === 0) { px = s.x; py = s.y; pa = s.a; }
  } catch (e) { /* Speicher nicht verfügbar – egal */ }

  const keys = Object.create(null);
  let lookDelta = 0;
  let bobPhase = 0;
  let focus = null;      // Tür, vor der man gerade steht
  let leaving = false;
  let lockedMsgUntil = 0;

  function solid(x, y) {
    const cx = x | 0, cy = y | 0;
    if (cy < 0 || cy >= MAP_H || cx < 0 || cx >= MAP_W) return true;
    return map[cy][cx] !== 0;
  }
  function tryMove(dx, dy) {
    const nx = px + dx, ny = py + dy;
    if (!solid(nx + Math.sign(dx) * RADIUS, py - RADIUS * 0.7) && !solid(nx + Math.sign(dx) * RADIUS, py + RADIUS * 0.7)) px = nx;
    if (!solid(px - RADIUS * 0.7, ny + Math.sign(dy) * RADIUS) && !solid(px + RADIUS * 0.7, ny + Math.sign(dy) * RADIUS)) py = ny;
  }

  function update(dt) {
    if (leaving) return;
    const turn = (keys.ArrowRight || keys.turnR ? 1 : 0) - (keys.ArrowLeft || keys.turnL ? 1 : 0);
    pa += turn * TURN_SPEED * dt + lookDelta;
    lookDelta = 0;

    const fwd = (keys.KeyW || keys.ArrowUp || keys.fwd ? 1 : 0) - (keys.KeyS || keys.ArrowDown || keys.back ? 1 : 0);
    const str = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const cos = Math.cos(pa), sin = Math.sin(pa);
    let mx = cos * fwd - sin * str, my = sin * fwd + cos * str;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len; my /= len;
      const step = MOVE_SPEED * dt;
      tryMove(mx * step, my * step);
      bobPhase += dt * 9;
    } else {
      bobPhase *= 0.9;
    }
  }

  // ---------- Rendern ----------
  function render() {
    const dirX = Math.cos(pa), dirY = Math.sin(pa);
    const plX = -dirY * PLANE, plY = dirX * PLANE;
    const horizon = (H / 2 + Math.sin(bobPhase) * (REDUCED_MOTION ? 0 : 1.6)) | 0;

    for (let i = 0; i < LAMPS.length; i++) lampPower[i] = LAMPS[i].flicker ? flick(time) : 1;

    const rx0 = dirX - plX, ry0 = dirY - plY, rx1 = dirX + plX, ry1 = dirY + plY;
    const camZ = 0.5 * K;

    // Boden
    for (let y = horizon + 1; y < H; y++) {
      const rowDist = camZ / (y - horizon);
      const sx = rowDist * (rx1 - rx0) / W, sy = rowDist * (ry1 - ry0) / W;
      let fx = px + rowDist * rx0, fy = py + rowDist * ry0;
      const fog = 1 / (1 + rowDist * rowDist * 0.012);
      const row = y * W;
      for (let x = 0; x < W; x++, fx += sx, fy += sy) {
        const tx = ((fx - Math.floor(fx)) * TEX) & (TEX - 1);
        const ty = ((fy - Math.floor(fy)) * TEX) & (TEX - 1);
        buf[row + x] = shade(TFLOOR[ty * TEX + tx], lightAt(fx, fy) * fog);
      }
    }
    // Decke
    for (let y = horizon; y >= 0; y--) {
      const p = horizon - y + 1;
      const rowDist = camZ / p;
      const sx = rowDist * (rx1 - rx0) / W, sy = rowDist * (ry1 - ry0) / W;
      let fx = px + rowDist * rx0, fy = py + rowDist * ry0;
      const fog = 1 / (1 + rowDist * rowDist * 0.012);
      const row = y * W;
      for (let x = 0; x < W; x++, fx += sx, fy += sy) {
        // Leuchtpanele
        let lit = -1;
        for (let i = 0; i < LAMPS.length; i++) {
          if (Math.abs(fx - LAMPS[i].x) < 0.32 && Math.abs(fy - LAMPS[i].y) < 0.16) { lit = i; break; }
        }
        if (lit >= 0) {
          const v = 0.35 + 0.65 * lampPower[lit];
          buf[row + x] = shade(0xffd8f4ff, v * (0.6 + 0.4 * fog));
          continue;
        }
        const tx = ((fx - Math.floor(fx)) * TEX) & (TEX - 1);
        const ty = ((fy - Math.floor(fy)) * TEX) & (TEX - 1);
        buf[row + x] = shade(TCEIL[ty * TEX + tx], lightAt(fx, fy) * fog * 0.85);
      }
    }

    // Wände (DDA)
    focus = null;
    for (let x = 0; x < W; x++) {
      const camX = 2 * x / W - 1;
      const rdx = dirX + plX * camX, rdy = dirY + plY * camX;
      let mx = px | 0, my = py | 0;
      const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
      let stepX, stepY, sdx, sdy;
      if (rdx < 0) { stepX = -1; sdx = (px - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - px) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (py - my) * ddy; } else { stepY = 1; sdy = (my + 1 - py) * ddy; }
      let side = 0, tile = 0;
      for (let n = 0; n < 64; n++) {
        if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
        if (my < 0 || my >= MAP_H || mx < 0 || mx >= MAP_W) { tile = 1; break; }
        tile = map[my][mx];
        if (tile) break;
      }
      const perp = side === 0 ? sdx - ddx : sdy - ddy;
      let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      const hitX = side === 0 ? (stepX > 0 ? mx : mx + 1) : px + perp * rdx;
      const hitY = side === 1 ? (stepY > 0 ? my : my + 1) : py + perp * rdy;
      wallX -= Math.floor(wallX);
      if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) wallX = 1 - wallX;
      const tx = (wallX * TEX) | 0;

      if (x === W >> 1 && DOORS[tile] && perp < OPEN_DIST) focus = DOORS[tile];

      const lineH = K / perp;
      const top = horizon - lineH / 2;
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(H, Math.ceil(top + lineH));
      const tex = T[tile] || T[1];
      const lightBase = lightAt(hitX + (side === 0 ? -stepX * 0.3 : 0), hitY + (side === 1 ? -stepY * 0.3 : 0));
      const fog = 1 / (1 + perp * perp * 0.012);
      const f = lightBase * fog * (side === 1 ? 0.82 : 1);
      const step = TEX / lineH;
      let tpos = (y0 - top) * step;
      for (let y = y0; y < y1; y++, tpos += step) {
        const ty = (tpos | 0) & (TEX - 1);
        buf[y * W + x] = shade(tex[ty * TEX + tx], f);
      }
    }

    // Scanlines: jede zweite Zeile etwas dunkler
    for (let y = 0; y < H; y += 2) {
      const row = y * W;
      for (let x = 0; x < W; x++) buf[row + x] = shade(buf[row + x], 0.82);
    }
    ctx.putImageData(img, 0, 0);
    updatePrompt();
  }

  const isTouch = matchMedia('(pointer: coarse)').matches;
  let lastPrompt = '';
  function updatePrompt() {
    let text = '';
    if (performance.now() < lockedMsgUntil) text = 'Verschlossen. Noch.';
    else if (focus) {
      text = focus.locked ? '??? – verschlossen'
        : (isTouch ? `Tippe auf «Öffnen»: ${focus.name}` : `[E] ${focus.name} betreten`);
    }
    if (text !== lastPrompt) {
      promptEl.textContent = text;
      promptEl.hidden = !text;
      document.body.classList.toggle('can-open', !!(focus && !focus.locked));
      lastPrompt = text;
    }
  }

  function openFocused() {
    if (!focus || leaving) return;
    if (focus.locked) { lockedMsgUntil = performance.now() + 1600; return; }
    leaving = true;
    try { sessionStorage.setItem('gang-pos', JSON.stringify({ x: px, y: py, a: pa })); } catch (e) { /* egal */ }
    fadeEl.classList.add('on');
    const href = focus.href;
    setTimeout(() => { location.href = href; }, 420);
  }

  // Zurück-Navigation (bfcache): Überblendung zurücksetzen
  addEventListener('pageshow', () => { leaving = false; fadeEl.classList.remove('on'); });

  // ---------- Eingabe ----------
  addEventListener('keydown', e => {
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { openFocused(); e.preventDefault(); return; }
    if (/^(Arrow|Key[WASD])/.test(e.code)) { keys[e.code] = true; e.preventDefault(); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // Maus/Touch ziehen zum Umschauen, Klick öffnet
  let dragging = false, dragX = 0, dragMoved = 0;
  canvas.addEventListener('pointerdown', e => { dragging = true; dragX = e.clientX; dragMoved = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - dragX; dragX = e.clientX; dragMoved += Math.abs(dx);
    lookDelta += dx * 0.006;
  });
  canvas.addEventListener('pointerup', () => { dragging = false; if (dragMoved < 6) openFocused(); });

  // Touch-Buttons
  document.querySelectorAll('[data-key]').forEach(btn => {
    const k = btn.dataset.key;
    const on = e => { e.preventDefault(); if (k === 'open') openFocused(); else keys[k] = true; };
    const off = e => { e.preventDefault(); keys[k] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  });

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; time += dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Für Tests
  window.__gang = { get pos() { return { px, py, pa }; }, set(x, y, a) { px = x; py = y; pa = a; }, get focus() { return focus; } };
})();
