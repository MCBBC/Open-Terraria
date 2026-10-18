// 实机阻尼复现(三阶段):基线60smp → 按住A 240smp → 松开60smp;每样本读玩家态+物理计数
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP=needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',protocolTimeout:600000});
const page=await browser.newPage();
await page.goto('http://localhost:5201',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const g=window.__swGame;
  const p=g.player;
  p.x=9499; p.y=5296-42; p.vx=0; p.vy=0; p.onGround=false;
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true}));
  await new Promise(r=>setTimeout(r,600));
  window.__swPhysDbg={shortfall:0,unembedH:0};
  const samp=async(n)=>{
    const arr=[];
    for(let i=0;i<n;i++){
      arr.push({x:+p.x.toFixed(2),vx:+p.vx.toFixed(3),vy:+p.vy.toFixed(2),
        og:p.onGround?1:0,hw:p.hitWall?1:0,cy:p.collideY?1:0,
        et:p.embedTicks||0,sb:p.slopeBlockFired?1:0,
        db:{...(window.__swPhysDbg)}});
      await new Promise(r=>setTimeout(r,8));
    }
    return arr;
  };
  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  // 阶段0:基线无输入
  const P0=await samp(80);
  const c0={...window.__swPhysDbg};
  // 阶段1:按住A
  document.querySelector('canvas')?.focus?.();
  const kev=(t,c)=>window.dispatchEvent(new KeyboardEvent(t,{code:c,key:c,bubbles:true}));
  kev('keydown','KeyA');
  const P1=await samp(300);
  kev('keyup','KeyA');
  const c1={...window.__swPhysDbg};
  // 阶段2:松开
  const P2=await samp(80);
  return {P0,P1,P2,deltaCounters:{
    base:c0, afterHold:c1,
    dShortfall:c1.shortfall-c0.shortfall, dUnembedH:c1.unembedH-c0.unembedH}};
});
fs.writeFileSync('/tmp/damp.json',JSON.stringify(out));
console.log(JSON.stringify({dShortfall:out.deltaCounters.dShortfall,dUnembedH:out.deltaCounters.dUnembedH,endX:out.P2.at(-1).x,n:out.P1.length}));
process.exit(0);
