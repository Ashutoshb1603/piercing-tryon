import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
import { CANON, OCC_TRIS } from './mesh-data.js';
import {
  PRODUCTS, METALS, MIRROR, nostrilGeom, septumGeom, drawPin, drawRing, drawSeptum, renderThumb, ss,
} from './render.js';

// Overridable for offline / self-hosted use: ?wasm=...&model=...
const QS = new URLSearchParams(location.search);
const WASM_URL = QS.get('wasm') || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL_URL = QS.get('model') || 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const $ = (s) => document.querySelector(s);
const canvas = $('#view'), ctx = canvas.getContext('2d');
const video = $('#video');
const statusEl = $('#status'), hintEl = $('#hint');

// ---------------- state ----------------
const state = {
  tab: 'pin',
  pin: { id: 'solitaire', side: 'L', size: 1, up: 0, front: 0 },
  ring: { id: null, side: 'L', size: 1, up: 0, front: 0 },
  septum: { id: null, size: 1, up: 0 },
  mirror: true, debug: false, compare: false, zoom: false,
};
const prodById = (cat, id) => PRODUCTS[cat].find((p) => p.id === id);

// ---------------- affine fit: canonical (cm) -> live image space (px) ----------------
const FIT = (() => {
  const nose = [1, 2, 4, 5, 6, 19, 94, 195, 197, 168, 48, 49, 64, 98, 102, 129, 115, 131, 166, 75, 79, 20, 60, 97, 99, 141, 125, 44, 45, 59];
  const face = [33, 133, 10, 151, 9, 234, 127, 116, 50];
  const map = new Map();
  for (const i of nose) { map.set(i, 3); map.set(MIRROR[i], 3); }
  for (const i of face) { map.set(i, 1); map.set(MIRROR[i], 1); }
  const idx = [...map.keys()], w = idx.map((i) => map.get(i));
  // G = (Xᵀ W X)^-1 Xᵀ W   (4 x N), X rows = [x y z 1]
  const XtWX = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  idx.forEach((i, k) => {
    const x = [...CANON[i], 1];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) XtWX[a][b] += w[k] * x[a] * x[b];
  });
  const inv = invert4(XtWX);
  const G = Array.from({ length: 4 }, () => new Float64Array(idx.length));
  idx.forEach((i, k) => {
    const x = [...CANON[i], 1];
    for (let a = 0; a < 4; a++) { let s = 0; for (let b = 0; b < 4; b++) s += inv[a][b] * x[b]; G[a][k] = s * w[k]; }
  });
  return { idx, G };
})();

