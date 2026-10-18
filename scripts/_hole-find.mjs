// 定位穿地路径:每10帧记录身体占格(tile类型+slope),找进入点
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
  const g=window.__swGame,st=g.world.store;
  const TC=await import('/src/physics/TileCollision.ts');
  const b={x:600*16,y:331*16-42,w:20,h:42,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,
    collideY:false,stepUp:true,stepUpHolds:true,stepUpNpc:false};
  const snap=[]; let belowFloorTick=-1;
  for(let t=0;t<360;t++){
    b.vx=-1; b.vy=Math.min(8,b.vy+0.35);
    TC.moveAndCollide(b,g.world,b.vx,b.vy);
    if(belowFloorTick<0&&b.y+b.h>331*16+2)belowFloorTick=t;
    if(belowFloorTick>=0&&(t-belowFloorTick)%12===0||t%24===0){
      // 身体占格速览:头行~脚行的各列字符
      let cells='';
      for(let ty=Math.floor(b.y/16);ty<=Math.floor((b.y+b.h-1)/16);ty++)
        for(let tx=Math.floor(b.x/16);tx<=Math.floor((b.x+b.w-1)/16);tx++){
          const i=st.idx(tx,ty);
          cells+= st.slope[i]>0?String(st.slope[i]):st.half[i]?'H':st.isSolid(tx,ty)?'#':st.isPlatform(tx,ty)?'P':' ';
        }
      snap.push({t,x:+b.x.toFixed(0),y:+b.y.toFixed(1),cells});
    }
  }
  return {belowFloorTick,snap};
});
fs.writeFileSync('/tmp/hole.json',JSON.stringify(out));
console.log(JSON.stringify({belowFloorTick:out.belowFloorTick,n:out.snap.length}));
process.exit(0);
