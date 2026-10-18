// 房旗回读修复验证：包桩 lightCtx.getImageData 计数 + 旗布染色仍生效
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP=needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
page.on('console',m=>{ if(m.text().includes('willReadFrequently')) console.log('WARN_STILL:',m.text().slice(0,80)); });
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const g=window.__swGame;
  // 找有 home 的镇民 → 传送到其房附近
  const all=g.entities?.npcs ?? [];
  let target=null;
  const scan=(arr)=>{for(const e of arr){if(e&&e.home&&!e.dead&&!e.bound&&e.npcKey!=='old_man'){target=e;break;}}};
  scan(all);
  if(!target) return {fail:'no housed townNPC found'};
  g.player.x=target.home.x*16; g.player.y=(target.home.y-3)*16; g.player.vx=0;g.player.vy=0;g.player.fallStartY=null;
  await new Promise(r=>setTimeout(r,1500));
  // 包桩
  const r2=g.renderer;
  let count=0;
  const orig=r2.lightCtx.getImageData.bind(r2.lightCtx);
  r2.lightCtx.getImageData=(...a)=>{count++;return orig(...a);};
  // 主画布也包（对照：警告若来自别处）
  const bigCvs=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  let mainCount=0;
  const octx=bigCvs.getContext('2d');
  const origM=octx.getImageData.bind(octx);
  octx.getImageData=(...a)=>{mainCount++;return origM(...a);};
  await new Promise(r2b=>setTimeout(r2b,2000));
  // 染色数据源活性：旗所在格 lightAt 应非全零（有光照），且 renderer.lighting 已挂
  const lt = r2.lighting?.lightAt(target.home.x, target.home.y - 1) ?? null;
  // 旗布染色抽查：找到旗实体屏区，看 multiply 后像素是否受光照（非纯贴图原色）
  return { housedNpc:(target.npcKey??'?'), lightReadback2s:count, mainReadback2s:mainCount,
    lightingMounted: !!r2.lighting, lightAtBanner: lt };
});
console.log(JSON.stringify(out));
process.exit(0);
