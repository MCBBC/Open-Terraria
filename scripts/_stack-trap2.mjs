// 全量栈版:不过滤,收全部写入者的函数行+相对偏移
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP='/Users/vinlic/Downloads/map-Starter_World (23).json';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',protocolTimeout:600000});
const page=await browser.newPage();
await page.goto('http://localhost:5201',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const g=window.__swGame;
  const p=g.player;
  p.x=9499; p.y=5296-42; p.vx=0; p.vy=0;
  await new Promise(r=>setTimeout(r,600));
  const writes=[];
  let _x=p.x;
  Object.defineProperty(p,'x',{configurable:true,
    get(){return _x;},
    set(v){
      const dv=v-_x; _x=v;
      if(Math.abs(dv)<1e-6) return;
      const st=(new Error()).stack||'';
      const fs2=st.split('\n').slice(1,8).map(l=>l.trim().replace(/^at /,''));
      writes.push({dv:+dv.toFixed(3),fs:fs2});
    }});
  document.querySelector('canvas')?.focus?.();
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyA',key:'KeyA',bubbles:true}));
  await new Promise(r=>setTimeout(r,2400));
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyA',bubbles:true}));
  delete p.x; p.x=_x;
  return {writes:writes.slice(0,300)};
});
fs.writeFileSync('/tmp/trap2.json',JSON.stringify(out));
console.log('n=',out.writes.length);
process.exit(0);
