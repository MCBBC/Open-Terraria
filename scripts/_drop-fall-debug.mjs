// 掉落物穿透调试：12×12 drop 从 (597*16+2, 5104) 下落穿过 solid 砂岩石板
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP=needInput(join(DOWNLOADS, 'map-Starter_World (21).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const g=window.__swGame,st=g.world.store;
  const TC=await import('/src/physics/TileCollision.ts');
  const TDS=await import('/src/data/tiles.ts');
  const i=st.idx(597,324);
  const def=TDS.TILE_DEFS[st.type[i]];
  const b={x:9554,y:5104,w:12,h:12,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,collideY:false};
  const frames=[];
  for(let t=0;t<60;t++){
    b.vy=Math.min(8,b.vy+0.35);
    const py=b.y+b.h;
    TC.moveAndCollide(b,g.world,b.vx,b.vy);
    frames.push({t,vy:+b.vy.toFixed(2),y:+b.y.toFixed(1),feet:+(b.y+b.h).toFixed(1),
      og:b.onGround,tileBelow:st.type[st.idx(597,Math.floor((b.y+b.h)/16))],
      solidBelow:st.isSolid(597,Math.floor((b.y+b.h)/16))});
    if(b.onGround)break;
  }
  return { floorDef:{key:def?.key,solid:def?.solid,type:st.type[i]},
    frames:frames.slice(0,25), landed:b.onGround, finalY:b.y };
});
console.log(JSON.stringify(out,null,1));
process.exit(0);
