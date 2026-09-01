// 弹飞机制精查:逐帧记录 + 天花坡占用标记 + 每tick位移符号
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP='/Users/vinlic/Downloads/map-Starter_World (23).json';
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
  const F=[];
  let prevX=b.x;
  for(let t=0;t<260;t++){
    const pre={x:b.x,y:b.y};
    b.vx=-1; b.vy=Math.min(8,b.vy+0.35);
    // 天花坡(slope3/4)与身体盒相交?
    let ceilSl=false,floorSl=false,lift3=true;
    for(let ty=Math.floor(b.y/16)-1;ty<=Math.floor((b.y+b.h)/16)+1&&ty<st.h;ty++)
      for(let tx=Math.floor(b.x/16)-1;tx<=Math.floor((b.x+b.w)/16)+1&&tx<st.w;tx++){
        if(!st.inBounds(tx,ty))continue;
        const s=st.slope[st.idx(tx,ty)];
        if(s===3||s===4)ceilSl=true;
        if(s===1||s===2)floorSl=true;
      }
    TC.moveAndCollide(b,g.world,b.vx,b.vy);
    const ddx=b.x-pre.x;
    F.push({t,x:+b.x.toFixed(1),dd:+ddx.toFixed(2),
      og:b.onGround?1:0,hw:b.hitWall?1:0,cy:b.collideY?1:0,hh:b.hitHead?1:0,
      et:b.embedTicks||0,sb:b.slopeBlockFired?1:0,cs:ceilSl?1:0,fs:floorSl?1:0,
      hembed:lift3&&(()=>{let e=false;for(let tx=Math.floor(b.x/16);tx<=Math.floor((b.x+b.w-0.01)/16);tx++){const ti=st.idx(tx,Math.floor(b.y/16));if(st.isSolid(tx,Math.floor(b.y/16))&&st.slope[ti]===0&&!st.half[ti])e=true;}return e;})()?1:0});
    prevX=b.x;
  }
  return F;
});
const F=JSON.parse(await fs.promises.readFile('/tmp/devnull','utf8').catch(()=>'null'))||out;
fs.writeFileSync('/tmp/tent-fine.json',JSON.stringify(out));
console.log('n='+out.length);
process.exit(0);
