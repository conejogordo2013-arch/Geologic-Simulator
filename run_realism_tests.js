const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('DOC-20260331-WA0000.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
let js = m[1] + '\n;globalThis.__exports={CONFIG,TectonicEngine};';

function makeDummy() {
  const b = {
    style: {}, innerHTML: '', innerText: '', value: '1', checked: true, width: 64, height: 64,
    classList: { add: () => {}, remove: () => {}, toggle: () => {} }, addEventListener: () => {}, appendChild: () => {},
    setAttribute: () => {}, removeAttribute: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64 }),
    getContext: () => ({
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fillText: () => {}, clearRect: () => {},
      strokeStyle: '', lineWidth: 1, fillStyle: ''
    })
  };
  return new Proxy(b, { get: (t, p) => (p in t ? t[p] : (() => {})), set: (t, p, v) => { t[p] = v; return true; } });
}
const dummyDoc = { getElementById: () => makeDummy(), querySelectorAll: () => [], querySelector: () => makeDummy(), createElement: () => makeDummy(), body: makeDummy() };
const ctx = {
  console, Math, Float32Array, Uint8Array, Uint8ClampedArray, Array, Number, JSON,
  document: dummyDoc, window: { addEventListener: () => {} }, localStorage: { getItem: () => null, setItem: () => {} },
  performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, setTimeout: () => 0, clearTimeout: () => {}
};
vm.createContext(ctx);
vm.runInContext(js, ctx, { timeout: 30000 });
const { CONFIG, TectonicEngine } = ctx.__exports;

// Envolventes simplificadas basadas en rangos geofísicos observables (modelado 2D simplificado).
const SCIENTIFIC_ENVELOPES = {
  EarthLike: { oceanDepthMin: -8500, oceanDepthMax: -400, contElevMin: -2500, contElevMax: 5000 },
  Ocean: { oceanDepthMin: -9000, oceanDepthMax: -300, contElevMin: -3000, contElevMax: 5000 },
  Pangea: { oceanDepthMin: -9000, oceanDepthMax: -300, contElevMin: -3000, contElevMax: 5500 },
  EarthToday: { oceanDepthMin: -8500, oceanDepthMax: -400, contElevMin: -2500, contElevMax: 5000 },
  Microplates: { oceanDepthMin: -9000, oceanDepthMax: -300, contElevMin: -3000, contElevMax: 5500 },
  HotspotRich: { oceanDepthMin: -9000, oceanDepthMax: -200, contElevMin: -3500, contElevMax: 6000 },
  CollisionBelt: { oceanDepthMin: -9000, oceanDepthMax: -300, contElevMin: -3000, contElevMax: 6500 },
  SlowKinematics: { oceanDepthMin: -9000, oceanDepthMax: -300, contElevMin: -3000, contElevMax: 5500 },
  FastClamped: { oceanDepthMin: -9000, oceanDepthMax: -300, contElevMin: -3000, contElevMax: 6000 },
};

function collectMetrics(e) {
  let active = 0, cont = 0, ocean = 0, nan = 0, contElevSum = 0, oceanElevSum = 0;
  for (let i = 0; i < e.length; i++) {
    if (e.currPlate[i] === 0) continue;
    active++;
    if (e.currCrust[i] === 1) { cont++; contElevSum += e.currElev[i]; }
    else { ocean++; oceanElevSum += e.currElev[i]; }
    if (!Number.isFinite(e.currThick[i]) || !Number.isFinite(e.currDensity[i]) || !Number.isFinite(e.currElev[i]) || !Number.isFinite(e.currTemp[i])) nan++;
  }
  return {
    active,
    contPct: active ? cont / active * 100 : 0,
    avgContElev: cont ? contElevSum / cont : 0,
    avgOceanElev: ocean ? oceanElevSum / ocean : -4000,
    nan
  };
}