function invert4(m) {
  const n = 4, a = m.map((r, i) => [...r, ...[0, 1, 2, 3].map((j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c]; for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j]; }
  }
  return a.map((r) => r.slice(n));
}
function inv3T(L) { // inverse-transpose of 3x3 (rows)
  const [a, b, c] = L[0], [d, e, f] = L[1], [g, h, i] = L[2];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-9;
  const inv = [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
  return { T: [[inv[0][0], inv[1][0], inv[2][0]], [inv[0][1], inv[1][1], inv[2][1]], [inv[0][2], inv[1][2], inv[2][2]]], det };
}

// ---------------- One-Euro smoothing ----------------
class OneEuro {
  constructor(n, minCutoff = 1.6, beta = 0.012, dCutoff = 1.2) { Object.assign(this, { n, minCutoff, beta, dCutoff }); this.reset(); }
  reset() { this.x = null; this.dx = new Float64Array(this.n); this.t = 0; }
  static a(cut, dt) { const r = 2 * Math.PI * cut * dt; return r / (r + 1); }
  filter(v, t) {
    if (!this.x || t - this.t > 0.5) { this.x = Float64Array.from(v); this.dx.fill(0); this.t = t; return this.x; }
    const dt = Math.max(1e-3, t - this.t); this.t = t;
    const ad = OneEuro.a(this.dCutoff, dt);
    for (let i = 0; i < this.n; i++) {
      const dv = (v[i] - this.x[i]) / dt;
      this.dx[i] += ad * (dv - this.dx[i]);
      const cut = this.minCutoff + this.beta * Math.abs(this.dx[i]);
      this.x[i] += OneEuro.a(cut, dt) * (v[i] - this.x[i]);
    }
    return this.x;
  }
}
const euro = new OneEuro(478 * 3);

// ---------------- per-frame model ----------------
const swing = new Map();
const light = { k: 1, tint: [1, 1, 1] };
const lightCanvas = document.createElement('canvas'); lightCanvas.width = lightCanvas.height = 10;
const lctx = lightCanvas.getContext('2d', { willReadFrequently: true });

function buildFrame(flat, W, H, t) {
  const live = new Array(468);
  for (let i = 0; i < 468; i++) live[i] = [flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]];
  const B = [0, 1, 2, 3].map(() => [0, 0, 0]);
  FIT.idx.forEach((li, k) => {
    const p = live[li];
    for (let a = 0; a < 4; a++) { const g = FIT.G[a][k]; B[a][0] += g * p[0]; B[a][1] += g * p[1]; B[a][2] += g * p[2]; }
  });
  const { T: NT, det } = inv3T([B[0], B[1], B[2]]);
  void det;
  const ppc = (Math.hypot(...B[0]) + Math.hypot(...B[1])) / 2;
  const apply = (X) => [
    X[0] * B[0][0] + X[1] * B[1][0] + X[2] * B[2][0] + B[3][0],
    X[0] * B[0][1] + X[1] * B[1][1] + X[2] * B[2][1] + B[3][1],
    X[0] * B[0][2] + X[1] * B[1][2] + X[2] * B[2][2] + B[3][2],
  ];
  const map = (X, anc) => {
    const p = apply(X);
    if (!anc) return p;
    let ax = 0, ay = 0, az = 0;
    anc.idx.forEach((i, k) => { ax += live[i][0] * anc.w[k]; ay += live[i][1] * anc.w[k]; az += live[i][2] * anc.w[k]; });
    const c = apply(anc.c);
    return [p[0] + ax - c[0], p[1] + ay - c[1], p[2] + az - c[2]];
  };
  const facing = (n) => {
    const v = [
      n[0] * NT[0][0] + n[1] * NT[1][0] + n[2] * NT[2][0],
      n[0] * NT[0][1] + n[1] * NT[1][1] + n[2] * NT[2][1],
      n[0] * NT[0][2] + n[1] * NT[1][2] + n[2] * NT[2][2],
    ];
    return -v[2] / (Math.hypot(v[0], v[1], v[2]) || 1); // camera looks along +z in landmark space
  };
  let tris = null;
  const occ = (q, extra = 0) => {
    if (!tris) {
      tris = [];
      for (const [a, b, c] of OCC_TRIS) {
        const A = live[a], Bv = live[b], C = live[c];
        const d = (Bv[1] - C[1]) * (A[0] - C[0]) + (C[0] - Bv[0]) * (A[1] - C[1]);
        if (Math.abs(d) < 1e-6) continue;
        tris.push({ A, B: Bv, C, d, x0: Math.min(A[0], Bv[0], C[0]), x1: Math.max(A[0], Bv[0], C[0]), y0: Math.min(A[1], Bv[1], C[1]), y1: Math.max(A[1], Bv[1], C[1]) });
      }
    }
    const [x, y, z] = q; let zf = Infinity;
    for (const T of tris) {
      if (x < T.x0 || x > T.x1 || y < T.y0 || y > T.y1) continue;
      const l1 = ((T.B[1] - T.C[1]) * (x - T.C[0]) + (T.C[0] - T.B[0]) * (y - T.C[1])) / T.d;
      const l2 = ((T.C[1] - T.A[1]) * (x - T.C[0]) + (T.A[0] - T.C[0]) * (y - T.C[1])) / T.d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const zz = l1 * T.A[2] + l2 * T.B[2] + l3 * T.C[2];
      if (zz < zf) zf = zz;
    }
    if (zf === Infinity) return 1;
    const eps = (0.06 + extra) * ppc, band = 0.08 * ppc;
    return 1 - ss(eps, eps + band, z - zf);
  };
  const dangle = (key, pv, L) => {
    let s = swing.get(key);
    if (!s || Math.hypot(s.x - pv[0], s.y - pv[1]) > L * 4) s = { x: pv[0], y: pv[1] + L, px: pv[0], py: pv[1] + L };
    const nx = s.x + (s.x - s.px) * 0.86, ny = s.y + (s.y - s.py) * 0.86 + L * 0.06;
    s.px = s.x; s.py = s.y;
    const dx = nx - pv[0], dy = ny - pv[1], d = Math.hypot(dx, dy) || 1;
    s.x = pv[0] + (dx / d) * L; s.y = pv[1] + (dy / d) * L;
    swing.set(key, s);
    return [s.x, s.y];
  };
  return { live, B, ppc, map, facing, occ, dangle, light, t, thumb: false, W, H };
}

