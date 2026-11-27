// Nose jewelry geometry + rendering.
// Everything is modelled in MediaPipe canonical-face space (centimetres, y up, z toward camera)
// and mapped to the live image through a per-frame affine fit (see app.js).
import { CANON, TRIS } from './mesh-data.js';

// ---------- vector helpers ----------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
let STAR_SCALE = 1;

// ---------- canonical mesh normals + left/right mirror map ----------
export const NORMALS = (() => {
  const N = CANON.map(() => [0, 0, 0]);
  for (const [a, b, c] of TRIS) {
    const n = cross(sub(CANON[b], CANON[a]), sub(CANON[c], CANON[a]));
    for (const i of [a, b, c]) { N[i][0] += n[0]; N[i][1] += n[1]; N[i][2] += n[2]; }
  }
  return N.map(norm);
})();

export const MIRROR = (() => CANON.map((v) => {
  let best = 0, bd = Infinity;
  for (let j = 0; j < CANON.length; j++) {
    const w = CANON[j], d = (w[0] + v[0]) ** 2 + (w[1] - v[1]) ** 2 + (w[2] - v[2]) ** 2;
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}))();

// Base indices are on the subject's RIGHT side (canonical x < 0). 'L' mirrors them.
const sideIdx = (i, side) => (side === 'L' ? MIRROR[i] : i);

// ---------- light (canonical frame: from above / front) ----------
const LIGHT = norm([-0.25, 0.8, 0.55]);
const HALF = norm(add(LIGHT, [0, 0, 1]));

// ---------- palettes ----------
export const METALS = {
  gold:   { name: 'Yellow gold', dark: [92, 58, 12],  base: [204, 152, 46],  light: [255, 228, 142], spec: [255, 251, 232] },
  rose:   { name: 'Rose gold',   dark: [104, 54, 42], base: [206, 138, 110], light: [255, 208, 188], spec: [255, 242, 236] },
  silver: { name: 'Silver',      dark: [66, 72, 82],  base: [172, 180, 191], light: [240, 244, 249], spec: [255, 255, 255] },
  oxide:  { name: 'Oxidised silver', dark: [30, 30, 32], base: [98, 96, 94], light: [190, 186, 178], spec: [236, 232, 224] },
};

const lit = (F, c, s = 1) => {
  const k = F.light.k * s, t = F.light.tint;
  return [Math.min(255, c[0] * k * t[0]), Math.min(255, c[1] * k * t[1]), Math.min(255, c[2] * k * t[2])];
};
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const palAt = (M, b) => (b < 0.5 ? mix(M.dark, M.base, b * 2) : mix(M.base, M.light, (b - 0.5) * 2));

// ---------- catalogue ----------
export const PRODUCTS = {
  pin: [
    { id: 'solitaire', name: 'Solitaire Diamond', note: 'Prong set · white gold', type: 'diamond', metal: 'silver', r: 0.13 },
    { id: 'laung', name: 'Kundan Laung', note: 'Flower · ruby centre', type: 'flower', metal: 'gold', r: 0.22 },
    { id: 'goldball', name: 'Gold Ball Stud', note: 'Minimal · 22K finish', type: 'ball', metal: 'gold', r: 0.1 },
    { id: 'pearl', name: 'Pearl Stud', note: 'Freshwater pearl', type: 'pearl', metal: 'gold', r: 0.13 },
    { id: 'sapphire', name: 'Sapphire Bezel', note: 'Rose gold bezel', type: 'bezel', metal: 'rose', r: 0.12, gem: 'sapphire' },
    { id: 'emerald', name: 'Emerald Bezel', note: 'Yellow gold bezel', type: 'bezel', metal: 'gold', r: 0.12, gem: 'emerald' },
  ],
  ring: [
    { id: 'hoop-gold', name: 'Classic Gold Hoop', note: '8 mm · 20G', type: 'hoop', metal: 'gold', d: 0.8, g: 0.085 },
    { id: 'hoop-bead', name: 'Silver Bead Hoop', note: 'Captive bead · 8 mm', type: 'hoop', metal: 'silver', d: 0.8, g: 0.085, bead: 0.11 },
    { id: 'hoop-twist', name: 'Twisted Rose Hoop', note: 'Rope twist · 9 mm', type: 'hoop', metal: 'rose', d: 0.9, g: 0.1, twist: true },
    { id: 'hoop-crystal', name: 'Crystal Hoop', note: 'Pavé front · 8 mm', type: 'hoop', metal: 'gold', d: 0.8, g: 0.09, gems: true },
    { id: 'nath', name: 'Bridal Nath', note: 'Pearls + ear chain', type: 'nath', metal: 'gold', d: 2.6, g: 0.09, chain: true },
  ],
  septum: [
    { id: 'clicker-gold', name: 'Gold Clicker', note: '10 mm · 16G', type: 'clicker', metal: 'gold', d: 1.0, g: 0.12 },
    { id: 'horseshoe', name: 'Silver Horseshoe', note: 'Ball ends · 10 mm', type: 'horseshoe', metal: 'silver', d: 1.0, g: 0.12 },
    { id: 'clicker-gem', name: 'Crystal Clicker', note: 'Gem-set front', type: 'clicker', metal: 'gold', d: 1.0, g: 0.12, gems: true },
    { id: 'oxide-drops', name: 'Oxidised Drops', note: 'Tribal · swinging beads', type: 'clicker', metal: 'oxide', d: 1.1, g: 0.13, drops: true },
  ],
};

// ---------- anatomy (canonical) ----------
// Nostril piercing site sits on the ala between landmarks 48 and 166 (right side).
export function nostrilGeom(side, upMm = 0, frontMm = 0) {
  // Piercing site: centre of the alar bulge, a little forward of its widest point
  // (blend of 48 / 166 / 79 on the right side), ~5 mm above the nostril rim.
  const ids = [48, 166, 79].map((i) => sideIdx(i, side)), w = [0.35, 0.4, 0.25];
  const i75 = sideIdx(75, side), i98 = sideIdx(98, side);
  let P0 = [0, 0, 0], nn = [0, 0, 0];
  ids.forEach((i, k) => { P0 = add(P0, mul(CANON[i], w[k])); nn = add(nn, mul(NORMALS[i], w[k])); });
  const n = norm(nn);
  const R = add(mul(CANON[i75], 0.8), mul(CANON[i98], 0.2));       // nostril rim below the site
  const RP = sub(R, P0);
  const t = norm(sub(RP, mul(n, dot(RP, n))));          // along the ala, down toward the rim
  let f = norm(cross(n, t)); if (f[2] < 0) f = mul(f, -1); // forward, toward the nose tip
  const up = upMm / 10, fr = frontMm / 10;
  const P = add(add(P0, mul(t, -up)), mul(f, fr));
  return {
    side, P, n, t, f, rim: Math.max(0.15, dot(RP, t) + up),
    anchor: { idx: ids, w, c: P0 },
    ear: sideIdx(127, side), cheekN: NORMALS[sideIdx(234, side)],
  };
}

// Septum "sweet spot": just inside the columella, between landmarks 94 / 19 / 2.
export function septumGeom(upMm = 0) {
  const up = upMm / 10;
  const c = add(add(mul(CANON[94], 0.6), mul(CANON[19], 0.2)), mul(CANON[2], 0.2));
  return {
    S: [0, -1.4 + up, 6.36], lat: [1, 0, 0], d: norm([0, -1, 0.12]),
    U0: [0, -1.74 + up * 0.3, 6.5], nU: norm([0, 1, -0.08]),
    anchor: { idx: [94, 19, 2], w: [0.6, 0.2, 0.2], c },
  };
}

// ---------- primitive drawing ----------
function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }

