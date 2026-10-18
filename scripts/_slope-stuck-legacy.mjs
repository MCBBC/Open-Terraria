// 船区外标记点斜坡卡死复现：读真实几何 + 僵尸体驱动
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
  const LEGACY=true;

  const g=window.__swGame,st=g.world.store;
  const TC=await import('/src/physics/TileCollision.ts');
  const TDS=await import('/src/data/tiles.ts');
  if(LEGACY){ const { setSlopeG2 }=await import('/src/physics/TileCollision.ts'); setSlopeG2(false); }
  const stuck=[];
  // 枚举区域内所有坡格 + 四方向接近
  for(let ty=315;ty<=335;ty++)for(let tx=594;tx<=612;tx++){
    if(!st.inBounds(tx,ty))continue;
    const i=st.idx(tx,ty);
    const sl=st.slope[i];
    if(!sl)continue;
    for(const dir of [-1,1]){
      // 起始位：沿 dir 反方向退 24px，脚贴该格顶
      const w=20,h=42;
      const sx=tx*16+8+(dir===1?-(w/2)-24:(w/2)+24)-w/2;
      const sy=ty*16-h;
      const b={x:sx,y:sy,w,h,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,collideY:false,stepUp:true,stepUpNpc:true};
      const x0=b.x;
      let sawWall=false;
      for(let t=0;t<150;t++){
        b.vx=1.0*dir; b.vy=Math.min(8,b.vy+0.35);
        TC.moveAndCollide(b,g.world,b.vx,b.vy);
        if(b.hitWall)sawWall=true;
      }
      const moved=Math.abs(b.x-x0);
      // 卡死判定：位移<4 且 前方紧邻非实心（即不是被真墙挡）
      const aheadX=Math.floor((dir>0?b.x+b.w+2:b.x-2)/16);
      const aheadSolid=st.isSolid(aheadX,Math.floor((b.y+b.h-1)/16))||st.slope[st.idx(aheadX,Math.floor((b.y+b.h-1)/16))]>0;
      if(moved<4&&!aheadSolid){
        // 记录卡点几何
        const cx=Math.floor((b.x+(dir>0?b.w+2:-2))/16), cy=Math.floor((b.y+b.h-1)/16);
        stuck.push({slopeAt:[tx,ty],sl,dir,moved:+moved.toFixed(1),
          end:[+b.x.toFixed(1),+b.y.toFixed(1)],ahead:[cx,cy],
          aheadTile:TDS.TILE_DEFS[st.type[st.idx(cx,cy)]]?.vanilla?.sheet??-1,
          aheadSlope:st.slope[st.idx(cx,cy)],og:b.onGround});
      }
    }
  }
  if(LEGACY){ const { setSlopeG2 }=await import('/src/physics/TileCollision.ts'); setSlopeG2(true); }
  return {legacy:LEGACY,n:stuck.length,stuck:stuck.slice(0,14)};
});

console.log(JSON.stringify(out,null,1));
process.exit(0);