function sampleLight(src, F) {
  const c = F.live[1], s = 1.6 * F.ppc;
  try {
    lctx.drawImage(src, c[0] - s, c[1] - s * 0.6, 2 * s, 2 * s, 0, 0, 10, 10);
    const d = lctx.getImageData(0, 0, 10, 10).data;
    let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; r /= n * 255; g /= n * 255; b /= n * 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b, m = (r + g + b) / 3 || 1;
    const k = Math.min(1.12, Math.max(0.58, 0.42 + 0.9 * lum));
    const tint = [r / m, g / m, b / m].map((x) => 1 + 0.22 * (x - 1));
    light.k += (k - light.k) * 0.25;
    for (let i = 0; i < 3; i++) light.tint[i] += (tint[i] - light.tint[i]) * 0.25;
  } catch { /* ignore */ }
}

// ---------------- drawing the look ----------------
function sidesOf(s) { return s === 'B' ? ['L', 'R'] : [s]; }

function drawLook(F) {
  const pin = state.pin.id && prodById('pin', state.pin.id);
  const ring = state.ring.id && prodById('ring', state.ring.id);
  const sep = state.septum.id && prodById('septum', state.septum.id);
  if (sep) drawSeptum(ctx, F, septumGeom(state.septum.up), sep, state.septum.size);
  const pinSides = pin ? sidesOf(state.pin.side) : [];
  if (ring) {
    for (const side of sidesOf(state.ring.side)) {
      const shared = pinSides.includes(side);
      const G = nostrilGeom(side, state.ring.up - (shared ? 0.6 : 0), state.ring.front - (shared ? 1.2 : 0), 'ring');
      drawRing(ctx, F, G, ring, state.ring.size);
    }
  }
  if (pin) {
    for (const side of pinSides) {
      const shared = ring && sidesOf(state.ring.side).includes(side);
      const G = nostrilGeom(side, state.pin.up, state.pin.front);
      drawPin(ctx, F, G, pin, state.pin.size);
    }
  }
}

function drawDebug(F) {
  ctx.save();
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,255,200,0.25)';
  for (const [a, b, c] of OCC_TRIS) {
    const A = F.live[a], B = F.live[b], C = F.live[c];
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.stroke();
  }
  ctx.fillStyle = '#ff3b6b';
  for (const i of FIT.idx) { const p = F.map(CANON[i]); ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, 7); ctx.fill(); }
  for (const side of ['L', 'R']) {
    const G = nostrilGeom(side);
    const p = F.map(G.P, G.anchor), q = F.map([G.P[0] + G.n[0] * 0.5, G.P[1] + G.n[1] * 0.5, G.P[2] + G.n[2] * 0.5], G.anchor);
    ctx.strokeStyle = '#ffd400'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    ctx.fillStyle = '#ffd400'; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill();
  }
  const S = septumGeom(); const sp = F.map(S.S, S.anchor);
  ctx.fillStyle = '#4da3ff'; ctx.beginPath(); ctx.arc(sp[0], sp[1], 3, 0, 7); ctx.fill();
  ctx.restore();
  dbgText = `ppc ${F.ppc.toFixed(1)} px/cm · L-facing ${F.facing(nostrilGeom('L').n).toFixed(2)} · R-facing ${F.facing(nostrilGeom('R').n).toFixed(2)} · light ${light.k.toFixed(2)}`;
}
let dbgText = '';