function drawSphere(ctx, F, x, y, R, kind, alpha = 1) {
  if (alpha <= 0.01 || R <= 0.2) return;
  R = Math.max(R, 0.9);
  ctx.save(); ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.42, R * 0.04, x, y, R);
  if (kind === 'pearl') {
    g.addColorStop(0, rgba(lit(F, [255, 254, 250])));
    g.addColorStop(0.35, rgba(lit(F, [244, 236, 224])));
    g.addColorStop(0.75, rgba(lit(F, [212, 196, 178])));
    g.addColorStop(1, rgba(lit(F, [150, 132, 114])));
  } else if (GEMS[kind]) {
    const c = GEMS[kind];
    g.addColorStop(0, rgba(lit(F, c.hi))); g.addColorStop(0.45, rgba(lit(F, c.mid))); g.addColorStop(1, rgba(lit(F, c.deep)));
  } else {
    const M = METALS[kind] || METALS.gold;
    g.addColorStop(0, rgba(lit(F, M.spec))); g.addColorStop(0.22, rgba(lit(F, M.light)));
    g.addColorStop(0.6, rgba(lit(F, M.base))); g.addColorStop(1, rgba(lit(F, M.dark)));
  }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
  ctx.lineWidth = Math.max(0.6, R * 0.12); ctx.strokeStyle = 'rgba(30,18,8,0.35)'; ctx.stroke();
  if (kind === 'pearl') { // faint iridescent rim
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,190,210,0.18)'; ctx.lineWidth = Math.max(0.5, R * 0.18);
    ctx.beginPath(); ctx.arc(x, y, R * 0.82, 0.6, 2.4); ctx.stroke();
  }
  ctx.restore();
}

