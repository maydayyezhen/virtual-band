/** Canvas artwork extracted from the user-supplied queen-bohemian-midi-lightshow (1).html.
 * Keeps the seven acts and independent wing compositions. Uses the application's MusicAnalysis;
 * no reference MIDI parser, audio engine, lighting controller, camera or animation loop is imported.
 * Factory scope gives each screen ownership of its drawing caches.
 */
export function createMidiTheatre(analysis) {
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = v => { v = clamp(v); return v * v * (3 - 2 * v); };
  const fract = v => v - Math.floor(v);
  const noise = n => fract(Math.sin(n * 127.13 + 41.7) * 43758.5453);
  const C = { ink: '#090f19', gold: '#b9945a', ivory: '#e8d9b5', red: '#852537', redDark: '#351523', blue: '#244e60' };
  const paths = new Map();
  const glowTiles = new Map();
  function shape(c, data, fill, stroke, width = 1) {
    let p = paths.get(data);
    if (!p) { p = new Path2D(data); paths.set(data, p); }
    if (fill) { c.fillStyle = fill; c.fill(p); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(p); }
  }
  function ellipse(c, x, y, rx, ry, color, angle = 0) {
    c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, TAU); c.fill();
  }
  function canvas(w, h) { const p = document.createElement('canvas'); p.width = w; p.height = h; return p; }
  function gradient(c, x1, y1, x2, y2, colors) {
    const g = c.createLinearGradient(x1, y1, x2, y2);
    colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color)); return g;
  }
  function glow(c, x, y, radius, color) {
    let p = glowTiles.get(color);
    if (!p) {
      p = canvas(256, 256); const ctx = p.getContext('2d'), g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256); glowTiles.set(color, p);
    }
    c.drawImage(p, x - radius, y - radius, radius * 2, radius * 2);
  }
  function arch(c, x, y, w, h) {
    c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w * .52);
    c.bezierCurveTo(x, y + w * .17, x + w * .2, y, x + w * .5, y);
    c.bezierCurveTo(x + w * .8, y, x + w, y + w * .17, x + w, y + w * .52);
    c.lineTo(x + w, y + h); c.closePath();
  }
  function paper(c, w, h, seed = 1) {
    c.save(); c.globalAlpha = .09;
    for (let i = 0; i < 2500; i++) {
      const x = noise(i + seed) * w, y = noise(i * 3 + seed + 3) * h;
      c.fillStyle = i % 3 ? '#071019' : '#fff0c5';
      c.fillRect(x, y, .7 + noise(i + 10) * 2, .5 + noise(i + 40));
    }
    c.restore();
  }
  function moon(c, x, y, r, opacity = 1) {
    c.save(); c.globalAlpha *= opacity;
    glow(c, x, y, r * 2.2, '#e9dcb926');
    ellipse(c, x, y, r, r, gradient(c, x - r, y - r, x + r, y + r, ['#f0e4bc', '#b1beb0']));
    c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
    for (let i = 0; i < 14; i++) ellipse(c, x + (noise(i + 52) - .5) * r * 1.8, y + (noise(i + 11) - .5) * r * 1.7, r * (.07 + noise(i + 80) * .21), r * .07, '#768d8720', i);
    c.restore(); c.restore();
  }
  function clouds(c, w, h, time, color, opacity = 1) {
    c.save(); c.globalAlpha *= opacity; c.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const x = ((i * w * .34 + time * (4 + i) + w * 2) % (w * 1.7)) - w * .35;
      const y = h * (.17 + i * .115), s = .7 + i * .24;
      c.save(); c.translate(x, y); c.scale(s, s);
      shape(c, 'M -170 24 C -146 7 -138 4 -115 9 C -97 -24 -60 -25 -40 -10 C -25 -59 26 -63 55 -29 C 83 -43 116 -25 125 1 C 157 -7 190 14 211 26 C 113 33 -72 39 -170 24 Z', color);
      c.restore();
    }
    c.restore();
  }
  function chair(c, x, floor, height, alpha = 1) {
    c.save(); c.translate(x, floor); c.scale(height / 150, height / 150); c.globalAlpha *= alpha;
    ellipse(c, 1, 2, 56, 8, '#05091299');
    shape(c, 'M -33 -68 L -41 -4 L -32 0 L -19 -66 M 25 -69 L 35 0 L 43 0 L 40 -69', '#412b22', '#ad7d48', 2);
    shape(c, 'M -40 -66 L -37 -145 Q 0 -172 40 -145 L 43 -64 L 32 -66 L 28 -137 Q 0 -151 -25 -136 L -25 -66 Z', '#7f5131', '#c49555', 1.7);
    shape(c, 'M -27 -133 Q 0 -146 29 -133 L 28 -93 Q 0 -108 -28 -93 Z', '#472c27', '#a57748', 2);
    shape(c, 'M -46 -72 Q 0 -91 48 -71 L 47 -58 Q -1 -50 -46 -61 Z', '#9e6341', '#d6a868', 1.5);
    shape(c, 'M -29 -126 Q 0 -117 29 -126 M 0 -142 L 0 -101', null, '#c49a58', 1.8);
    c.restore();
  }
  function candle(c, x, floor, height, breath, time) {
    c.save(); c.translate(x, floor); c.scale(height / 180, height / 180);
    const flick = Math.sin(time * 4.1) * 2 + breath * 5;
    glow(c, 0, -159, 89 + breath * 14, '#ecb35646');
    shape(c, 'M -30 0 Q -20 -14 -7 -12 L -5 -61 L -18 -66 L -21 -79 L 21 -79 L 18 -66 L 5 -61 L 7 -12 Q 20 -14 30 0 Z', '#ad8346', '#e0c58a', 1.5);
    shape(c, 'M -9 -79 L -9 -145 Q -5 -154 1 -145 Q 4 -151 9 -145 L 9 -79 Z', '#e3cea4');
    shape(c, 'M -8 -142 L -7 -124 Q -2 -120 -1 -132 L 0 -146', '#fff0cf');
    c.translate(flick * .28, 0); c.scale(1, 1 + breath * .025);
    shape(c, 'M 0 -145 C -21 -160 1 -167 3 -193 C 6 -176 22 -160 0 -145 Z', '#efbe6a');
    shape(c, 'M 0 -146 C -7 -155 0 -160 2 -173 C 10 -159 8 -151 0 -146 Z', '#fff1c4');
    c.restore();
  }
  function person(c, x, foot, height, options = {}) {
    const o = options, p = o.phase || 0, run = o.run ? 1 : 0, sit = o.sit ? 1 : 0;
    const dark = o.shadow ? '#050b15' : '#101b26', rim = o.shadow ? '#263a46' : '#9c8968';
    c.save(); c.translate(x, foot - height); c.scale((o.facing || 1) * height / 300, height / 300);
    c.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    c.translate(run * Math.sin(p * 2) * 2, run * Math.cos(p * 2) * 3);
    const leg = (side, behind) => {
      const swing = Math.sin(p + side * Math.PI), hipX = side ? 13 : -12;
      const kneeX = sit ? 61 : hipX + run * swing * 42;
      const kneeY = sit ? 213 : 238 - run * Math.max(0, -swing) * 25;
      const ankleX = sit ? 60 + side * 17 : hipX + run * swing * 72;
      const ankleY = 287 - run * Math.max(0, -swing) * 28;
      c.strokeStyle = behind ? '#0a121d' : dark; c.lineWidth = 19; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(hipX, 173); c.lineTo(kneeX, kneeY); c.lineTo(ankleX, ankleY); c.stroke();
      c.save(); c.translate(ankleX, ankleY);
      shape(c, 'M -10 -4 L 10 -4 Q 15 3 30 5 L 32 12 L -12 12 Z', behind ? '#070d16' : '#11161c'); c.restore();
      if (!o.shadow) { c.strokeStyle = '#b9a17a55'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hipX - 6, 191); c.lineTo(kneeX - 5, kneeY); c.lineTo(ankleX - 4, ankleY - 8); c.stroke(); }
    };
    leg(0, true);
    c.save(); c.translate(0, 87); c.rotate(run * -.18 + (o.lean || 0));
    shape(c, 'M -18 -11 Q -43 -5 -45 24 L -36 72 L -48 110 Q -14 125 29 106 L 29 30 Q 30 -4 8 -9 Z', dark, rim, o.shadow ? .5 : 1.3);
    if (!o.shadow) {
      shape(c, 'M -9 -9 L 13 -7 L 7 41 L -3 29 Z', '#e1d3af');
      shape(c, 'M -16 -11 L -1 39 L -17 26 L -26 9 Z M 13 -10 L 21 10 L 9 21 L 5 39 Z', '#35414a');
      shape(c, 'M 3 0 L 10 8 L 5 17 L 8 43 L 0 55 L -3 19 L 0 9 Z', '#ac4b48');
      c.strokeStyle = '#a9977433'; c.lineWidth = 1; c.beginPath(); c.moveTo(-28, 23); c.lineTo(-26, 97); c.stroke();
    }
    c.restore();
    leg(1, false);
    c.save(); c.translate(0, 78); c.rotate((o.lean || 0) + run * -.12);
    shape(c, 'M -13 -16 L 7 -17 L 8 7 L -9 6 Z', o.shadow ? dark : '#b69773');
    c.translate(0, -73);
    shape(c, 'M -21 43 C -32 15 -15 -8 6 1 C 22 6 22 17 22 29 L 31 39 Q 35 43 25 45 L 25 54 Q 20 66 6 65 L -5 62 L -16 55 Z', o.shadow ? dark : '#d4ba91', o.shadow ? null : '#ead8b055', 1);
    shape(c, 'M -22 47 C -34 16 -19 -8 8 -1 C 24 0 28 13 23 28 L 12 23 L 4 31 L -5 24 L -12 31 L -12 51 Z', '#080f19');
    if (!o.shadow) { ellipse(c, 14, 34, 2.2, 1.4, '#13232d'); shape(c, 'M 23 51 L 17 52 M -8 41 Q -16 34 -15 46 Q -13 52 -8 50', null, '#755d48', 1.7); }
    c.restore();
    const ax = sit ? 51 : 5 + run * Math.sin(p + Math.PI) * 38;
    const ay = sit ? 176 : 167 - run * Math.abs(Math.sin(p)) * 19;
    c.strokeStyle = dark; c.lineWidth = 19; c.lineCap = 'round';
    c.beginPath(); c.moveTo(20, 94); c.quadraticCurveTo(38 + run * Math.sin(p) * 34, 139, ax, ay); c.stroke();
    if (!o.shadow) { ellipse(c, ax + 1, ay + 7, 7, 12, '#c0a17f', -.2); c.strokeStyle = '#9c896855'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(26, 102); c.quadraticCurveTo(43, 140, ax + 6, ay - 4); c.stroke(); }
    if (o.run && !o.shadow) {
      c.save(); c.translate(-12, 82);
      const flutter = Math.sin(p * .65) * 9;
      c.fillStyle = '#a63942'; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(-44, -10, -68, flutter - 5, -104, flutter - 24); c.lineTo(-88, flutter - 6); c.bezierCurveTo(-45, flutter + 12, -22, 6, 0, 8); c.fill(); c.restore();
    }
    c.restore();
  }
  function mask(c, x, y, width, mouth = 0, rotation = 0, tint = 0) {
    c.save(); c.translate(x, y); c.rotate(rotation); c.scale(width / 100, width / 100);
    ellipse(c, 3, 13, 51, 77, '#00000035');
    const face = gradient(c, -40, -45, 38, 90, tint ? ['#dbc19a', '#ae8b6e'] : ['#f2e5c5', '#c0ab88']);
    shape(c, 'M 0 -67 C -36 -70 -50 -46 -47 -16 C -46 6 -39 37 -25 66 Q -11 93 1 99 Q 15 94 28 67 C 41 37 48 7 46 -18 C 48 -48 33 -68 0 -67 Z', face, '#e3c89b', 1);
    shape(c, 'M -43 -32 Q -22 -53 -6 -23 Q -20 -33 -40 -21 Z M 7 -24 Q 24 -52 43 -31 L 40 -20 Q 23 -34 7 -24 Z', '#645244');
    shape(c, 'M -39 -12 Q -22 -29 -6 -9 Q -21 -3 -35 0 Z M 8 -9 Q 25 -29 40 -12 L 35 0 Q 22 -3 8 -9 Z', '#141b23');
    shape(c, 'M 0 -22 L -9 29 Q -1 42 11 28 L 4 -18', '#a28767');
    shape(c, 'M -1 -24 L -2 25 L 8 27', null, '#f7edcf', 2.8);
    shape(c, 'M -35 11 Q -39 43 -17 57 L -24 26 Z M 34 11 Q 38 44 18 57 L 25 26 Z', '#977c5c46');
    ellipse(c, 1, 64, 11 + mouth * 3, 2.5 + mouth * 17, '#35202a', -.025);
    shape(c, 'M -11 62 Q 0 56 13 62 M -9 69 Q 0 73 10 69', null, '#99584b', 1.5);
    shape(c, 'M -10 -50 Q 0 -57 10 -50 M -6 -45 Q 0 -49 6 -45', null, '#b59362', 1);
    ellipse(c, 0, -57, 2.2, 2.7, '#a47a48');
    c.restore();
  }
  function curtains(c, w, h, open, time, ragged = false) {
    const span = mix(w * .49, w * .115, clamp(open));
    for (const side of [-1, 1]) {
      c.save(); c.translate(side < 0 ? 0 : w, 0); c.scale(side < 0 ? 1 : -1, 1);
      const edge = span + Math.sin(time * .6) * (ragged ? 18 : 2.5);
      c.fillStyle = gradient(c, 0, 0, span, 0, ['#341626', '#8a263b', '#b7504d', '#501a30']);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(edge + 42, 0);
      c.bezierCurveTo(edge + 30, h * .23, edge * .44, h * .36, edge * .58, h * .62);
      if (ragged) {
        for (let j = 0; j < 9; j++) c.lineTo(edge * (.4 + noise(j + side * 6) * .5), h * (.65 + j * .038));
      } else c.bezierCurveTo(edge * .6, h * .75, edge * .96, h * .91, edge * .86, h + 10);
      c.lineTo(0, h + 10); c.closePath(); c.fill();
      c.save(); c.clip();
      for (let i = 0; i < 11; i++) {
        const x = span * i / 10;
        c.strokeStyle = i % 2 ? '#f0886330' : '#210f29a0'; c.lineWidth = span / 19;
        c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x - span * .05, h * .3, x - span * .15, h * .62, x + Math.sin(i) * 15, h + 10); c.stroke();
      }
      c.restore();
      c.strokeStyle = '#d5ad6b'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, h * .55); c.quadraticCurveTo(edge * .28, h * .64, edge * .56, h * .54); c.stroke();
      ellipse(c, edge * .56, h * .56, 4, 10, '#d5ad6b'); c.restore();
    }
    c.fillStyle = '#681e32'; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, 38);
    for (let x = w; x > 0; x -= w / 8) c.quadraticCurveTo(x - w / 16, 92, x - w / 8, 39);
    c.closePath(); c.fill();
    c.strokeStyle = '#b38250'; c.lineWidth = 2; c.stroke();
  }
  function theatreFrame(c, w, h) {
    c.save();
    for (const side of [-1, 1]) {
      const x = side < 0 ? 16 : w - 56;
      c.fillStyle = gradient(c, x, 0, x + 42, 0, ['#1e2330', '#bd955b', '#443335']); c.fillRect(x, 16, 40, h - 16);
      c.fillStyle = '#bc955b'; c.fillRect(x - 6, 8, 53, 10); c.fillRect(x - 5, h - 23, 51, 20);
      c.fillStyle = '#302c33'; c.fillRect(x + 13, 37, 14, h - 75);
      for (let i = 0; i < 5; i++) ellipse(c, x + 20, 34 + i * 9, 8 - i, 4, '#c6a56b');
    }
    c.fillStyle = '#7b5940'; c.fillRect(0, 0, w, 7); c.fillStyle = '#d4af70'; c.fillRect(0, 8, w, 2);
    c.strokeStyle = '#ae8b5d'; c.lineWidth = 1.3;
    for (let i = 0; i < 24; i++) { const x = 80 + i * (w - 160) / 23; c.beginPath(); c.arc(x, 21, 4, 0, TAU); c.stroke(); }
    c.restore();
  }
  const ACTS = [
    { key: 'curtain', beat: 0, title: '幕后的影子', left: '人物', right: '影子' },
    { key: 'room', beat: 20, title: '窗前的独白', left: '烛火与侧脸', right: '窗光与影子' },
    { key: 'stairs', beat: 186, title: '影子走向月亮', left: '留下的人', right: '离开的影子' },
    { key: 'court', beat: 222, title: '面具的法庭', left: '回应', right: '审视' },
    { key: 'tear', beat: 296, title: '撕开这座剧院', left: '奔跑', right: '面具碎片' },
    { key: 'sea', beat: 410, title: '剧院尽头的海', left: '空椅子', right: '消失的影子' },
    { key: 'finale', beat: 466, title: '最后一束暖光', left: '余光', right: '空白' }
  ];

  class MidiTheatre {
    constructor(analysis) {
      this.cache = new Map(); this.buffers = new Map(); this.overlays = new Map();
      this.acts = ACTS.map((a, i) => ({ ...a, index: i, time: analysis.secondsAtBeat(a.beat), endBeat: ACTS[i + 1]?.beat || analysis.at(analysis.duration).quarter }));
      this.bursts = []; let last = -10;
      const hits = [...analysis.groups.crash, ...analysis.groups.snare.filter(n => n.velocity * 127 > 80)].sort((a, b) => a.time - b.time);
      for (const n of hits) if (n.time - last > .5) { this.bursts.push(n); last = n.time; }
    }
    sceneAt(time) { let i = 0; while (i + 1 < this.acts.length && this.acts[i + 1].time <= time) i++; return this.acts[i]; }
    layout(id) { return id === 'main' ? { w: 1600, h: 500 } : { w: 200, h: 200 * 7.5 / 1.55 }; }
    background(act, id) {
      const key = act.key + ':' + id;
      if (this.cache.has(key)) return this.cache.get(key);
      const { w, h } = this.layout(id), p = canvas(w, Math.round(h)), c = p.getContext('2d');
      if (id === 'main') this.mainBackground(c, act.key, w, h); else this.sideBackground(c, act.key, id, w, h);
      paper(c, w, h, act.index * 17 + (id === 'left' ? 4 : 1));
      this.cache.set(key, p); return p;
    }
    mainBackground(c, key, w, h) {
      const marine = key === 'sea' || key === 'finale', rock = key === 'tear';
      c.fillStyle = gradient(c, 0, 0, 0, h, marine ? ['#132935', '#698786', '#273d4b'] : rock ? ['#3a1e2b', '#a43f3f', '#dea477'] : ['#14212c', '#233940', '#393431']); c.fillRect(0, 0, w, h);
      if (marine) {
        glow(c, 850, 166, 380, '#d0d7b72b'); moon(c, 1110, 110, 48, .68);
        c.fillStyle = '#718e8e'; c.fillRect(0, 224, w, 8);
        c.fillStyle = '#2f505e'; c.fillRect(0, 232, w, h - 232);
      } else if (rock) {
        glow(c, 1000, 190, 360, '#f6c08a68');
        shape(c, 'M 0 359 Q 220 248 432 282 T 859 217 T 1330 249 T 1630 185 L 1650 520 L 0 520 Z', '#733040');
        shape(c, 'M 0 395 Q 213 340 477 376 T 952 319 T 1610 349 L 1610 510 L 0 510 Z', '#2e2632');
      } else if (key === 'court') {
        c.fillStyle = gradient(c, 0, 0, 0, h, ['#3e2631', '#19222f', '#060e1b']); c.fillRect(0, 0, w, h);
        glow(c, 800, 188, 290, '#b78c6357');
        for (const side of [-1, 1]) for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
          const x = side < 0 ? 118 + col * 123 : 1008 + col * 123, y = 65 + row * 99;
          c.fillStyle = '#ad8455'; arch(c, x - 4, y - 4, 108, 93); c.fill();
          c.fillStyle = '#09121f'; arch(c, x, y, 100, 87); c.fill();
          c.fillStyle = '#762637'; c.fillRect(x - 8, y + 67, 117, 22);
          c.fillStyle = '#cfaa69'; c.fillRect(x - 8, y + 67, 117, 3);
          for (let j = 0; j < 6; j++) { c.fillStyle = '#382735'; c.fillRect(x + 3 + j * 17, y + 76, 5, 12); }
        }
        c.save(); c.translate(800, 90); shape(c, 'M -34 -12 Q -47 -48 -15 -27 L 0 -52 L 15 -27 Q 47 -48 34 -12 Z', '#c4a067'); c.restore();
      } else {
        for (let i = 0; i < 9; i++) {
          c.fillStyle = i % 2 ? '#9c987009' : '#02091822'; c.fillRect(i * 190, 0, 95, 360);
          c.strokeStyle = '#a5956b29'; c.lineWidth = 1.6; c.strokeRect(i * 190 + 18, 58, 154, 258);
        }
        c.fillStyle = '#8a765140'; c.fillRect(0, 330, w, 3); c.fillStyle = '#111e29'; c.fillRect(0, 337, w, 16);
        this.window(c, key === 'stairs' ? 270 : 385, 54, 190, 257);
        if (key === 'stairs') {
          c.fillStyle = '#152938'; arch(c, 901, 29, 295, 309); c.fill(); moon(c, 1048, 124, 77);
        }
      }
      c.fillStyle = gradient(c, 0, 350, 0, 500, marine ? ['#162934', '#0d1928'] : ['#76563d', '#221e26']);
      c.beginPath(); c.moveTo(0, 356); c.lineTo(w, 356); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
      c.lineWidth = 1.2;
      for (let i = -8; i < 18; i++) { c.strokeStyle = i % 2 ? '#deb07819' : '#070c1666'; c.beginPath(); c.moveTo(800 + (i - 4) * 41, 357); c.lineTo((i - 4) * 205 + 800, h); c.stroke(); }
      for (let i = 1; i < 6; i++) { c.strokeStyle = '#d0a16e18'; c.beginPath(); c.moveTo(0, 356 + i * i * 4.6); c.lineTo(w, 356 + i * i * 4.6); c.stroke(); }
      if (!marine && !rock && key !== 'court') {
        c.fillStyle = '#e5c78a15'; c.beginPath(); c.moveTo(388, 276); c.lineTo(568, 276); c.lineTo(1120, 498); c.lineTo(660, 498); c.closePath(); c.fill();
        c.fillStyle = '#08121a'; c.fillRect(1004, 314, 111, 10); c.fillRect(1016, 324, 5, 67); c.fillRect(1095, 324, 5, 67);
      }
      theatreFrame(c, w, h);
    }
    window(c, x, y, w, h) {
      c.fillStyle = '#b39e6b'; arch(c, x - 8, y - 8, w + 16, h + 16); c.fill();
      c.save(); arch(c, x, y, w, h); c.clip();
      c.fillStyle = gradient(c, 0, y, 0, y + h, ['#2d5160', '#83a1a1']); c.fillRect(x, y, w, h);
      moon(c, x + w * .61, y + h * .3, w * .22);
      c.fillStyle = '#294854'; c.beginPath(); c.moveTo(x, y + h * .7); c.bezierCurveTo(x + w * .3, y + h * .5, x + w * .65, y + h * .8, x + w, y + h * .6); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.fill();
      c.fillStyle = '#152c36'; c.fillRect(x + w * .48, y, w * .037, h); c.fillRect(x, y + h * .44, w, 5); c.fillRect(x, y + h * .72, w, 5); c.restore();
      c.fillStyle = '#bcaa7a'; c.fillRect(x - 15, y + h, w + 30, 9);
      c.strokeStyle = '#122330'; c.lineWidth = 3; arch(c, x, y, w, h); c.stroke();
    }
    sideBackground(c, key, id, w, h) {
      const sea = key === 'sea' || key === 'finale', warm = id === 'left';
      c.fillStyle = gradient(c, 0, 0, w, h, sea ? ['#233e4a', '#1d2e3a', '#090f1b'] : warm ? ['#511f30', '#28353c', '#141c28'] : ['#172e3c', '#435357', '#131c2a']); c.fillRect(0, 0, w, h);
      c.fillStyle = '#b4945d'; arch(c, 11, 35, w - 22, h - 68); c.fill();
      c.fillStyle = gradient(c, 0, 40, 0, h, sea ? ['#47646b', '#122535', '#0b1420'] : ['#111f2e', '#2d3b42', '#151d29']); arch(c, 17, 42, w - 34, h - 81); c.fill();
      c.strokeStyle = '#d0b17955'; c.lineWidth = 1; arch(c, 24, 51, w - 48, h - 97); c.stroke();
      if (key === 'room' && !warm) this.window(c, 49, 135, 104, 327);
      if (key === 'stairs') moon(c, 103, 180, 55, warm ? .45 : .85);
      for (let i = 0; i < 8; i++) { const y = 42 + i * (h - 84) / 7; ellipse(c, 11, y, 4, 8, '#d5b170'); ellipse(c, w - 11, y, 4, 8, '#d5b170'); }
      c.fillStyle = '#b0905f'; c.fillRect(0, 10, w, 5); c.fillRect(0, h - 18, w, 7);
      glow(c, w * .5, h * .61, h * .33, warm ? '#a06e3820' : '#6ca1b51c');
    }
    stairway(c, t, opacity = 1, offset = 0) {
      c.save(); c.globalAlpha *= opacity;
      for (let i = 0; i < 14; i++) {
        const x = 670 + i * 33, y = 403 - i * 16.2;
        c.fillStyle = i % 2 ? '#958575' : '#b3a486';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 93, y); c.lineTo(x + 122, y + 11); c.lineTo(x + 29, y + 11); c.closePath(); c.fill();
        c.fillStyle = '#374552'; c.beginPath(); c.moveTo(x + 29, y + 11); c.lineTo(x + 122, y + 11); c.lineTo(x + 122, y + 22); c.lineTo(x + 29, y + 22); c.fill();
        c.strokeStyle = '#ddc99899'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 93, y); c.stroke();
      }
      c.restore();
    }
    rain(c, x, y, w, h, f) {
      c.save(); c.strokeStyle = '#ccddd466'; c.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const px = x + noise(i + 12) * w, py = y + fract(noise(i + 35) + f.t * (.014 + noise(i) * .006)) * h;
        c.globalAlpha = .2 + f.piano * .25;
        c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px - 2, py + 4, px - 1, py + 10 + noise(i) * 9); c.stroke();
      }
      c.restore();
    }
    ripples(c, w, h, f, shore = 228) {
      c.save();
      for (let row = 0; row < 8; row++) {
        const y = shore + row * row * 2.55, amp = 1.3 + row * .9;
        c.fillStyle = ['#829b971c', '#183e4c99', '#aec0b626', '#45778666'][row % 4];
        c.beginPath(); c.moveTo(0, y);
        for (let x = 0; x <= w + 16; x += 20) c.lineTo(x, y + Math.sin(x * .009 + f.t * .24 + row * 1.7) * amp + Math.sin(x * .021 - f.t * .19) * amp * .25);
        c.lineTo(w + 20, y + 12 + row * 2); c.lineTo(0, y + 12 + row * 2); c.closePath(); c.fill();
      }
      c.restore();
    }
    fragmentSprites() {
      if (this.fragments) return this.fragments;
      const face = canvas(240, 370), fc = face.getContext('2d'); mask(fc, 120, 145, 205, .3);
      this.fragments = [];
      for (let i = 0; i < 8; i++) {
        const p = canvas(240, 370), c = p.getContext('2d'), a = i * TAU / 8 - .28;
        c.beginPath(); c.moveTo(118, 176); c.lineTo(118 + Math.cos(a) * 460, 176 + Math.sin(a) * 460);
        c.lineTo(118 + Math.cos(a + TAU / 8 + .018) * 460, 176 + Math.sin(a + TAU / 8 + .018) * 460); c.closePath(); c.clip(); c.drawImage(face, 0, 0);
        this.fragments.push(p);
      }
      face.width = face.height = 1;
      return this.fragments;
    }
    wind(c, id, f, local, w, h) {
      // Physical panorama coordinates keep fragments travelling in one direction across all three LEDs.
      const wing = 1600 * 1.55 / 24, total = 1600 + wing * 2, origin = id === 'main' ? wing : id === 'left' ? 0 : wing + 1600;
      const scale = id === 'main' ? 1 : w / wing, H = 500, sprites = this.fragmentSprites();
      const draw = (gx, gy, sz, rot, n, alpha) => {
        if (gx < origin - sz * 2 || gx > origin + w / scale + sz * 2) return;
        c.save(); c.translate((gx - origin) * scale, gy * h / H); c.rotate(rot); c.scale(sz / 240 * scale, sz / 240 * scale); c.globalAlpha *= alpha;
        c.drawImage(sprites[n % 8], -120, -180); c.restore();
      };
      for (let i = 0; i < 27; i++) {
        const speed = 57 + noise(i + 23) * 94;
        const x = ((local * speed + noise(i + 49) * (total + 360)) % (total + 360)) - 180;
        const y = 70 + noise(i + 19) * 315 + Math.sin(local * .6 + i) * 38;
        draw(x, y, 56 + noise(i + 21) * 95, local * (.2 + noise(i) * .3) + i, i, .45 + noise(i + 6) * .5);
      }
      let lo = 0, hi = this.bursts.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (this.bursts[m].time <= f.t) lo = m + 1; else hi = m; }
      for (let j = lo - 1; j >= 0 && j >= lo - 5; j--) {
        const n = this.bursts[j], age = f.t - n.time;
        if (age > 2.1) break;
        if (n.time < this.acts[4].time) continue;
        for (let i = 0; i < 4; i++) {
          const sx = 400 + noise(j * 11 + i) * 1000;
          draw(sx + age * (150 + i * 46), 290 - age * (170 + i * 20) + age * age * 90, 70 + i * 11, i + age * (i % 2 ? -2 : 2), i + j, (1 - age / 2.1) * n.velocity);
        }
      }
    }
    mainScene(c, act, f, w, h) {
      const local = f.t - act.time, progress = clamp((f.quarter - act.beat) / (act.endBeat - act.beat));
      const phrase = (f.quarter - act.beat) * TAU / 8;
      if (act.key === 'curtain') {
        glow(c, 800, 315, 245, '#bdcdb946');
        for (let i = 0; i < 4; i++) person(c, 661 + i * 88, 412, 220 + i * 16, { shadow: true, alpha: (.10 + .08 * i + f.choir * .12) * smooth((local + 2 - i * 1.4) / 4), facing: i % 2 ? -1 : 1, lean: Math.sin(local * .15 + i) * .025 });
        ellipse(c, 800, 430, 108, 13, '#b2bca727');
        person(c, 800, 426, 172, { alpha: .92, lean: Math.sin(local * .4) * .012 });
        curtains(c, w, h, .35 + .52 * smooth(local / 13), f.t);
      } else if (act.key === 'room') {
        const rise = f.chapter.kind === 'rise';
        this.rain(c, 393, 133, 168, 166, f);
        glow(c, 753, 341, 232, '#e4b76824');
        c.save(); c.translate(867, 400); c.transform(1, -.2, .78, -.9 - progress * .65, 0, 0);
        person(c, 0, 0, 150, { shadow: true, sit: true, alpha: .35 + progress * .2 }); c.restore();
        chair(c, 804, 430, 116); person(c, 783, 436, 183, { sit: true, lean: -.045 + Math.sin(f.t * .21) * .022 + f.lead * .014 });
        candle(c, 1060, 314, 102, f.piano, f.t);
        c.save(); c.globalAlpha = .12 + f.piano * .12; c.fillStyle = '#ebd49a'; c.beginPath(); c.moveTo(472, 182); c.lineTo(539, 281); c.lineTo(974, 467); c.lineTo(781, 480); c.closePath(); c.fill(); c.restore();
        if (rise) {
          c.save(); c.globalAlpha = .12 + f.strings * .09;
          person(c, 1287, 379, 288, { shadow: true, facing: -1, lean: .045 }); c.restore();
        }
        curtains(c, w, h, .97, f.t * .4);
      } else if (act.key === 'stairs') {
        clouds(c, w, h * .5, local * .7, '#b6c8bd', .06);
        // The room's flats visibly open to reveal a moon and a solid impossible stairway.
        c.save(); c.translate(1130, 84); c.rotate(-.12 - progress * .21); c.fillStyle = '#29434acc'; c.fillRect(0, 0, 185, 307); c.strokeStyle = '#b4966555'; c.strokeRect(12, 14, 154, 269); c.restore();
        this.stairway(c, f.t);
        chair(c, 545, 440, 114); person(c, 526, 444, 173, { sit: true, alpha: .9 });
        const walk = smooth(progress) * 12.2, x = 696 + walk * 33, y = 403 - walk * 16.2;
        person(c, x, y, 165 - progress * 28, { shadow: true, phase: phrase, run: true, alpha: .93, lean: .045 });
        glow(c, 1037, 153, 174, '#d3dcb924');
        curtains(c, w, h, 1, f.t * .3);
      } else if (act.key === 'court') {
        const frenzy = f.chapter.kind === 'spiral', level = frenzy ? .75 : .35;
        for (const side of [-1, 1]) for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
          const x = side < 0 ? 169 + col * 123 : 1058 + col * 123, y = 101 + row * 99;
          const voice = side < 0 ? f.lead : f.choir;
          const emphasis = .5 + .5 * Math.cos((f.quarter - act.beat) * .55 - col * .7 - row * .8);
          const tilt = side * (.04 + voice * .1) + Math.sin(phrase * .3 + col + row) * .018 * level;
          c.save(); c.globalAlpha = .65 + voice * .3;
          mask(c, x, y - voice * 3 * emphasis, 43 + voice * 3, voice * emphasis, tilt, side < 0 ? 0 : 1); c.restore();
        }
        const giant = .4 + .6 * smooth(progress * 1.8);
        glow(c, 800, 219, 174, '#d6ab7529');
        c.save(); c.globalAlpha = giant; mask(c, 800, 198, 146 + progress * 25, f.choir * .58 + f.lead * .27, Math.sin(f.t * .19) * .025); c.restore();
        ellipse(c, 801, 446, 83, 11, '#d5ae6b30'); person(c, 800, 444, 108, { facing: progress < .65 ? 1 : -1, lean: -.045 });
        curtains(c, w, h, .99, f.t * .3);
      } else if (act.key === 'tear') {
        clouds(c, w, h, local * 2.8, '#f1ba85', .18);
        c.save(); c.globalAlpha = .30;
        for (let i = 0; i < 5; i++) {
          const x = -110 + i * 355 + Math.sin(local * .3 + i) * 19;
          c.save(); c.translate(x, 254); c.rotate(-.28);
          shape(c, 'M -80 80 C -22 27 -48 -35 14 -114 C -6 -21 73 -12 38 47 C 89 23 112 -29 145 -81 C 130 35 54 125 -80 80 Z', i % 2 ? '#d98c67' : '#ad514e'); c.restore();
        }
        c.restore();
        this.wind(c, 'main', f, local, w, h);
        const x = 470 + smooth(progress) * 640 + Math.sin(phrase * .13) * 25;
        ellipse(c, x + 9, 445, 114, 13, '#060d1aaa');
        person(c, x, 440, 206, { run: true, phase: (f.quarter - act.beat) * TAU / 2, lean: .09 });
        const open = .68 + .32 * smooth(local / 4);
        curtains(c, w, h, open, f.t * 2, true);
      } else {
        const finale = act.key === 'finale';
        clouds(c, w, 260, f.t * .18, '#b6c3b7', .075);
        this.ripples(c, w, h, f);
        c.save(); c.globalAlpha = .12; c.fillStyle = '#e1d3a4'; c.beginPath(); c.moveTo(1095, 227); c.lineTo(1129, 227); c.lineTo(1260, 354); c.lineTo(970, 354); c.closePath(); c.fill(); c.restore();
        const chairLight = finale ? 1 - .4 * smooth(local / 9) : .75;
        glow(c, 724, 362, 138, '#e6bc7840');
        c.save(); c.globalAlpha = chairLight; c.fillStyle = '#e9c88915'; c.beginPath(); c.moveTo(684, 37); c.lineTo(726, 36); c.lineTo(840, 461); c.lineTo(626, 461); c.closePath(); c.fill(); c.restore();
        chair(c, 728, 435, 111);
        if (!finale) {
          const p = smooth(progress), height = mix(144, 45, p);
          person(c, mix(875, 1010, p), mix(420, 349, p), height, { run: true, phase: f.quarter * TAU / 8, shadow: true, alpha: 1 - smooth((progress - .65) / .35), lean: -.05 });
        }
        curtains(c, w, h, finale ? 1 - .83 * smooth((local - 5) / 11) : 1, f.t * .2);
      }
    }
    sideScene(c, act, id, f, w, h) {
      const local = f.t - act.time, p = clamp((f.quarter - act.beat) / (act.endBeat - act.beat)), left = id === 'left';
      if (act.key === 'curtain') {
        glow(c, 100, h * .68, 210, left ? '#c9a05b48' : '#8fb6c436');
        person(c, left ? 96 : 107, h - 95, left ? 460 : 570, { shadow: !left, facing: left ? 1 : -1, alpha: .65 + f.choir * .3, lean: Math.sin(f.t * .24 + (left ? 0 : -1)) * .024 });
        c.save(); c.fillStyle = '#672238'; c.beginPath(); c.moveTo(18, 73); c.quadraticCurveTo(99, 194 + 20 * smooth(local / 8), 182, 73); c.lineTo(182, 42); c.lineTo(18, 42); c.fill(); c.restore();
      } else if (act.key === 'room') {
        if (left) {
          // Portrait in a tall, narrow aperture; candle and hand complete the lower composition.
          c.save(); arch(c, 25, 70, 150, h - 146); c.clip();
          person(c, 85, 1290, 1030, { sit: true, lean: -.035 + Math.sin(f.t * .15) * .018 }); c.restore();
          candle(c, 108, h - 116, 260, f.piano, f.t);
          c.save(); c.translate(116, h - 307); c.scale(.66, .66);
          shape(c, 'M -47 39 Q -25 8 -5 14 L 26 29 Q 37 43 16 46 L -5 35 Q 17 52 3 57 L -20 47 L -39 58 Z', '#b99b7b', '#e3c295', 1); c.restore();
        } else {
          this.rain(c, 55, 167, 89, 285, f);
          c.save(); c.translate(117, h - 93); c.scale(1, 1.06 + p * .3); person(c, 0, 0, 407, { shadow: true, facing: -1, alpha: .62 + p * .24 }); c.restore();
          c.save(); c.globalAlpha = .07 + f.piano * .05; c.fillStyle = '#c3d2ba'; c.beginPath(); c.moveTo(62, 421); c.lineTo(153, 421); c.lineTo(178, h - 43); c.lineTo(30, h - 43); c.fill(); c.restore();
        }
      } else if (act.key === 'stairs') {
        if (left) {
          chair(c, 98, h - 84, 205); person(c, 74, h - 69, 356, { sit: true, facing: 1, alpha: .88 });
          glow(c, 101, h - 230, 199, '#c1ad7532');
        } else {
          for (let i = 0; i < 13; i++) {
            const y = h - 120 - i * 42, x = 48 + Math.sin(i * .28) * 19;
            c.fillStyle = '#9ca998'; c.fillRect(x, y, 108, 8); c.fillStyle = '#2b414f'; c.fillRect(x + 9, y + 8, 106, 17);
          }
          person(c, 104 + Math.sin(p * 3) * 8, h - 137 - smooth(p) * 482, 249 - p * 72, { shadow: true, run: true, phase: f.quarter * TAU / 8, facing: -1 });
        }
      } else if (act.key === 'court') {
        const voice = left ? f.lead : f.choir, other = left ? f.choir : f.lead;
        glow(c, 101, h * .43, 250, left ? '#d3ae6242' : '#8db6c230');
        for (let i = 0; i < 3; i++) {
          const y = 182 + i * 248, stagger = .45 + .55 * Math.max(0, Math.cos(f.quarter * .55 - i * 1.1));
          c.save(); c.globalAlpha = .55 + voice * .4 - other * .07;
          mask(c, 100 + Math.sin(f.t * .21 + i) * 3, y + voice * 12 * (left ? -1 : 1), 119 - i * 5, voice * stagger, (left ? -.055 : .055) + voice * (left ? -.055 : .055), left ? 0 : 1); c.restore();
        }
        c.fillStyle = '#a8875f'; c.fillRect(38, h - 90, 124, 4);
      } else if (act.key === 'tear') {
        if (left) {
          glow(c, 100, h * .42, 340, '#cd683750');
          c.save(); c.fillStyle = '#a33642'; c.beginPath(); c.moveTo(24, 95); c.bezierCurveTo(95, 160, 43, 348, 176, 442); c.lineTo(135, 478); c.bezierCurveTo(17, 361, 97, 232, 24, 183); c.fill(); c.restore();
          person(c, 100, h - 117, 373, { run: true, phase: f.quarter * TAU / 2, lean: .08 });
        } else {
          const sprites = this.fragmentSprites();
          for (let i = 0; i < 8; i++) {
            const rot = (i % 2 ? -1 : 1) * (.05 + .12 * Math.sin(local * .5 + i));
            const y = 220 + i % 3 * 228 + Math.sin(local * .7 + i) * 24;
            c.save(); c.translate(100 + Math.cos(i * 2.3 + local * .2) * 24, y); c.rotate(rot + i * .13); c.drawImage(sprites[i], -113, -170, 226, 349); c.restore();
          }
        }
        this.wind(c, id, f, local, w, h);
      } else {
        if (left) {
          c.save(); c.fillStyle = '#dfba7929'; c.beginPath(); c.moveTo(76, 119); c.lineTo(114, 119); c.lineTo(173, h - 79); c.lineTo(27, h - 79); c.fill(); c.restore();
          glow(c, 98, h - 286, 166, '#e4b66f42'); chair(c, 98, h - 116, 245);
        } else {
          person(c, 106, h - 106, 513, { shadow: true, facing: -1, alpha: act.key === 'finale' ? 0 : 1 - smooth(p) });
          c.save(); c.globalAlpha = .3; this.ripples(c, w, h, f, h - 260); c.restore();
        }
      }
    }
    dispose() {
      const release = c => { c.width = c.height = 1; };
      for (const map of [this.cache, this.overlays, glowTiles]) { for (const c of map.values()) release(c); map.clear(); }
      for (const pair of this.buffers.values()) { release(pair.now); release(pair.before); }
      this.buffers.clear();
      for (const c of this.fragments || []) release(c);
      this.fragments = []; paths.clear(); this.bursts = [];
    }
    screenWeight(id, time) {
      const a = this.sceneAt(time), local = time - a.time;
      if (id === 'main') return a.key === 'court' ? .88 : 1;
      if (a.key === 'finale') return .66 * (1 - smooth(local / 8));
      if (a.key === 'court') return 1.14;
      if (a.key === 'tear') return .94;
      return a.key === 'room' ? .76 : .83;
    }
    paint(target, act, id, f) {
      const { w, h } = this.layout(id), c = target.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, target.width, target.height); c.save(); c.scale(target.width / w, target.height / h);
      c.drawImage(this.background(act, id), 0, 0, w, h);
      if (id === 'main') this.mainScene(c, act, f, w, h); else this.sideScene(c, act, id, f, w, h);
      // Printed edges and restrained vignette stay still when playback is paused.
      let overlay = this.overlays.get(id);
      if (!overlay) {
        overlay = canvas(w, Math.round(h)); const oc = overlay.getContext('2d');
        const g = oc.createRadialGradient(w * .5, h * .46, Math.min(w, h) * .15, w * .5, h * .5, Math.max(w, h) * .64);
        g.addColorStop(0, '#03081200'); g.addColorStop(1, '#03081272'); oc.fillStyle = g; oc.fillRect(0, 0, w, h); this.overlays.set(id, overlay);
      }
      c.drawImage(overlay, 0, 0, w, h);
      c.restore();
    }
    draw(ctx, frame, f) {
      const id = frame.screen.id, act = this.sceneAt(f.t), { w, h } = this.layout(id);
      const scale = 1;
      const bw = Math.round(w * scale), bh = Math.round(h * scale);
      let pair = this.buffers.get(id);
      if (!pair || pair.now.width !== bw || pair.now.height !== bh) { pair = { now: canvas(bw, bh), before: canvas(bw, bh) }; this.buffers.set(id, pair); }
      const k = act.index ? smooth((f.t - act.time) / 1.5) : 1;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#070c15'; ctx.fillRect(0, 0, frame.width, frame.height);
      if (k < 1) {
        this.paint(pair.before, this.acts[act.index - 1], id, f);
        ctx.drawImage(pair.before, 0, 0, frame.width, frame.height);
      }
      this.paint(pair.now, act, id, f);
      ctx.globalAlpha = k; ctx.drawImage(pair.now, 0, 0, frame.width, frame.height); ctx.restore();
    }
  }
  return new MidiTheatre(analysis);
}
