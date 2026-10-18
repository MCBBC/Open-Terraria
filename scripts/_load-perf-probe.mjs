// 加载全程 cpu_profiler 采样（定罪 895ms 微任务块的真身）
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP=needInput(join(DOWNLOADS, 'map-Starter_World (16).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
page.on('pageerror',e=>console.log('PAGEERR',String(e).slice(0,80)));
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.tracing.start({categories:['devtools.timeline','v8.execute','disabled-by-default-v8.cpu_profiler']});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
await new Promise(r=>setTimeout(r,2500));
const buf=await page.tracing.stop();
fs.writeFileSync('/tmp/load-trace.json',buf);
console.log('saved',buf.length);
await browser.close();