function drawStar(ctx, x, y, size, alpha) {
  if (alpha <= 0.02 || size < 1) return;
  if (STAR_SCALE !== 1) size *= STAR_SCALE;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, alpha);
  const g = ctx.createRadialGradient(x, y, 0, x, y, size * 0.55);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, size * 0.55, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineCap = 'round';
  for (const [dx, dy, s] of [[1, 0, 1], [0, 1, 1], [0.7, 0.7, 0.45], [0.7, -0.7, 0.45]]) {
    ctx.lineWidth = Math.max(0.6, size * 0.06 * s);
    line(ctx, [x - dx * size * s, y - dy * size * s], [x + dx * size * s, y + dy * size * s]);
  }
  ctx.restore();
}

const GEMS = {
  ruby:     { hi: [255, 150, 160], mid: [196, 18, 48],  deep: [92, 0, 20] },
  sapphire: { hi: [150, 190, 255], mid: [32, 72, 190],  deep: [8, 22, 84] },
  emerald:  { hi: [150, 255, 200], mid: [10, 140, 82],  deep: [0, 56, 32] },
  crystal:  { hi: [255, 255, 255], mid: [214, 226, 240], deep: [120, 134, 156] },
};

// Tube = metal wire along a polyline of {p: live[x,y,z], rad: canonical radial dir, vis}
function drawTube(ctx, F, pts, o) {
  const M = METALS[o.metal];
  const n = pts.length, segCount = o.closed ? n : n - 1, segs = [];
  for (let i = 0; i < segCount; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const v = Math.min(a.vis, b.vis) * (o.alpha ?? 1);
    if (v < 0.02) continue;
    const rad = norm(add(a.rad, b.rad));
    let br = 0.42 + 0.58 * Math.max(0, dot(rad, LIGHT) * 0.5 + 0.5);
    if (o.twist) br *= 0.66 + 0.34 * (0.5 + 0.5 * Math.sin(i * o.twist));
    const sp = Math.pow(Math.max(0, dot(rad, HALF)), 16);
    const w = o.w * (o.wmul ? o.wmul(i / segCount) : 1);
    segs.push({ a: a.p, b: b.p, v, br, sp, w, z: (a.p[2] + b.p[2]) / 2 });
  }
  if (!segs.length) return;
  segs.sort((s, t) => t.z - s.z);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.shadow) {
    const { dx, dy, a } = o.shadow;
    for (const s of segs) {
      ctx.strokeStyle = `rgba(40,20,8,${a * s.v})`; ctx.lineWidth = s.w * 1.9;
      line(ctx, [s.a[0] + dx, s.a[1] + dy], [s.b[0] + dx, s.b[1] + dy]);
    }
  }
  for (const s of segs) { ctx.strokeStyle = rgba(lit(F, M.dark, 0.8), 0.9 * s.v); ctx.lineWidth = s.w * 1.25; line(ctx, s.a, s.b); }
  for (const s of segs) { ctx.strokeStyle = rgba(lit(F, palAt(M, s.br)), s.v); ctx.lineWidth = s.w; line(ctx, s.a, s.b); }
  for (const s of segs) {
    let px = -(s.b[1] - s.a[1]), py = s.b[0] - s.a[0];
    const l = Math.hypot(px, py) || 1; px /= l; py /= l; if (py > 0) { px = -px; py = -py; }
    const off = s.w * 0.22, hb = Math.min(1, s.br + 0.3);
    ctx.strokeStyle = rgba(lit(F, mix(M.light, M.spec, s.sp)), s.v * (0.25 + 0.7 * hb));
    ctx.lineWidth = Math.max(0.5, s.w * 0.34);
    line(ctx, [s.a[0] + px * off, s.a[1] + py * off], [s.b[0] + px * off, s.b[1] + py * off]);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const s of segs) {
    if (s.sp < 0.5) continue;
    const a = ((s.sp - 0.5) / 0.5) * s.v * 0.55, x = (s.a[0] + s.b[0]) / 2, y = (s.a[1] + s.b[1]) / 2, r = Math.max(1, s.w * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(M.spec, a)); g.addColorStop(1, rgba(M.spec, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Disc-frame drawing: local units are cm, +x = u, +y = v on the skin plane.
function withDisc(ctx, F, anc, origin, u, v, fn) {
  const o = F.map(origin, anc), a = sub(F.map(add(origin, u), anc), o), b = sub(F.map(add(origin, v), anc), o);
  ctx.save(); ctx.setTransform(a[0], a[1], b[0], b[1], o[0], o[1]);
  const toScreen = (lx, ly) => [o[0] + a[0] * lx + b[0] * ly, o[1] + a[1] * lx + b[1] * ly];
  fn(toScreen); ctx.restore();
  return o;
}

function contactShadow(ctx, F, G, r, strength = 0.38) {
  withDisc(ctx, F, G.anchor, G.P, G.f, mul(G.t, -1), () => {
    const g = ctx.createRadialGradient(0.02 * r, -0.18 * r, 0, 0, -0.12 * r, r * 1.55);
    g.addColorStop(0, `rgba(30,14,4,${strength})`); g.addColorStop(1, 'rgba(30,14,4,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -0.12 * r, r * 1.55, 0, TAU); ctx.fill();
  });
}

// ---------- studs ----------
export function drawPin(ctx, F, G, prod, scale) {
  const r = prod.r * scale;
  const lift = prod.type === 'ball' || prod.type === 'pearl' ? r * 0.85 : r * 0.35;
  const center = add(G.P, mul(G.n, lift));
  // anchor is a blend of mesh vertices (a chord, slightly under the skin) → allow extra depth slack
  const vis = F.occ(F.map(center, G.anchor), 0.2) * ss(-0.2, 0.15, F.facing(G.n));
  if (vis < 0.02) return;
  ctx.save(); ctx.globalAlpha = vis;
  if (!F.thumb) contactShadow(ctx, F, G, r, prod.type === 'flower' ? 0.42 : 0.34);
  const M = METALS[prod.metal];
  const up = mul(G.t, -1);
  const tw = F.t * 0.004 + (G.side === 'L' ? 1.3 : 0);
  const ppc = F.ppc;

  if (prod.type === 'ball' || prod.type === 'pearl') {
    if (prod.type === 'pearl') {
      withDisc(ctx, F, G.anchor, add(G.P, mul(G.n, r * 0.15)), G.f, up, () => {
        ctx.fillStyle = rgba(lit(F, M.base)); ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
      });
    }
    const c = F.map(center, G.anchor);
    drawSphere(ctx, F, c[0], c[1], r * ppc, prod.type === 'pearl' ? 'pearl' : prod.metal, 1);
    drawStar(ctx, c[0] - r * ppc * 0.32, c[1] - r * ppc * 0.38, r * ppc * (0.9 + 0.5 * Math.sin(tw * 1.7)), 0.35);
  } else if (prod.type === 'diamond') {
    let prongs = [];
    const c = withDisc(ctx, F, G.anchor, center, G.f, up, (S) => {
      const g = ctx.createRadialGradient(-0.25 * r, 0.3 * r, 0, 0, 0, r);
      g.addColorStop(0, rgba(lit(F, [255, 255, 255]))); g.addColorStop(0.35, rgba(lit(F, [232, 240, 249])));
      g.addColorStop(0.78, rgba(lit(F, [176, 190, 208]))); g.addColorStop(1, rgba(lit(F, [96, 108, 126])));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      for (let k = 0; k < 8; k++) {
        const a0 = k * TAU / 8, a1 = a0 + TAU / 8, am = (a0 + a1) / 2;
        const flick = 0.5 + 0.5 * Math.sin(tw * 3 + k * 1.9);
        ctx.fillStyle = k % 2 ? `rgba(255,255,255,${0.15 + 0.45 * flick})` : `rgba(70,90,125,${0.1 + 0.25 * (1 - flick)})`;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * r * 0.55, Math.sin(a0) * r * 0.55);
        ctx.lineTo(Math.cos(am) * r, Math.sin(am) * r);
        ctx.lineTo(Math.cos(a1) * r * 0.55, Math.sin(a1) * r * 0.55);
        ctx.closePath(); ctx.fill();
      }
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); }
      ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
      ctx.lineWidth = r * 0.04; ctx.strokeStyle = 'rgba(80,96,124,0.45)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.lineWidth = r * 0.06; ctx.strokeStyle = 'rgba(60,70,88,0.55)'; ctx.stroke();
      // fire
      ctx.globalCompositeOperation = 'lighter';
      [[255, 80, 80], [80, 160, 255], [120, 255, 140]].forEach((col, k) => {
        const a = tw * 2 + k * 2.1;
        ctx.fillStyle = rgba(col, 0.35 * (0.5 + 0.5 * Math.sin(tw * 4 + k)));
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.12, 0, TAU); ctx.fill();
      });
      for (let k = 0; k < 4; k++) { const a = TAU / 8 + k * TAU / 4; prongs.push(S(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97)); }
    });
    for (const p of prongs) drawSphere(ctx, F, p[0], p[1], r * 0.2 * ppc, prod.metal, 1);
    const sparkle = 0.55 + 0.45 * Math.sin(tw * 2.3) * Math.sin(tw * 1.1 + 0.7);
    drawStar(ctx, c[0] - r * ppc * 0.25, c[1] - r * ppc * 0.3, r * ppc * (1.4 + 1.4 * sparkle), 0.45 + 0.5 * sparkle);
  } else if (prod.type === 'bezel') {
    const gem = GEMS[prod.gem];
    const c = withDisc(ctx, F, G.anchor, center, G.f, up, () => {
      const gm = ctx.createLinearGradient(0, r, 0, -r);
      gm.addColorStop(0, rgba(lit(F, M.light))); gm.addColorStop(0.5, rgba(lit(F, M.base))); gm.addColorStop(1, rgba(lit(F, M.dark)));
      ctx.fillStyle = gm; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(-0.25 * r, 0.3 * r, 0, 0, 0, r * 0.8);
      g.addColorStop(0, rgba(lit(F, gem.hi))); g.addColorStop(0.5, rgba(lit(F, gem.mid))); g.addColorStop(1, rgba(lit(F, gem.deep)));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.fill();
      ctx.lineWidth = r * 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + 0.3; line(ctx, [0, 0], [Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78]); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-0.25 * r, 0.32 * r, r * 0.26, r * 0.12, -0.5, 0, TAU); ctx.fill();
    });
    drawStar(ctx, c[0] - r * ppc * 0.25, c[1] - r * ppc * 0.32, r * ppc * (0.9 + 0.7 * (0.5 + 0.5 * Math.sin(tw * 2.1))), 0.4);
  } else if (prod.type === 'flower') {
    const granules = [];
    const c = withDisc(ctx, F, G.anchor, center, G.f, up, (S) => {
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6 + Math.PI / 6, cx = Math.cos(a) * r * 0.58, cy = Math.sin(a) * r * 0.58;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        const gm = ctx.createLinearGradient(-r * 0.4, -r * 0.3, r * 0.4, r * 0.3);
        gm.addColorStop(0, rgba(lit(F, M.dark))); gm.addColorStop(0.5, rgba(lit(F, M.light))); gm.addColorStop(1, rgba(lit(F, M.base)));
        ctx.fillStyle = gm; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.42, r * 0.3, 0, 0, TAU); ctx.fill();
        ctx.lineWidth = r * 0.04; ctx.strokeStyle = rgba(lit(F, M.dark), 0.8); ctx.stroke();
        const gs = ctx.createRadialGradient(-r * 0.06, r * 0.05, 0, 0, 0, r * 0.24);
        const flick = 0.5 + 0.5 * Math.sin(tw * 2.6 + k * 1.3);
        gs.addColorStop(0, '#ffffff'); gs.addColorStop(0.6, rgba(lit(F, [222 + 30 * flick, 232, 244]))); gs.addColorStop(1, rgba(lit(F, [140, 152, 172])));
        ctx.fillStyle = gs; ctx.beginPath(); ctx.ellipse(r * 0.04, 0, r * 0.25, r * 0.17, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      for (let k = 0; k < 10; k++) { const a = k * TAU / 10; granules.push(S(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36)); }
    });
    for (const p of granules) drawSphere(ctx, F, p[0], p[1], r * 0.075 * ppc, prod.metal, 1);
    const cc = F.map(add(center, mul(G.n, r * 0.2)), G.anchor);
    drawSphere(ctx, F, cc[0], cc[1], r * 0.3 * ppc, 'ruby', 1);
    drawStar(ctx, cc[0] - r * ppc * 0.1, cc[1] - r * ppc * 0.12, r * ppc * (0.8 + 0.6 * (0.5 + 0.5 * Math.sin(tw * 1.9))), 0.45);
    void c;
  }
  ctx.restore();
}

