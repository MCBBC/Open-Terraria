// 对角线跟随质量:合成纯坡链 A/B。构造:slope2 链 14 格下行向左(-16px/格),
// 高台右端平地;玩家型盒走 左行下行 / 右行上行 各一遍。
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',protocolTimeout:600000});
const page=await browser.newPage();
await page.goto('http://localhost:5201',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
const out=await page.evaluate(async()=>{
  const { World }=await import('/src/world/World.ts');
  const { TileStore }=await import('/src/world/TileStore.ts');
  const { TILE_BY_KEY }=await import('/src/data/tiles.ts');
  const TC=await import('/src/physics/TileCollision.ts');
  const st=new TileStore(80,60);
  const DIRT=TILE_BY_KEY['dirt'];
  const TOPROW=30;
  // 支撑柱(链下方)+ 高台
  for(let x=0;x<80;x++){ st.setTile(x,TOPROW+1,DIRT); }
  // slope2 链:x=40..53 从低(左,x40 行顶=TOPROW*16+? )到高(右 x53 与高台同高)
  // 链几何:slope2@x 的表面线= 该行顶..底 45°,行=TOPROW+(53-x):高侧右
  for(let k=0;k<=13;k++){
    const x=53-k, y=TOPROW+k;
    st.setTile(x,y,DIRT);
    if(k>0)for(let yy=y+1;yy<=TOPROW+1;yy++)st.setTile(x,yy,DIRT);   // 填实心支撑
    st.setSlope(x,y,k===0?0:2);
  }
  for(let x=54;x<66;x++){ st.setTile(x,TOPROW,DIRT); for(let y=TOPROW+1;y<=TOPROW+1;y++)st.setTile(x,y,DIRT);} // 高台面与 x53 同层
  const world={store:st,w:80,h:60};
  const mk=()=>({x:58*16,y:TOPROW*16-42,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,collideY:false,stepUp:true,stepUpHolds:true,stepUpNpc:true});
  const run=(wdOn,vx,ticks)=>{
    TC.setWalkDownPre(wdOn);
    const b=mk();
    let prevY=b.y+b.h,prevX=b.x,dev=0,air=0,nMove=0,maxDip=0,minTop=Math.min();
    for(let t=0;t<ticks;t++){
      b.vx=vx;b.vy=Math.min(8,b.vy+0.35);
      TC.moveAndCollide(b,world,b.vx,b.vy);
      const dx=b.x-prevX,dyF=b.y+b.h-prevY;
      if(Math.abs(dx)>0.4){nMove++;if(!b.onGround&&!TC._isInsideSolidish(b,st))air++;}
      prevY=b.y+b.h;prevX=b.x;
    }
    return {endX:+b.x.toFixed(1),feet:+(b.y+b.h).toFixed(1)};
  };
  return {};
})
console.log('draft')
