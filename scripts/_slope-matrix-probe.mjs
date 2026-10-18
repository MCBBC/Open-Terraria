// 全物种×坡型矩阵验证（2026-08-31 根治后覆盖性背书）
// 物种形：玩家 20×42 / 僵尸 18×42 / 掉落物 12×12 / 小动物 10×10
// 场景：s1/s2 45° 坡道（上行+下行）+ s3/s4 天花板坡对
// 判定：持续嵌入（|err|>4 连续 >12 tick）= 阻尼卡进残留
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
  const SHAPES=[
    {name:'player', w:20,h:42,speed:3},
    {name:'zombie', w:18,h:42,speed:1},
    {name:'drop',   w:12,h:12,speed:0},
    {name:'critter',w:10,h:10,speed:0.7},
  ];
  const results=[];
  // 场景1：45°坡道（s2/s1 对，同 earlier pyramid）
  for(const sh of SHAPES){
    const cases=[];
    for(const dir of [-1,1]){
      const b={x:dir===1?601.5*16:603*16,y:(325)*16-sh,vx:0,vy:0,
        onGround:false,hitWall:false,hitHead:false,collideY:false,
        stepUp:true,stepUpNpc:true,stepDownGate:'grounded'};
      let maxSustain=0,sustain=0;
      const d2=dir===1?-1:1;   // 走向锥体中心
      for(let t=0;t<240;t++){
        b.vx=sh.speed*dir* (sh.speed>0?1:0) || (sh.speed===0?0:0);
        b.vx=sh.speed*d2;
        b.vy=Math.min(8,b.vy+0.4);
        TC.moveAndCollide(b,g.world,b.vx,b.vy);
        // 嵌入检测：脚下所站列的坡面 vs 实际 feet
        const fc=Math.floor((b.x+b.w/2)/16), fr=Math.floor((b.y+b.h-1)/16);
        let surf=null;
        for(let dy=-1;dy<=1;dy++){
          if(!st.inBounds(fc,fr+dy))continue;
          const i=st.idx(fc,fr+dy);
          if(!st.flags[i])continue;
          const sl=st.slope[i],top=(fr+dy)*16,lx=b.x+st.w/2-fc*16;
          if(sl===1)surf=(fr+dy)*16+lx;
          else if(sl===2)surf=(fr+dy)*16+(16-lx);
          else if(sl===0&&st.isSolid(fc,fr+dy)&&!st.half[i])surf=(fr+dy)*16;
          if(surf!==null)break;
        }
        if(surf!==null){
          const err=(b.y+b.h)-surf;
          if(Math.abs(err)>4)sustain++;else sustain=0;
          maxSustain=Math.max(maxSustain,sustain);
        } else sustain=0;
      }
      cases.push({dir:d2,maxSustain,stall:maxSustain>12});
    }
    results.push({shape:sh.name,w:sh.w,h:sh.h,cases});
  }
  // 场景2：掉落物从坡面上方 3 格落下 → 静稳
  const settle=[];
  // 用 debug 探针验证过的可靠落点 (9554,5104) → row 320 顶
  for(const sl of [1,2]){
    const b={x:9554,y:5104,w:12,h:12,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,collideY:false};
    const ys=[];
    for(let t=0;t<200;t++){ b.vy=Math.min(8,b.vy+0.35); TC.moveAndCollide(b,g.world,b.vx,b.vy); if(t>=150)ys.push(b.y); }
    const spread=+(Math.max(...ys)-Math.min(...ys)).toFixed(2);
    settle.push({slope:sl,spread,floorAt:!!st.flags[st.idx(597,320)]});
  }
  return {results,settle};
});
console.log(JSON.stringify(out,null,1));
process.exit(0);