// ---------- nostril rings ----------
export function drawRing(ctx, F, G, prod, scale) {
  if (prod.type === 'nath') return drawNath(ctx, F, G, prod, scale);
  const r = (prod.d / 2) * scale, g = prod.g * Math.sqrt(scale);
  // The hoop hangs from the hole and rests on the nostril rim: tilt its centre inward until
  // the circle passes through the rim point, so the outer arc hugs the ala like a real hoop.
  const ca = Math.min(1, G.rim / (2 * r)), sa = Math.sqrt(1 - ca * ca);
  const C = add(G.P, mul(add(mul(G.t, ca), mul(G.n, -sa)), r));
  const a = norm(sub(G.P, C));
  const b = norm(sub(G.n, mul(a, dot(G.n, a))));       // outward at the hole
  const Rim = add(G.P, mul(G.t, G.rim));
  const rr = sub(Rim, C);
  let thR = Math.atan2(dot(rr, b), dot(rr, a)); if (thR < 0) thR += TAU;
  const fade = ss(-0.6, -0.15, F.facing(G.n));
  const pts = [], N = 120;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * TAU;
    const rad = add(mul(a, Math.cos(th)), mul(b, Math.sin(th)));
    const X = add(C, mul(rad, r));
    let vis = 1;
    if (!F.thumb) {
      // visible from the hole, round the outside and under the rim; hidden once it re-enters the nostril
      const inside = ss(thR - 0.05, thR + 0.12, th);
      vis = (1 - inside) * F.occ(F.map(X, G.anchor), 0.08) * fade;
    }
    pts.push({ p: F.map(X, G.anchor), rad: norm(add(rad, mul(G.n, 0.4))), vis, th });
  }
  const w = Math.max(1.4, g * F.ppc);
  drawTube(ctx, F, pts, {
    metal: prod.metal, w, closed: false, twist: prod.twist ? 1.6 : 0,
    shadow: F.thumb ? null : { dx: 0, dy: w * 0.55, a: 0.16 },
  });
  // emergence shadow where the ring enters the skin
  if (!F.thumb) {
    const e = F.map(G.P, G.anchor);
    const rr = Math.max(1.2, g * F.ppc * 1.1);
    ctx.save(); ctx.globalAlpha = fade * 0.5;
    const sg = ctx.createRadialGradient(e[0], e[1], 0, e[0], e[1], rr);
    sg.addColorStop(0, 'rgba(25,10,4,0.7)'); sg.addColorStop(1, 'rgba(25,10,4,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(e[0], e[1], rr, 0, TAU); ctx.fill(); ctx.restore();
  }
  const visAt = (th) => { const i = Math.round((th / TAU) * N) % (N + 1); return pts[i].vis; };
  if (prod.bead) {
    const th = Math.min(Math.PI, thR * 0.62), X = add(C, mul(add(mul(a, Math.cos(th)), mul(b, Math.sin(th))), r));
    const p = F.map(X, G.anchor);
    drawSphere(ctx, F, p[0], p[1], prod.bead * scale * F.ppc, prod.metal, visAt(th));
  }
  if (prod.gems) {
    for (let k = 0; k < 7; k++) {
      const th = thR * (0.25 + k * 0.1);
      const X = add(C, mul(add(mul(a, Math.cos(th)), mul(b, Math.sin(th))), r + g * 0.2));
      const p = F.map(X, G.anchor), v = visAt(th);
      drawSphere(ctx, F, p[0], p[1], g * 0.85 * F.ppc, 'crystal', v);
      if (k % 2 === 0) drawStar(ctx, p[0], p[1], g * F.ppc * (1.2 + Math.sin(F.t * 0.006 + k * 2)), 0.35 * v);
    }
  }
}