// ---------------- tracking loop ----------------
let landmarker = null, mode = 'idle', source = null, lastVideoTime = -1, lastResult = null, frameNo = 0;
let fpsT = performance.now(), fpsN = 0, fps = 0;

async function initModel() {
  setStatus('Loading face model…', 'busy');
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: false,
    minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU')); }
  catch (e) { console.warn('GPU delegate failed, using CPU', e); landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU')); }
  landmarker._mode = 'VIDEO';
  setStatus('Model ready', 'ok');
  $('#startCam').disabled = false; $('#startCam').textContent = 'Start camera';
}
const modelReady = initModel().catch((e) => { console.error(e); setStatus('Could not load face model', 'err'); });

async function setRunMode(m) {
  if (landmarker && landmarker._mode !== m) { await landmarker.setOptions({ runningMode: m }); landmarker._mode = m; }
}

async function startCamera() {
  await modelReady; if (!landmarker) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; await video.play();
    await setRunMode('VIDEO');
    mode = 'camera'; source = video; euro.reset(); swing.clear(); lastResult = null;
    state.mirror = true; syncToggles();
    $('#startOverlay').classList.add('hidden'); document.body.classList.add('live');
    $('#backCam').hidden = true;
  } catch (e) {
    console.error(e);
    setStatus('Camera blocked — allow access or upload a photo', 'err');
  }
}

async function usePhoto(file) {
  await modelReady; if (!landmarker) return;
  const img = new Image(); img.src = URL.createObjectURL(file); await img.decode();
  await setRunMode('IMAGE');
  const res = landmarker.detect(img);
  mode = 'photo'; source = img; euro.reset(); swing.clear();
  lastResult = res; state.mirror = false; syncToggles();
  $('#startOverlay').classList.add('hidden'); document.body.classList.add('live');
  $('#backCam').hidden = false;
  if (!res.faceLandmarks?.length) setStatus('No face found in that photo', 'err');
}

