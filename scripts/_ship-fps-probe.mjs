// 船区帧率实测：rAF 节拍 3s 统计（修复后基线留档）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP='/Users/vinlic/Downloads/map-Starter_World (16).json';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
await new Promise(r=>setTimeout(r,1200));
await page.evaluate(()=>{const g=window.__swGame;g.player.x=6193*16;g.player.y=(305+4)*16;g.player.vx=0;g.player.vy=0;});
await new Promise(r=>setTimeout(r,1500));
const fps=await page.evaluate(()=>new Promise((res)=>{
  let n=0; const t0=performance.now();
  const loop=()=>{ n++; if(performance.now()-t0<3000) requestAnimationFrame(loop); else res(+(n/3).toFixed(1)); };
  requestAnimationFrame(loop);
}));
const dt=await page.evaluate(()=>window.__swGame.debugSnapshot?.frameDtMs?.slice(-40)??[]);
console.log(JSON.stringify({fps, dtHead:dt.slice(0,12), dtMax:Math.max(...dt,0)}));
process.exit(0);