function drawNath(ctx, F, G, prod, scale) {
  const r = (prod.d / 2) * scale, g = prod.g;
  // A nath hangs forward of the cheek: tilt its plane toward the camera, not just sideways.
  const out = F.thumb ? G.n : norm(add(mul(G.n, 0.55), [0, 0, 0.85]));
  let d = [0, -1, 0]; d = norm(sub(d, mul(out, dot(d, out))));
  const wdir = norm(add(mul(d, 0.9), mul(out, 0.42)));
  const e2 = norm(sub(out, mul(wdir, dot(out, wdir))));
  const C = add(G.P, mul(wdir, r));
  const fade = ss(-0.6, -0.15, F.facing(G.n));
  const at = (th) => add(C, mul(add(mul(wdir, -Math.cos(th)), mul(e2, Math.sin(th))), r));
  const pts = [], N = 160;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * TAU, X = at(th), rel = sub(X, G.P);
    let vis = 1;
    if (!F.thumb) {
      const outside = ss(-0.03, 0.012, dot(rel, G.n));
      const below = ss(G.rim - 0.03, G.rim + 0.03, dot(rel, G.t));
      vis = Math.max(outside, below) * F.occ(F.map(X, G.anchor), 0.05) * fade;
    }
    pts.push({ p: F.map(X, G.anchor), rad: norm(sub(X, C)), vis });
  }
  const visAt = (th) => pts[Math.round(((th % TAU) / TAU) * N)].vis;
  const w = Math.max(1.5, g * F.ppc);
  // ear chain first (it sits on the cheek, under the ring)
  if (prod.chain) {
    const A = F.map(at(0.42 * Math.PI), G.anchor);
    let B, chainVis = 1;
    if (F.thumb) B = [A[0] + F.ppc * 1.6, A[1] - F.ppc * 1.4, 0];
    else { B = F.live[G.ear]; chainVis = ss(-0.35, 0.05, F.facing(G.cheekN)) * fade; }
    drawChain(ctx, F, A, B, chainVis * visAt(0.42 * Math.PI), prod.metal);
  }
  drawTube(ctx, F, pts, { metal: prod.metal, w, closed: false, shadow: F.thumb ? null : { dx: 0, dy: w * 0.7, a: 0.14 } });
  for (let k = 0; k <= 8; k++) {
    const th = 0.72 * Math.PI + k * 0.07 * Math.PI, p = F.map(at(th), G.anchor);
    drawSphere(ctx, F, p[0], p[1], 0.085 * scale * F.ppc, k === 4 ? 'ruby' : 'pearl', visAt(th));
  }
  // hanging drop
  const pv = F.map(at(Math.PI), G.anchor), L = 0.28 * scale * F.ppc;
  const bob = F.dangle(`nath${G.side}`, pv, L);
  const v = visAt(Math.PI);
  ctx.save(); ctx.globalAlpha = v; ctx.strokeStyle = rgba(lit(F, METALS[prod.metal].base)); ctx.lineWidth = Math.max(0.8, 0.025 * F.ppc);
  line(ctx, pv, bob); ctx.restore();
  drawSphere(ctx, F, bob[0], bob[1], 0.11 * scale * F.ppc, 'pearl', v);
  for (const k of [0, 1]) { const th = 0.25 * Math.PI + k * 0.06 * Math.PI, p = F.map(at(th), G.anchor); drawSphere(ctx, F, p[0], p[1], 0.06 * F.ppc, prod.metal, visAt(th)); }
}