function loop() {
  requestAnimationFrame(loop);
  if (!source) return;
  const W = source.videoWidth || source.naturalWidth, H = source.videoHeight || source.naturalHeight;
  if (!W || !H) return;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const now = performance.now();
  if (mode === 'camera' && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    lastResult = landmarker.detectForVideo(video, now);
    fpsN++;
  }
  if (now - fpsT > 1000) { fps = (fpsN * 1000) / (now - fpsT); fpsN = 0; fpsT = now; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(source, 0, 0, W, H);
  const lm = lastResult?.faceLandmarks?.[0];
  if (!lm) {
    updateView(null);
    hintEl.classList.toggle('show', mode === 'camera');
    if (mode === 'camera') setStatus('Looking for your face…', 'busy');
    swing.clear(); return;
  }
  hintEl.classList.remove('show');
  const raw = new Float64Array(478 * 3);
  for (let i = 0; i < lm.length && i < 478; i++) { raw[i * 3] = lm[i].x * W; raw[i * 3 + 1] = lm[i].y * H; raw[i * 3 + 2] = lm[i].z * W; }
  const flat = mode === 'camera' ? euro.filter(raw, now / 1000) : raw;
  const F = buildFrame(flat, W, H, now);
  if (QS.has('test')) window.__F = F;
  if (frameNo++ % 6 === 0) sampleLight(source, F);
  updateView(F);
  if (!state.compare) drawLook(F);
  if (state.debug) drawDebug(F);
  if (mode === 'camera') setStatus(`Tracking · ${fps.toFixed(0)} fps`, 'ok');
  else setStatus('Photo mode', 'ok');
  $('#debugInfo').textContent = state.debug ? dbgText : '';
}
requestAnimationFrame(loop);

// ---------------- view transform (mirror + close-up zoom around the nose) ----------------
const view = { z: 1, nx: null, ny: null };
function updateView(F) {
  const el = canvas.parentElement.getBoundingClientRect(), W = canvas.width, H = canvas.height;
  if (!W || !el.width) return;
  const cover = mode !== 'photo';
  const sc = cover ? Math.max(el.width / W, el.height / H) : Math.min(el.width / W, el.height / H);
  const ox = (el.width - W * sc) / 2, oy = (el.height - H * sc) / 2;
  if (F) {
    const tx = ox + F.live[4][0] * sc, ty = oy + F.live[4][1] * sc;
    view.nx = view.nx == null ? tx : view.nx + (tx - view.nx) * 0.25;
    view.ny = view.ny == null ? ty : view.ny + (ty - view.ny) * 0.25;
  }
  const target = state.zoom && view.nx != null ? (mode === 'photo' ? 3.2 : 2.3) : 1;
  view.z += (target - view.z) * 0.15; if (Math.abs(view.z - target) < 0.002) view.z = target;
  const z = view.z, k = Math.min(1, (z - 1) / 1.3);
  const nx = view.nx ?? el.width / 2, ny = view.ny ?? el.height / 2;
  const cx = nx + (el.width / 2 - nx) * k, cy = ny + (el.height * 0.45 - ny) * k;
  const a = state.mirror ? -z : z, e = state.mirror ? el.width - cx + z * nx : cx - z * nx, f = cy - z * ny;
  canvas.style.transform = `matrix(${a},0,0,${z},${e},${f})`;
}

function setStatus(text, kind) {
  if (statusEl.textContent !== text) statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

// ---------------- UI ----------------
const TABS = { pin: 'Nose Pin', ring: 'Nose Ring', septum: 'Septum' };

function buildUI() {
  const tabs = $('#tabs');
  tabs.innerHTML = '';
  for (const [k, label] of Object.entries(TABS)) {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.tab = k; b.innerHTML = `<span>${label}</span><i class="dot"></i>`;
    b.onclick = () => { state.tab = k; render(); };
    tabs.appendChild(b);
  }
  render();
}

function render() {
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === state.tab);
    b.querySelector('.dot').classList.toggle('on', !!state[b.dataset.tab].id);
  });
  const cat = state.tab, s = state[cat];
  const grid = $('#grid'); grid.innerHTML = '';
  const none = document.createElement('button');
  none.className = 'card none' + (s.id ? '' : ' selected');
  none.innerHTML = '<div class="thumb empty"><svg viewBox="0 0 24 24" width="26" height="26"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 18 18 6" stroke="currentColor" stroke-width="1.5"/></svg></div><div class="meta"><b>None</b><small>Remove</small></div>';
  none.onclick = () => { s.id = null; render(); };
  grid.appendChild(none);
  for (const p of PRODUCTS[cat]) {
    const b = document.createElement('button');
    b.className = 'card' + (s.id === p.id ? ' selected' : '');
    const cv = document.createElement('canvas'); cv.width = cv.height = 160; cv.className = 'thumb';
    renderThumb(cv, cat, p);
    b.appendChild(cv);
    const m = document.createElement('div'); m.className = 'meta';
    m.innerHTML = `<b>${p.name}</b><small>${p.note}</small><em>${METALS[p.metal].name}</em>`;
    b.appendChild(m);
    b.onclick = () => { s.id = p.id; render(); };
    grid.appendChild(b);
  }
  renderControls();
  renderWearing();
}

