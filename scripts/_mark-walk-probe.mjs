// 用户标记点精确几何行走模拟（地图21真实地形）
// 玩家 20×42 从锥体西侧走近→穿入→穿出，逐 tick 记录嵌入深度
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
  // 玩家从锥体西侧走近（x=9480 → 向右）
  const p={x:9480,y:5158,w:20,h:42,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,
    collideY:false,stepUp:true,stepUpHolds:true,stepDownGate:'gravity'};
  const frames=[];
  for(let t=0;t<360;t++){
    p.vx=3;                                      // 持续按右
    p.vy=Math.min(10,p.vy+0.4);
    TC.moveAndCollide(p,g.world,p.vx,p.vy);
    const feet=p.y+p.h;
    const col=Math.floor((p.x+p.w/2)/16);
    // 嵌入深度：脚所在列的坡面 surface
    let embed=0,surfInfo='';
    for(let dy=-1;dy<=1;dy++){
      const ty=Math.floor(feet/16)+dy;
      if(!st.inBounds(col,ty))continue;
      const i=st.idx(col,ty);
      if(!st.flags[i])continue;
      const sl=st.slope[i];
      const top=ty*16,lx=(p.x+p.w/2)-col*16;
      if(sl===1){const s=top+lx;embed=Math.max(embed,feet-s);surfInfo=`s1 surf=${s}`;break;}
      if(sl===2){const s=top+(16-lx);embed=Math.max(embed,feet-s);surfInfo=`s2 surf=${s}`;break;}
      if(sl===0&&st.isSolid(col,ty)&&!st.half[i]){embed=Math.max(embed,feet-top);surfInfo=`flat top=${top}`;break;}
    }
    frames.push({t,fx:+(p.x/16).toFixed(2),feet:+feet.toFixed(1),embed:+embed.toFixed(1),og:p.onGround?1:0,hw:p.hitWall?1:0,info:surfInfo});
  }
  // 找阻尼段（连续 |embed|>4 且 >10 tick）
  const damps=[];
  let run=0,runStart=null;
  for(const f of frames){
    if(f.embed>4){ if(run===0)runStart=f.t; run++; }
    else { if(run>10)damps.push({start:runStart,len:run}); run=0; }
  }
  if(run>10)damps.push({start:runStart,len:run});
  return { damps, frames:frames.filter((f,i)=>i%10===0||f.embed>4).slice(0,40) };
});
console.log(JSON.stringify(out,null,1));
process.exit(0);