function drawChain(ctx, F, A, B, vis, metal) {
  if (vis < 0.02 || !B) return;
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ctrl = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + L * 0.28];
  const q = (t) => [(1 - t) ** 2 * A[0] + 2 * (1 - t) * t * ctrl[0] + t * t * B[0], (1 - t) ** 2 * A[1] + 2 * (1 - t) * t * ctrl[1] + t * t * B[1]];
  const M = METALS[metal];
  ctx.save(); ctx.globalAlpha = vis * 0.9;
  ctx.strokeStyle = rgba(lit(F, M.dark), 0.7); ctx.lineWidth = Math.max(0.8, 0.03 * F.ppc);
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(ctrl[0], ctrl[1], B[0], B[1]); ctx.stroke();
  ctx.restore();
  const step = 0.2 * F.ppc, n = Math.max(6, Math.floor((L * 1.15) / step));
  for (let i = 1; i < n; i++) {
    const p = q(i / n), pearl = i % 6 === 3;
    drawSphere(ctx, F, p[0], p[1], (pearl ? 0.06 : 0.032) * F.ppc, pearl ? 'pearl' : metal, vis * (i / n > 0.9 ? 1 - (i / n - 0.9) * 8 : 1));
  }
}

// ---------- septum ----------
export function drawSeptum(ctx, F, G, prod, scale) {
  const r = (prod.d / 2) * scale, g = prod.g * Math.sqrt(scale);
  const C = add(G.S, mul(G.d, r));
  const at = (ph, rr = r) => add(C, mul(add(mul(G.d, -Math.cos(ph)), mul(G.lat, Math.sin(ph))), rr));
  const visOf = (X) => (F.thumb ? 1 : ss(-0.01, 0.045, dot(sub(G.U0, X), G.nU)) * F.occ(F.map(X, G.anchor), 0.05));
  const horse = prod.type === 'horseshoe';
  const ph0 = horse ? -0.8 * Math.PI : 0, ph1 = horse ? 0.8 * Math.PI : TAU;
  const N = 120, pts = [];
  for (let i = 0; i <= N; i++) {
    const ph = ph0 + (ph1 - ph0) * (i / N), X = at(ph);
    pts.push({ p: F.map(X, G.anchor), rad: norm(add(sub(X, C), [0, 0, 0.5 * r])), vis: visOf(X), ph });
  }
  const w = Math.max(1.6, g * F.ppc);
  const front = (u) => { const ph = ph0 + (ph1 - ph0) * u; const c = Math.cos(ph); return prod.gems && c < -0.55 ? 1.5 : 1; };
  drawTube(ctx, F, pts, { metal: prod.metal, w, closed: false, wmul: front, shadow: F.thumb ? null : { dx: 0, dy: F.ppc * 0.12, a: 0.13 } });
  if (horse) {
    for (const ph of [ph0, ph1]) {
      const X = at(ph), p = F.map(X, G.anchor);
      drawSphere(ctx, F, p[0], p[1], 0.17 * scale * F.ppc, prod.metal, visOf(X));
    }
  }
  if (prod.gems) {
    for (let k = 0; k < 7; k++) {
      const ph = Math.PI + (k - 3) * 0.12, X = at(ph, r + g * 0.15), p = F.map(add(X, [0, 0, g * 0.6]), G.anchor), v = visOf(X);
      drawSphere(ctx, F, p[0], p[1], g * 0.62 * F.ppc, 'crystal', v);
      drawStar(ctx, p[0], p[1], g * F.ppc * (1.1 + 0.9 * Math.sin(F.t * 0.005 + k * 1.7)), 0.4 * v);
    }
  }
  if (prod.drops) {
    for (const [k, ph] of [[0, Math.PI - 0.5], [1, Math.PI], [2, Math.PI + 0.5]]) {
      const X = at(ph), pv = F.map(X, G.anchor), v = visOf(X);
      const L = (k === 1 ? 0.32 : 0.24) * scale * F.ppc;
      const bob = F.dangle(`sep${k}`, pv, L);
      ctx.save(); ctx.globalAlpha = v; ctx.strokeStyle = rgba(lit(F, METALS[prod.metal].base)); ctx.lineWidth = Math.max(0.8, 0.03 * F.ppc);
      line(ctx, pv, bob); ctx.restore();
      drawSphere(ctx, F, bob[0], bob[1], (k === 1 ? 0.11 : 0.085) * scale * F.ppc, prod.metal, v);
    }
  }
}

