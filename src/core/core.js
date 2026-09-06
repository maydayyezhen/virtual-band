'use strict';
const T = THREE;
let resolveStageRig, rejectStageRig;
window.stageRigReady=new Promise((resolve,reject)=>{resolveStageRig=resolve;rejectStageRig=reject;});
window.stageRigReady.catch(()=>{});
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const V = (x, y, z) => new T.Vector3(x, y, z);
const stage = document.getElementById('stage');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
function fail(message) {
  rejectStageRig?.(new Error(message||'WebGL 2 is unavailable'));
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  document.getElementById('error').style.display = 'flex';
  if (message) document.getElementById('error-message').textContent = message;
}

// Every texture below is drawn at startup. No image, font or model is fetched.
function canvasTexture(width, height, draw) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  draw(c.getContext('2d'), width, height);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function woodTexture(kind, size = 1024) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const pixels = ctx.createImageData(w, h);
    const d = pixels.data;
    const base = { spruce: [209, 166, 104], rosewood: [90, 43, 25], ebony: [36, 27, 22], mahogany: [120, 62, 37], maple: [216, 183, 132], walnut: [103, 62, 38] }[kind];
    const columns = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const t = (kind === 'rosewood' ? Math.abs(x - w / 2) : x) / w;
      columns[x] = t * (kind === 'spruce' ? 920 : 210) + Math.sin(t * 46) * 2.8 + Math.sin(t * 115) * .7;
    }
    let seed = 1257;
    for (let y = 0; y < h; y++) {
      const fy = y / h;
      const warp = Math.sin(fy * 8.3) * (kind === 'spruce' ? .11 : 2.7) + Math.sin(fy * 21) * .18;
      for (let x = 0; x < w; x++) {
        const f = columns[x] + warp;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = ((seed >>> 24) / 255 - .5);
        const fine = Math.sin(f * 4.1 + Math.sin(f * .087) * 3);
        const band = Math.sin(f + Math.sin(f * .18) * 2);
        let delta;
        if (kind === 'spruce') {
          const grain = Math.pow(.5 + .5 * Math.sin(f), 12);
          delta = -grain * 18 + band * 3 + fine * 2 + noise * 5;
          delta += Math.sin(fy * 220 + x * .06) * Math.sin(x * .23) * 1.5;
        } else if (kind === 'rosewood') {
          delta = band * 16 + Math.pow(.5 + fine * .5, 7) * -18 + noise * 5;
        } else {
          delta = band * 7 + fine * 3 + noise * 5;
        }
        const i = (y * w + x) * 4;
        d[i] = clamp(base[0] + delta * 1.08, 0, 255);
        d[i + 1] = clamp(base[1] + delta * .80, 0, 255);
        d[i + 2] = clamp(base[2] + delta * .54, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
  });
}
function environmentTexture() {
  const texture = canvasTexture(1024, 512, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#a3b3bc'); bg.addColorStop(.47, '#53636d'); bg.addColorStop(.55, '#242d34'); bg.addColorStop(1, '#10181e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const boxes = [[.18,.18,.14,.37,'#fff0d2'], [.72,.14,.045,.46,'#e4edff'], [.48,.05,.20,.10,'#e3eaf0']];
    for (const [x, y, bw, bh, color] of boxes) {
      ctx.shadowBlur = 22; ctx.shadowColor = color; ctx.fillStyle = color;
      ctx.fillRect(x*w, y*h, bw*w, bh*h);
    }
    ctx.shadowBlur = 0;
  });
  texture.mapping = T.EquirectangularReflectionMapping;
  return texture;
}

const noteName=n=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1);
const isBlack=n=>[1,3,6,8,10].includes(n%12);



function tortoiseTexture() {
    return canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#251008'; ctx.fillRect(0, 0, w, h);
      let seed = 123;
      const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
      for (let n = 0; n < 155; n++) {
        const x = rnd() * w, y = rnd() * h, r = 7 + rnd() * 41;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * TAU); ctx.scale(1, .3 + rnd());
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, n % 3 ? '#bc652885' : '#e2a04475');
        g.addColorStop(.6, '#89401950'); g.addColorStop(1, '#35150900');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
      }
    });
  }

