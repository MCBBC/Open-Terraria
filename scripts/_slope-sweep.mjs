// 修复后回归:案发区所有坡格×双向接近,检测新增卡点(位移<4px且前方非实心)
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
  const stuck=[];
  for(let ty=315;ty<=340;ty++)for(let tx=580;tx<=615;tx++){
    if(!st.inBounds(tx,ty))continue;
    if(st.slope[st.idx(tx,ty)]===0)continue;
    for(const dir of [-1,1]){
      const w=20,h=42;
      const b={x:tx*16+8+(dir===1?-(w/2)-24:(w/2)+24)-w/2,y:ty*16-h,w,h,vx:0,vy:0,
        onGround:false,hitWall:false,hitHead:false,collideY:false,stepUp:true,stepUpHolds:true};
      const x0=b.x; let sawWall=false;
      for(let t=0;t<150;t++){
        b.vx=1.0*dir; b.vy=Math.min(8,b.vy+0.35);
        TC.moveAndCollide(b,g.world,b.vx,b.vy);
        if(b.hitWall)sawWall=true;
      }
      const moved=Math.abs(b.x-x0);
      const aheadX=Math.floor((dir>0?b.x+b.w+2:b.x-2)/16);
      const aheadRow=Math.floor((b.y+b.h-1)/16);
      const aheadSolid=st.isSolid(aheadX,aheadRow)||st.slope[st.idx(aheadX,aheadRow)]>0;
      if(moved<4&&!aheadSolid&&!sawWall){
        stuck.push({slopeAt:[tx,ty],dir,moved:+moved.toFixed(1),end:[+b.x.toFixed(0),+b.y.toFixed(0)]});
      }
    }
  }
  let sN=0;for(let y=315;y<=340;y++)for(let x=580;x<=615;x++)if(st.slope[st.idx(x,y)]>0)sN++;
  return {slopes:sN,stuck};
});
console.log(JSON.stringify(out));
process.exit(0);
