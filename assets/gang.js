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
  const ZBUF = new Float32Array(W);

  const promptEl = document.getElementById('prompt');
  const fadeEl = document.getElementById('fade');

  // ---------- Ton (WebAudio, alles synthetisch, standardmässig aus) ----------
  const Sound = (() => {
    let ac = null, master = null, hum = null, noiseBuf = null;
    let on = false;
    try { on = localStorage.getItem('gang-sound') === 'on'; } catch (e) {}
    const btn = document.getElementById('sound');

    function init() {
      if (ac) return;
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // leises Brummen der Neonröhren
      hum = ac.createGain(); hum.gain.value = 0; hum.connect(master);
      for (const [f, v] of [[50, 0.012], [100, 0.006]]) {
        const o = ac.createOscillator(); o.frequency.value = f;
        const g = ac.createGain(); g.gain.value = v; o.connect(g); g.connect(hum); o.start();
      }
    }
    function noise(t, dur, freq, q, vol, type = 'lowpass') {
      const src = ac.createBufferSource(); src.buffer = noiseBuf;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    }
    function render() {
      if (!btn) return;
      btn.textContent = on ? '🔊 Ton an' : '🔇 Ton aus';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    function set(v) {
      on = v;
      try { localStorage.setItem('gang-sound', on ? 'on' : 'off'); } catch (e) {}
      if (on) { init(); ac.resume(); hum.gain.setTargetAtTime(1, ac.currentTime, 0.3); }
      else if (ac) hum.gain.setTargetAtTime(0, ac.currentTime, 0.1);
      render();
    }
    if (btn) btn.addEventListener('click', e => { e.stopPropagation(); set(!on); btn.blur(); });
    // Browser erlauben Ton erst nach einer Interaktion
    if (on) {
      const wake = () => { set(true); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
      addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    }
    render();

    const ready = () => on && ac && ac.state === 'running';
    return {
      get on() { return on; },
      step() {
        if (!ready()) return;
        const t = ac.currentTime;
        noise(t, 0.09, 420 + Math.random() * 160, 1.2, 0.5);
        noise(t + 0.01, 0.04, 2200, 0.8, 0.05, 'bandpass');
      },
      door() {
        if (!ready()) return;
        const t = ac.currentTime;
        // Knarren: Sägezahn mit Wackeln durch Bandpass
        const o = ac.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(70, t);
        o.frequency.linearRampToValueAtTime(130, t + 0.35);
        o.frequency.linearRampToValueAtTime(95, t + 0.55);
        const lfo = ac.createOscillator(); lfo.frequency.value = 23;
        const lg = ac.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
        g.gain.setValueAtTime(0.35, t + 0.45);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        o.connect(f); f.connect(g); g.connect(master);
        o.start(t); lfo.start(t); o.stop(t + 0.65); lfo.stop(t + 0.65);
        noise(t + 0.02, 0.06, 1500, 2, 0.25, 'bandpass');   // Klinke
      },
      locked() {
        if (!ready()) return;
        const t = ac.currentTime;
        for (let i = 0; i < 3; i++) noise(t + i * 0.09, 0.05, 1800 + i * 200, 3, 0.3, 'bandpass');
      },
      jump() {
        if (!ready()) return;
        noise(ac.currentTime, 0.06, 700, 1, 0.25);
      },
      land() {
        if (!ready()) return;
        const t = ac.currentTime;
        noise(t, 0.16, 260, 1.4, 0.9);
        noise(t, 0.05, 1600, 1, 0.08, 'bandpass');
      },
      paper() {
        if (!ready()) return;
        const t = ac.currentTime;
        noise(t, 0.25, 3500, 0.7, 0.12, 'highpass');
      }
    };
  })();

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
  map[1][3] = 4;                                // Zettel "Datenschutz" beim Eingang
  map[7][0] = 5; map[4][3] = 6; map[10][3] = 7; map[15][0] = 8;   // Bilderrahmen

  const DOORS = {
    10: { label: 'GEDANKEN', name: 'Gedanken', href: 'blog/', wood: [122, 62, 32] },
    11: { label: 'GÄSTEBUCH', name: 'Gästebuch', href: 'gaestebuch/', wood: [40, 84, 62] },
    12: { label: 'ÜBER MICH', name: 'Über mich', href: 'ueber-mich/', wood: [44, 58, 110] },
    13: { label: '???', name: '???', locked: true, wood: [70, 70, 70] },
    14: { label: 'ARCHIV', name: 'Archiv', href: 'archiv/', wood: [96, 30, 30] },
    15: null // rechte Hälfte, zeigt auf 14
  };
  DOORS[15] = DOORS[14];
  DOORS[4] = { name: 'Datenschutz', href: 'datenschutz/', verb: 'lesen', note: true };

  // Pflanzen (Sprites) – stehen am Rand, blockieren aber trotzdem
  const SPRITES = [
    { x: 2.76, y: 3.3 }, { x: 1.24, y: 8.4 }, { x: 2.76, y: 11.7 }, { x: 1.24, y: 15.55 }
  ];
  const SPRITE_R = 0.2;

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

  function texNote() {
    const c = makeCanvas(TEX, TEX), g = c.getContext('2d');
    drawBricks(g);
    g.save(); g.translate(64, 62); g.rotate(-0.04);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-27, -35, 58, 76);
    g.fillStyle = '#f4f1e6'; g.fillRect(-30, -38, 58, 76);
    g.fillStyle = '#1a1a1a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 11px "Courier New", monospace';
    g.fillText('DATEN-', -1, -24); g.fillText('SCHUTZ', -1, -13);
    g.fillStyle = '#9a9a9a';
    for (let i = 0; i < 6; i++) g.fillRect(-22, -2 + i * 6, 36 - (i % 3) * 7, 2);
    g.fillStyle = '#c62828'; g.beginPath(); g.arc(-1, -34, 3, 0, Math.PI * 2); g.fill();
    g.restore();
    noise(g, TEX, TEX, 10);
    return toTex(c);
  }

  // Bilderrahmen mit kleinen Pixel-Gemälden
  function texFrame(kind) {
    const c = makeCanvas(TEX, TEX), g = c.getContext('2d');
    drawBricks(g);
    const x0 = 24, y0 = 26, w = 80, h = 60;
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x0 - 4, y0 - 2, w + 12, h + 12);
    g.fillStyle = '#8a6a22'; g.fillRect(x0 - 8, y0 - 8, w + 16, h + 16);
    g.fillStyle = '#c9a24a'; g.fillRect(x0 - 6, y0 - 6, w + 12, h + 12);
    g.fillStyle = '#6e5418'; g.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    const sky = (a, b) => { const gr = g.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(x0, y0, w, h); };
    const ridge = (base, amp, color, s1) => {
      g.fillStyle = color; g.beginPath(); g.moveTo(x0, y0 + h);
      for (let x = 0; x <= w; x += 4) g.lineTo(x0 + x, y0 + base - Math.abs(Math.sin(x * s1 + base)) * amp - (x % 12 === 0 ? 3 : 0));
      g.lineTo(x0 + w, y0 + h); g.fill();
    };
    if (kind === 'berge' || kind === 'berge2') {
      sky(kind === 'berge' ? '#7fb6e8' : '#f2b880', kind === 'berge' ? '#d6ecff' : '#f7e1c0');
      ridge(36, 22, '#8c96a8', 0.07); ridge(44, 14, '#5d6b80', 0.11);
      g.fillStyle = '#f5f7fa';
      for (let x = 0; x < w; x += 2) { const y = 36 - Math.abs(Math.sin(x * 0.07 + 36)) * 22; if (y < 22) g.fillRect(x0 + x, y0 + y, 2, 3); }
      g.fillStyle = '#3d6b3a'; g.fillRect(x0, y0 + 50, w, 10);
    } else if (kind === 'meer') {
      sky('#ff9a5a', '#ffd27a');
      g.fillStyle = '#ffef9a'; g.beginPath(); g.arc(x0 + 52, y0 + 34, 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2b5f8a'; g.fillRect(x0, y0 + 36, w, 24);
      g.fillStyle = '#ffd27a'; for (let i = 0; i < 6; i++) g.fillRect(x0 + 44 - i, y0 + 38 + i * 3, 16 + i * 2, 1);
    } else { // nacht
      sky('#0b1030', '#26305e');
      g.fillStyle = '#fff';
      for (let i = 0; i < 40; i++) g.fillRect(x0 + rnd() * w, y0 + rnd() * 40, 1, 1);
      g.fillStyle = '#f5edc4'; g.beginPath(); g.arc(x0 + 60, y0 + 15, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26305e'; g.beginPath(); g.arc(x0 + 63, y0 + 13, 6, 0, Math.PI * 2); g.fill();
      ridge(48, 10, '#111628', 0.09);
    }
    g.restore();
    noise(g, TEX, TEX, 8);
    return toTex(c);
  }

  function texPlant() {
    const c = makeCanvas(TEX, TEX), g = c.getContext('2d');
    // Blätter
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, len = 28 + rnd() * 30;
      const bx = 64, by = 92;
      const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
      g.strokeStyle = '#2e5a24'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + (ex - bx) * 0.3, ey + 10, ex, ey); g.stroke();
      g.fillStyle = rnd() > 0.5 ? '#4f8f3a' : '#3d7a2e';
      g.beginPath(); g.ellipse(ex, ey, 8, 4, a, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7cc05a'; g.fillRect(ex - 2, ey - 1, 3, 1);
    }
    // Topf
    g.fillStyle = '#a4502c';
    g.beginPath(); g.moveTo(42, 96); g.lineTo(86, 96); g.lineTo(80, 127); g.lineTo(48, 127); g.fill();
    g.fillStyle = '#c4653a'; g.fillRect(40, 92, 48, 7);
    g.fillStyle = '#7a3a1e'; g.fillRect(48, 100, 2, 26);
    // Pixel ohne Farbe bleiben transparent
    const d = g.getImageData(0, 0, TEX, TEX);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 128 ? 255 : 0;
    g.putImageData(d, 0, 0);
    return toTex(c);
  }

  const T = {};
  T[1] = texBricks();
  T[2] = texPoster('SANDRO');
  T[3] = texPoster('LEONE');
  for (const id of [10, 11, 12, 13]) T[id] = texDoor(DOORS[id]);
  // Von innen gesehen liegt x=2 links und x=1 rechts
  [T[14], T[15]] = texDoubleDoor(DOORS[14]);
  T[4] = texNote();
  T[5] = texFrame('berge'); T[6] = texFrame('meer'); T[7] = texFrame('nacht'); T[8] = texFrame('berge2');
  const TPLANT = texPlant();
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
  let jumpZ = 0, jumpV = 0;            // Sprunghöhe (Felder) und -geschwindigkeit
  const JUMP_V = 2.3, GRAVITY = 9.5;
  let focus = null;      // Tür, vor der man gerade steht
  let leaving = false;
  let lockedMsgUntil = 0;

  function solid(x, y) {
    const cx = x | 0, cy = y | 0;
    if (cy < 0 || cy >= MAP_H || cx < 0 || cx >= MAP_W) return true;
    if (map[cy][cx] !== 0) return true;
    for (const s of SPRITES) { const dx = x - s.x, dy = y - s.y; if (dx * dx + dy * dy < SPRITE_R * SPRITE_R) return true; }
    return false;
  }
  function tryMove(dx, dy) {
    const nx = px + dx, ny = py + dy;
    if (!solid(nx + Math.sign(dx) * RADIUS, py - RADIUS * 0.7) && !solid(nx + Math.sign(dx) * RADIUS, py + RADIUS * 0.7)) px = nx;
    if (!solid(px - RADIUS * 0.7, ny + Math.sign(dy) * RADIUS) && !solid(px + RADIUS * 0.7, ny + Math.sign(dy) * RADIUS)) py = ny;
  }

  function jump() {
    if (leaving || jumpZ > 0 || jumpV !== 0) return;
    jumpV = JUMP_V;
    Sound.jump();
  }

  function update(dt) {
    if (jumpV !== 0 || jumpZ > 0) {
      jumpV -= GRAVITY * dt;
      jumpZ += jumpV * dt;
      if (jumpZ <= 0) { jumpZ = 0; jumpV = 0; Sound.land(); }
    }
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
      const before = Math.floor(bobPhase / Math.PI);
      bobPhase += dt * 9;
      if (Math.floor(bobPhase / Math.PI) !== before) Sound.step();
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
    const camH = 0.5 + jumpZ;          // Augenhöhe: 0.5 = halbe Wandhöhe
    const camZ = camH * K, ceilZ = (1 - camH) * K;

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
      const rowDist = ceilZ / p;
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
    const zBuf = ZBUF;
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
      zBuf[x] = perp;
      let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      const hitX = side === 0 ? (stepX > 0 ? mx : mx + 1) : px + perp * rdx;
      const hitY = side === 1 ? (stepY > 0 ? my : my + 1) : py + perp * rdy;
      wallX -= Math.floor(wallX);
      if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) wallX = 1 - wallX;
      const tx = (wallX * TEX) | 0;

      if (x === W >> 1 && DOORS[tile] && perp < OPEN_DIST) focus = DOORS[tile];

      const lineH = K / perp;
      const top = horizon - (1 - camH) * lineH;
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

    // Pflanzen (Sprites), von hinten nach vorne
    const invDet = 1 / (plX * dirY - dirX * plY);
    const order = SPRITES.map(s => ({ s, d: (px - s.x) ** 2 + (py - s.y) ** 2 })).sort((a, b) => b.d - a.d);
    for (const { s } of order) {
      const sx = s.x - px, sy = s.y - py;
      const tX = invDet * (dirY * sx - dirX * sy);
      const tY = invDet * (-plY * sx + plX * sy);
      if (tY <= 0.1) continue;
      const screenX = (W / 2) * (1 + tX / tY);
      const size = K / tY;                       // Wandhöhe in dieser Distanz
      const sprH = size * 0.62, sprW = sprH;
      const floorY = horizon + camH * size;
      const top = floorY - sprH;
      const xs = Math.max(0, Math.ceil(screenX - sprW / 2)), xe = Math.min(W, Math.ceil(screenX + sprW / 2));
      const ys = Math.max(0, Math.ceil(top)), ye = Math.min(H, Math.ceil(floorY));
      const f = lightAt(s.x, s.y) / (1 + tY * tY * 0.012);
      for (let x = xs; x < xe; x++) {
        if (tY >= zBuf[x]) continue;
        const tx = (((x - (screenX - sprW / 2)) * TEX / sprW) | 0) & (TEX - 1);
        for (let y = ys; y < ye; y++) {
          const ty = (((y - top) * TEX / sprH) | 0) & (TEX - 1);
          const c = TPLANT[ty * TEX + tx];
          if ((c >>> 24) === 0) continue;
          buf[y * W + x] = shade(c, f);
        }
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
        : (isTouch ? `Tippe auf «Öffnen»: ${focus.name}` : `[E] ${focus.name} ${focus.verb || 'betreten'}`);
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
    if (focus.locked) { lockedMsgUntil = performance.now() + 1600; Sound.locked(); return; }
    leaving = true;
    if (focus.note) Sound.paper(); else Sound.door();
    try { sessionStorage.setItem('gang-pos', JSON.stringify({ x: px, y: py, a: pa })); } catch (e) { /* egal */ }
    fadeEl.classList.add('on');
    const href = focus.href;
    setTimeout(() => { location.href = href; }, Sound.on ? 650 : 420);
  }

  // Zurück-Navigation (bfcache): Überblendung zurücksetzen
  addEventListener('pageshow', () => { leaving = false; fadeEl.classList.remove('on'); });

  // ---------- Eingabe ----------
  addEventListener('keydown', e => {
    if (e.code === 'Space') { if (!e.repeat) jump(); e.preventDefault(); return; }
    if (e.code === 'KeyE' || e.code === 'Enter') { openFocused(); e.preventDefault(); return; }
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
    const on = e => { e.preventDefault(); if (k === 'open') openFocused(); else if (k === 'jump') jump(); else keys[k] = true; };
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