function renderControls() {
  const cat = state.tab, s = state[cat], box = $('#controls');
  const prod = s.id && prodById(cat, s.id);
  const sizeLabel = () => {
    if (!prod) return '';
    const mm = cat === 'pin' ? prod.r * 2 * s.size * 10 : prod.d * s.size * 10;
    return `${mm.toFixed(1)} mm`;
  };
  let html = '';
  if (cat !== 'septum') {
    html += `<div class="row"><label>Nostril</label><div class="seg" id="side">
      ${[['L', 'Left'], ['R', 'Right'], ['B', 'Both']].map(([v, t]) => `<button data-v="${v}" class="${s.side === v ? 'on' : ''}">${t}</button>`).join('')}
    </div></div>`;
  }
  html += slider('size', cat === 'pin' ? 'Stud size' : 'Diameter', 0.7, 1.6, 0.05, s.size, sizeLabel());
  html += slider('up', 'Height', cat === 'septum' ? -1.5 : -2, cat === 'septum' ? 1.5 : 2, 0.1, s.up, `${s.up > 0 ? '+' : ''}${s.up.toFixed(1)} mm`);
  if (cat !== 'septum') html += slider('front', 'Front / back', -2, 2, 0.1, s.front, `${s.front > 0 ? '+' : ''}${s.front.toFixed(1)} mm`);
  html += `<button class="link" id="resetPos">Reset placement</button>`;
  box.innerHTML = html;
  box.classList.toggle('disabled', !prod);
  box.querySelectorAll('#side button').forEach((b) => (b.onclick = () => { s.side = b.dataset.v; renderControls(); }));
  box.querySelectorAll('input[type=range]').forEach((inp) => {
    inp.oninput = () => {
      s[inp.name] = parseFloat(inp.value);
      const out = inp.closest('.row').querySelector('output');
      out.textContent = inp.name === 'size' ? sizeLabel() : `${s[inp.name] > 0 ? '+' : ''}${s[inp.name].toFixed(1)} mm`;
    };
  });
  $('#resetPos').onclick = () => { s.size = 1; s.up = 0; if ('front' in s) s.front = 0; renderControls(); };
}

function slider(name, label, min, max, step, val, out) {
  return `<div class="row"><label>${label}</label><input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${out}</output></div>`;
}

function renderWearing() {
  const w = $('#wearing'); w.innerHTML = '';
  const sideTxt = { L: 'left', R: 'right', B: 'both sides' };
  for (const cat of ['pin', 'ring', 'septum']) {
    const s = state[cat]; if (!s.id) continue;
    const p = prodById(cat, s.id);
    const chip = document.createElement('span'); chip.className = 'chip';
    chip.innerHTML = `${p.name}${cat !== 'septum' ? ` <i>· ${sideTxt[s.side]}</i>` : ''} <button aria-label="Remove">×</button>`;
    chip.querySelector('button').onclick = () => { s.id = null; render(); };
    w.appendChild(chip);
  }
  if (!w.children.length) w.innerHTML = '<span class="muted">Nothing selected — pick a piece above.</span>';
}

function syncToggles() {
  canvas.classList.toggle('contain', mode === 'photo');
  $('#mirrorBtn').classList.toggle('on', state.mirror);
  $('#debugBtn').classList.toggle('on', state.debug);
  $('#zoomBtn').classList.toggle('on', state.zoom);
}

// toolbar
const cmp = $('#compareBtn');
const setCompare = (v) => { state.compare = v; cmp.classList.toggle('on', v); };
cmp.addEventListener('pointerdown', (e) => { e.preventDefault(); setCompare(true); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => cmp.addEventListener(ev, () => setCompare(false)));
window.addEventListener('keydown', (e) => { if (e.key === 'c' && !e.repeat && document.activeElement.tagName !== 'INPUT') setCompare(true); });
window.addEventListener('keyup', (e) => { if (e.key === 'c') setCompare(false); });
$('#mirrorBtn').onclick = () => { state.mirror = !state.mirror; syncToggles(); };
$('#zoomBtn').onclick = () => { state.zoom = !state.zoom; syncToggles(); };
$('#debugBtn').onclick = () => { state.debug = !state.debug; syncToggles(); };
$('#shotBtn').onclick = () => {
  if (!source) return;
  const out = document.createElement('canvas'); out.width = canvas.width; out.height = canvas.height;
  const o = out.getContext('2d');
  if (state.mirror) { o.translate(out.width, 0); o.scale(-1, 1); }
  o.drawImage(canvas, 0, 0);
  const a = document.createElement('a'); a.download = `nose-tryon-${Date.now()}.png`; a.href = out.toDataURL('image/png'); a.click();
  const fl = $('#flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
};
const file = $('#file');
file.onchange = () => { if (file.files[0]) usePhoto(file.files[0]); file.value = ''; };
$('#uploadBtn').onclick = () => file.click();
$('#uploadBtn2').onclick = () => file.click();
$('#startCam').onclick = startCamera;
$('#backCam').onclick = startCamera;

buildUI();
syncToggles();
window.__tryon = { state, render };
