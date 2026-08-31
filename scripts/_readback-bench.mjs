// 回读代价基准：GPU-backed lightCtx 的 1×1 getImageData 单次耗时 + 船旗可见数
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP='/Users/vinlic/Downloads/map-FTW_V2 (10).json';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const r2=window.__swGame.renderer;
  // 预热
  for(let i=0;i<20;i++) r2.lightCtx.getImageData(1,1,1,1);
  // 基准：1000 次 1×1 回读
  const t0=performance.now();
  for(let i=0;i<1000;i++) r2.lightCtx.getImageData(1,1,1,1);
  const perCall=(performance.now()-t0)/1000;
  // 有家镇民总数 & 视口内数（玩家站出生点/房子区）
  const npcs=(window.__swGame.entities?.npcs??[]).filter(n=>n.home&&!n.dead&&!n.bound&&n.npcKey!=='old_man');
  const cam=window.__swGame.camera;
  const vw=988/cam.zoom, vh=862/cam.zoom;
  const inView=npcs.filter(n=>Math.abs(n.cx-cam.x)<vw/2+64&&Math.abs(n.cy-cam.y)<vh/2+64).length;
  return { perCallUs:+(perCall*1000).toFixed(1), housedTotal:npcs.length, inViewAtBase:inView };
});
console.log(JSON.stringify(out));
process.exit(0);
