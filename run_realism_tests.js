const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('DOC-20260331-WA0000.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
let js = m[1] + '\n;globalThis.__exports={CONFIG,TectonicEngine};';

function makeDummy(){
  const b={style:{},innerHTML:'',innerText:'',value:'1',checked:true,width:64,height:64,
    classList:{add:()=>{},remove:()=>{},toggle:()=>{}},addEventListener:()=>{},appendChild:()=>{},
    setAttribute:()=>{},removeAttribute:()=>{},
    getBoundingClientRect:()=>({left:0,top:0,width:64,height:64}),
    getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{},beginPath:()=>{},arc:()=>{},fill:()=>{},moveTo:()=>{},lineTo:()=>{},stroke:()=>{},fillText:()=>{},clearRect:()=>{},strokeStyle:'',lineWidth:1,fillStyle:''})
  };
  return new Proxy(b,{get:(t,p)=>p in t?t[p]:(()=>{}),set:(t,p,v)=>{t[p]=v;return true;}})
}
const dummyDoc={getElementById:()=>makeDummy(),querySelectorAll:()=>[],querySelector:()=>makeDummy(),createElement:()=>makeDummy(),body:makeDummy()};
const ctx={console,Math,Float32Array,Uint8Array,Uint8ClampedArray,Array,Number,JSON,document:dummyDoc,window:{addEventListener:()=>{}},localStorage:{getItem:()=>null,setItem:()=>{}},performance:{now:()=>0},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
vm.createContext(ctx);
vm.runInContext(js,ctx,{timeout:30000});
const {CONFIG,TectonicEngine}=ctx.__exports;

const REAL_ENVELOPES = {
  EarthLike: { oceanDepthMin: -8000, oceanDepthMax: -500 },
  EarthToday: { oceanDepthMin: -8000, oceanDepthMax: -500 },
  Pangea: { oceanDepthMin: -8500, oceanDepthMax: -400 },
  Ocean: { oceanDepthMin: -8500, oceanDepthMax: -400 }
};

function collectMetrics(e){
  let active=0, cont=0, ocean=0, dorsalCont=0, nan=0, contElevSum=0, oceanElevSum=0, maxSpeed=e.averageSpeed;
  for(let i=0;i<e.length;i++){
    if(e.currPlate[i]===0) continue;
    active++;
    if(e.currCrust[i]===1){ cont++; contElevSum += e.currElev[i]; if(e.boundaryType[i]===2) dorsalCont++; }
    else { ocean++; oceanElevSum += e.currElev[i]; }
    if(!Number.isFinite(e.currThick[i])||!Number.isFinite(e.currDensity[i])||!Number.isFinite(e.currElev[i])||!Number.isFinite(e.currTemp[i])) nan++;
  }
  return {
    active,
    contPct: active ? cont/active*100 : 0,
    avgContElev: cont ? contElevSum/cont : 0,
    avgOceanElev: ocean ? oceanElevSum/ocean : -4000,
    dorsalCont,
    nan,
    maxSpeed,
  };
}

function runOne(name, seed, setup, ma){
  const e = new TectonicEngine(64,64);
  e.setSeed(seed);
  setup(e);
  const dt=100000, steps=Math.floor(ma*1e6/dt);
  let maxSpeed=0;
  for(let i=0;i<steps;i++){
    e.updatePlateVelocities();
    maxSpeed=Math.max(maxSpeed, e.averageSpeed);
    e.step(dt);
  }
  const m = collectMetrics(e);
  m.maxSpeed = maxSpeed;
  const env = REAL_ENVELOPES[name];
  const phys = e.validatePhysicalPlausibility();

  const checks = {
    speed: m.maxSpeed <= CONFIG.maxPlateSpeedCmYr + 0.05,
    nan: m.nan === 0,
    growth: !phys.issues.some(x=>x.includes('Crecimiento continental demasiado rápido')),
    density: !phys.issues.some(x=>x.includes('Densidades invertidas')),
    oceanDepth: m.avgOceanElev >= env.oceanDepthMin && m.avgOceanElev <= env.oceanDepthMax,
    contElev: m.contPct < 1 ? true : (m.avgContElev >= -2500 && m.avgContElev <= 5000),
  };
  const failedChecks = Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
  return {
    name, seed, ma,
    ok: failedChecks.length === 0,
    failedChecks,
    contPct:+m.contPct.toFixed(1),
    avgContElev:+m.avgContElev.toFixed(0),
    avgOceanElev:+m.avgOceanElev.toFixed(0),
    maxSpeed:+m.maxSpeed.toFixed(2),
    issues: phys.issues.slice(0,2)
  };
}

const batch=[];
for(let i=0;i<30;i++) batch.push(runOne('EarthLike', 1000+i, e=>e.generateVoronoiSeed(8,0.3), 10));
for(let i=0;i<25;i++) batch.push(runOne('Ocean', 2000+i, e=>e.generateVoronoiSeed(12,0.05), 10));
for(let i=0;i<20;i++) batch.push(runOne('Pangea', 3000+i, e=>e.generatePangea(), 15));
for(let i=0;i<25;i++) batch.push(runOne('EarthToday', 4000+i, e=>e.generateEarthTodayApprox(), 8));

const failed=batch.filter(b=>!b.ok);
const byScenario = batch.reduce((acc,b)=>{acc[b.name]??={total:0,pass:0};acc[b.name].total++; if(b.ok)acc[b.name].pass++; return acc;},{});
console.log(JSON.stringify({
  total: batch.length,
  pass: batch.length - failed.length,
  fail: failed.length,
  byScenario,
  failed: failed.slice(0,20)
}, null, 2));
if(failed.length) process.exit(1);
