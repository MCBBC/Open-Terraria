// 逐字段克隆税测量：真实存档 packet 的 structuredClone 分项耗时
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP=needInput(join(DOWNLOADS, 'map-Starter_World (16).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const { packWorld }=await import('/src/workers/worldPacket.ts');
  const pkt=packWorld(window.__swGame.world).packet;
  const rows=[];
  for(const [k,v] of Object.entries(pkt)){
    if(v instanceof ArrayBuffer) continue;
    const t0=performance.now();
    try{ structuredClone(v); }catch(e){ rows.push({k,err:String(e).slice(0,40)}); continue; }
    rows.push({k,ms:+(performance.now()-t0).toFixed(1)});
  }
  rows.sort((a,b)=>(b.ms||0)-(a.ms||0));
  const JSONsz=JSON.stringify(pkt).length;
  return { rows: rows.slice(0,12), totalCloneMs:+rows.reduce((a,b)=>a+(b.ms||0),0).toFixed(1), jsonKB:+(JSONsz/1024).toFixed(0) };
});
console.log(JSON.stringify(out,null,1));
process.exit(0);