function runScenario(def, seedOffset) {
  const e = new TectonicEngine(64, 64);
  e.setSeed(def.seedBase + seedOffset);
  def.setup(e);
  if (def.speedMult !== undefined) {
    e.targetSpeedMultiplier = def.speedMult;
    e.currentSpeedMultiplier = def.speedMult;
  }
  if (def.injectHotspots) {
    for (let i = 0; i < 6; i++) {
      e.hotspots.push({ x: 8 + i * 9, y: 8 + (i % 4) * 11, radius: 4 + (i % 3), intensity: 0.2 + (i % 2) * 0.15 });
    }
  }

  const dt = 100000;
  const steps = Math.floor(def.ma * 1e6 / dt);
  let maxSpeed = 0;
  for (let i = 0; i < steps; i++) {
    e.updatePlateVelocities();
    maxSpeed = Math.max(maxSpeed, e.averageSpeed);
    e.step(dt);
  }

  const m = collectMetrics(e);
  const env = SCIENTIFIC_ENVELOPES[def.name];
  const phys = e.validatePhysicalPlausibility();

  const checks = {
    speed: maxSpeed <= CONFIG.maxPlateSpeedCmYr + 0.05,
    nan: m.nan === 0,
    density: !phys.issues.some(x => x.includes('Densidades invertidas')),
    growth: !phys.issues.some(x => x.includes('Crecimiento continental demasiado rápido')),
    oceanDepth: m.avgOceanElev >= env.oceanDepthMin && m.avgOceanElev <= env.oceanDepthMax,
    contElev: m.contPct < 5 ? true : (m.avgContElev >= env.contElevMin && m.avgContElev <= env.contElevMax),
  };
  const failedChecks = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return {
    scenario: def.name,
    seed: def.seedBase + seedOffset,
    ok: failedChecks.length === 0,
    failedChecks,
    maxSpeed: +maxSpeed.toFixed(2),
    contPct: +m.contPct.toFixed(1),
    avgContElev: +m.avgContElev.toFixed(0),
    avgOceanElev: +m.avgOceanElev.toFixed(0),
    issues: phys.issues.slice(0, 2)
  };
}

const scenarioDefs = [
  { name: 'EarthLike', count: 20, seedBase: 11000, ma: 10, setup: e => e.generateVoronoiSeed(8, 0.3) },
  { name: 'Ocean', count: 15, seedBase: 12000, ma: 10, setup: e => e.generateVoronoiSeed(14, 0.03) },
  { name: 'Pangea', count: 15, seedBase: 13000, ma: 16, setup: e => e.generatePangea() },
  { name: 'EarthToday', count: 20, seedBase: 14000, ma: 8, setup: e => e.generateEarthTodayApprox() },
  { name: 'Microplates', count: 20, seedBase: 15000, ma: 8, setup: e => e.generateVoronoiSeed(18, 0.22) },
  { name: 'HotspotRich', count: 15, seedBase: 16000, ma: 9, injectHotspots: true, setup: e => e.generateVoronoiSeed(10, 0.25) },
  { name: 'CollisionBelt', count: 15, seedBase: 17000, ma: 14, setup: e => e.generatePangea() },
  { name: 'SlowKinematics', count: 15, seedBase: 18000, ma: 12, speedMult: 0.45, setup: e => e.generateVoronoiSeed(9, 0.28) },
  { name: 'FastClamped', count: 15, seedBase: 19000, ma: 12, speedMult: 2.6, setup: e => e.generateVoronoiSeed(9, 0.28) },
];

const batch = [];
for (const def of scenarioDefs) for (let i = 0; i < def.count; i++) batch.push(runScenario(def, i));

const failed = batch.filter(x => !x.ok);
const byScenario = batch.reduce((acc, b) => {
  acc[b.scenario] ??= { total: 0, pass: 0 };
  acc[b.scenario].total++;
  if (b.ok) acc[b.scenario].pass++;
  return acc;
}, {});

console.log(JSON.stringify({
  total: batch.length,
  pass: batch.length - failed.length,
  fail: failed.length,
  byScenario,
  failed: failed.slice(0, 25)
}, null, 2));

if (failed.length) process.exit(1);
