// 玩家过锥体确定性模拟：脚位误差逐 tick 记录（阻尼=误差单调增长）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP='/Users/vinlic/Downloads/map-Starter_World (21).json';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const g=window.__swGame,st=g.world.store;
  const TC=await import('/src/physics/TileCollision.ts');
  // 锥体表面函数（坡=45°，slope1 左高右低/slope2 右高左低）：
  // 对给定 feet-x 与所在列，返回应站的表面 y（若无坡/实心顶则 null）
  const surfaceAt=(feetX,fromY)=>{
    const col=Math.floor(feetX/16);
    for(let ty=Math.floor(fromY/16)-1;ty<=Math.floor(fromY/16)+2;ty++){
      if(!st.inBounds(col,ty))continue;
      const i=st.idx(col,ty);
      if(!st.flags[i])continue;
      const sl=st.slope[i];
      const top=ty*16;
      const lx=feetX-col*16;
      if(sl===1)return top+lx;                 // 左高右低：feet=top+lx
      if(sl===2)return top+(16-lx);            // 右高左低
      if(sl===0&&st.isSolid(col,ty)&&!st.half[i])return top;
      if(sl===0&&st.half[i])return top+8;
    }
    return null;
  };
  // 玩家形 Body
  const p={x:595.75*16,y:5158,w:20,h:42,vx:0,vy:0,onGround:true,hitWall:false,hitHead:false,
    collideY:false,stepUp:true,stepUpHolds:true,stepDownGate:'gravity'};
  const errs=[];
  let dir=-1;                                  // 先向左（上坡）
  for(let t=0;t<360;t++){
    if(t===60)dir=1; if(t===150)dir=-1; if(t===300)dir=1;   // 60左(上坡)→90右(下坡)→150左→60右
    p.vx=3*dir;
    p.vy=Math.min(10,p.vy+0.4);               // 玩家重力
    TC.moveAndCollide(p,g.world,p.vx,p.vy);
    const sf=surfaceAt(p.x+p.w/2,p.y+p.h-4);
    if(sf!==null){
      const err=+((p.y+p.h)-sf).toFixed(2);
      if(Math.abs(err)>2&&t%10===0)errs.push(err);   // 采样：|误差|>2 的驻留点
    }
  }
  const last60=errs.slice(-60);
  return { maxAbsErr:+Math.max(...errs.map(Math.abs)).toFixed(1),
    meanErrLast60:+(last60.reduce((a,b)=>a+b,0)/Math.max(1,last60.length)).toFixed(2),
    maxAbsErrLast60:+Math.max(...last60.map(Math.abs)).toFixed(1),
    errTail:last60.slice(0,30),
    final:{x:+(p.x/16).toFixed(2),feet:+(p.y+p.h).toFixed(1)} };
});
console.log(JSON.stringify(out,null,1));
process.exit(0);