// ---------- thumbnails ----------
export function renderThumb(canvas, cat, prod) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W * 0.45, H * 0.4, 0, W / 2, H / 2, W * 0.75);
  bg.addColorStop(0, '#f3e3d3'); bg.addColorStop(1, '#d9bba0');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  let ppc, cx = W / 2, cy = H / 2;
  if (cat === 'pin') ppc = (W * 0.2) / prod.r;
  else if (prod.type === 'nath') { ppc = (W * 0.32) / (prod.d / 2); cx = W * 0.42; cy = H * 0.55; }
  else ppc = (W * 0.3) / (prod.d / 2);
  ppc = Math.min(ppc, cat === 'pin' ? 260 : 180);
  STAR_SCALE = 0.45;
  const swing = new Map();
  const F = {
    thumb: true, ppc, t: 900, light: { k: 1, tint: [1, 1, 1] },
    map: (X) => [cx + ppc * X[0], cy - ppc * X[1], -ppc * X[2]],
    occ: () => 1, facing: () => 1,
    dangle: (key, pv, L) => { void swing; return [pv[0], pv[1] + L]; },
  };
  if (cat === 'pin') {
    const G = { side: 'L', P: [0, 0, 0], n: [0, 0, 1], t: [0, -1, 0], f: [1, 0, 0], anchor: null };
    drawPin(ctx, F, G, prod, 1);
  } else if (cat === 'ring') {
    const r = prod.d / 2;
    let G;
    if (prod.type === 'nath') {
      const wdir = norm(add(mul([0, -1, 0], 0.86), mul([-1, 0, 0], 0.5)));
      G = { side: 'L', P: mul(wdir, -r), n: [-1, 0, 0], t: [0, -1, 0], rim: 0.5, anchor: null };
    } else G = { side: 'L', P: [0, r, 0], n: [-1, 0, 0], t: [0, -1, 0], rim: 2 * r, anchor: null };
    drawRing(ctx, F, G, prod, 1);
  } else {
    const r = prod.d / 2;
    const G = { S: [0, r * 0.85, 0], lat: [1, 0, 0], d: [0, -1, 0], U0: [0, 0, 0], nU: [0, 1, 0], anchor: null };
    drawSeptum(ctx, F, G, prod, 1);
  }
  STAR_SCALE = 1;
}
