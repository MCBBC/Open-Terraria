// 加载分段实测：fromPacket 计时 + worker 检查点日志
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP='/Users/vinlic/Downloads/map-Starter_World (16).json';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
const wkLogs=[];
page.on('console',m=>{ const t=m.text(); if(t.startsWith('[wk]')) wkLogs.push(t); });
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(()=>{window.__fpMs=0;});
await page.evaluate(async()=>{
  const W=await import('/src/world/World.ts');
  const orig=W.World.fromPacket;
  W.World.fromPacket=function(...a){const t=performance.now();const r=orig.apply(this,a);window.__fpMs=(window.__fpMs||0)+(performance.now()-t);return r;};
});
const t0=Date.now();
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const total=Date.now()-t0;
const fp=await page.evaluate(()=>window.__fpMs);
const marks=await page.evaluate(()=>performance.getEntriesByType('mark').filter(m=>m.name.startsWith('load.')).map(m=>({n:m.name,t:Math.round(m.startTime)})));
  const seq=marks.map((m,i)=>`${m.n.replace('load.','')}${i?` +${m.t-marks[i-1].t}`:''}`).join(' | ');
  console.log(JSON.stringify({totalMs:total, fromPacketMs:+(fp||0).toFixed(0), worker:wkLogs, marks:seq}));
process.exit(0);
