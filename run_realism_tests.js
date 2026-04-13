const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('DOC-20260331-WA0000.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
let js = m[1] + '\n;globalThis.__exports={CONFIG,TectonicEngine};';
function makeDummy(){const b={style:{},innerHTML:'',innerText:'',value:'1',checked:true,width:64,height:64,classList:{add:()=>{},remove:()=>{},toggle:()=>{}},addEventListener:()=>{},appendChild:()=>{},setAttribute:()=>{},removeAttribute:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:64,height:64}),getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{},beginPath:()=>{},arc:()=>{},fill:()=>{},moveTo:()=>{},lineTo:()=>{},stroke:()=>{},fillText:()=>{},clearRect:()=>{},strokeStyle:'',lineWidth:1,fillStyle:''})};return new Proxy(b,{get:(t,p)=>p in t?t[p]:(()=>{}),set:(t,p,v)=>{t[p]=v;return true;}})}
const dummyDoc={getElementById:()=>makeDummy(),querySelectorAll:()=>[],querySelector:()=>makeDummy(),createElement:()=>makeDummy(),body:makeDummy()};
const ctx={console,Math,Float32Array,Uint8Array,Uint8ClampedArray,Array,Number,JSON,document:dummyDoc,window:{addEventListener:()=>{}},localStorage:{getItem:()=>null,setItem:()=>{}},performance:{now:()=>0},requestAnimationFrame:()=>0,cancelAnimationFrame:()=>{},setTimeout:()=>0,clearTimeout:()=>{}};
vm.createContext(ctx); vm.runInContext(js,ctx,{timeout:30000});
const {CONFIG,TectonicEngine}=ctx.__exports;

function runOne(name, seed, setup, ma, expectContMin, expectContMax){
  const e=new TectonicEngine(64,64); e.setSeed(seed); setup(e);
  const dt=100000, steps=Math.floor(ma*1e6/dt); let maxSpeed=0;
  for(let i=0;i<steps;i++){e.updatePlateVelocities(); maxSpeed=Math.max(maxSpeed,e.averageSpeed); e.step(dt);}  
  const phys=e.validatePhysicalPlausibility();
  let active=0,cont=0,dorsal=0,nan=0;
  for(let i=0;i<e.length;i++) if(e.currPlate[i]!==0){active++; if(e.currCrust[i]===1)cont++; if(e.currCrust[i]===1&&e.boundaryType[i]===2)dorsal++; if(!Number.isFinite(e.currThick[i])||!Number.isFinite(e.currDensity[i])||!Number.isFinite(e.currElev[i])||!Number.isFinite(e.currTemp[i]))nan++;}
  const contPct=active?cont/active*100:0;
  const growthIssue=phys.issues.find(x=>x.includes('Crecimiento continental demasiado rápido'));
  const dorsalIssue=phys.issues.find(x=>x.includes('continente sobre dorsal'));
  const densityIssue=phys.issues.find(x=>x.includes('Densidades invertidas'));
  const ok=maxSpeed<=CONFIG.maxPlateSpeedCmYr+0.05 && dorsal===0 && nan===0 && !growthIssue && !dorsalIssue && !densityIssue;
  return {name,seed,ok,contPct:+contPct.toFixed(1),maxSpeed:+maxSpeed.toFixed(2),issues:phys.issues.slice(0,2)};
}

const out=[];
for(let i=0;i<12;i++) out.push(runOne('EarthLike',100+i,e=>e.generateVoronoiSeed(8,0.3),10,12,65));
for(let i=0;i<10;i++) out.push(runOne('Ocean',200+i,e=>e.generateVoronoiSeed(12,0.05),10,0,25));
for(let i=0;i<10;i++) out.push(runOne('Pangea',300+i,e=>e.generatePangea(),15,20,85));
for(let i=0;i<12;i++) out.push(runOne('EarthToday',400+i,e=>e.generateEarthTodayApprox(),8,20,75));
const failed=out.filter(x=>!x.ok);
console.log(JSON.stringify({total:out.length,pass:out.length-failed.length,fail:failed.length,failed:failed.slice(0,12)},null,2));
if(failed.length) process.exit(1);
