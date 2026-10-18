import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false, defaultViewport: { width: 480, height: 360 } });
const page = await browser.newPage();
page.on('pageerror',(e)=>console.log('PE:',String(e.message).slice(0,160)));
await page.goto(process.env.SW_ORIGIN||'http://localhost:5201',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(t=>window.__swFlow.loadJson(t), fs.readFileSync(process.env.MAP||needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json')),'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:120000});
await new Promise(r=>setTimeout(r,500));
await page.evaluate(()=>{
  const g=window.__swGame;
  g.world.clock.timeOfDay=0.35;
  g.player.x=4131*16+8; g.player.y=(442-2)*16;   // 壁炉上方=crafting stations 区域
  g.player.vx=0;g.player.vy=0;
});
await new Promise(r=>setTimeout(r,2500));
// 找附近的锯木机/固化机等制作台格子并贴过去
const target = await page.evaluate(()=>{
  const st = window.__swGame.world.store;
  // 找所有 RATE 注册的家具在玩家周围 40 格内的实例
  const g = window.__swGame;
  const TA = g.renderer; void TA;
  const found = [];
  for (let x=4100;x<=4160;x++) for(let y=430;y<=470;y++){
    const i=st.idx(x,y); const t=st.type[i];
    if(t===0)continue;
    if([106,129,133,171,217,218,219,220,228,231,243,244,247,300,301,302,303,305,306,307,308,354,355,499,592].some(s=>s>=0)){void t}
    void t;
    // 只找特定的
    if(t>0){
      // 用 internal id 判断是否为已知动画家具族
      const known=[17,77,106,129,133,171,217,218,219,220,228,231,235,238,243,244,247,272,300,301,302,303,306,307,308,328,329,336,351,354,355,379,390,406,421,422,452,453,455,456,463,464,480,485,491,493,507,508,509,564,565,572,592,593,594,597,614,642,657,658,660,665,708,720,721,725];
      if(!known.includes(t)) continue;
      found.push({x,y,t});
    }
  }
  return found;
});
console.log('found anim furniture:',JSON.stringify(target));
if(target.length){
  // 贴到最近的动画家具旁截屏
  await page.evaluate((t)=>{
    const g=window.__swGame;
    g.player.x=t[0].x*16+8; g.player.y=(t[0].y+3)*16;
    g.player.vx=0;g.player.vy=0;
  },target[0]);
  await new Promise(r=>setTimeout(r,1500));
}
// 连拍 30 帧
for(let k=0;k<30;k++){
  const buf=await page.screenshot({type:'png'});
  fs.writeFileSync(`/tmp/chimney-frames/c${String(k).padStart(3,'0')}.png`,buf);
  await new Promise(r=>setTimeout(r,67));
}
console.log('saved 30 craft station frames');
await browser.close();
