// 染料商坡区逐 tick 物理追踪(补 F5 录制器缺口:vy/onGround/collideY/slope 周边态)
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
  const all=[...g.entities.npcs].map(n=>({k:n.npcKey,x:+n.x.toFixed(0),y:+n.y.toFixed(0),dead:!!n.dead}));
  const dyer=g.entities.npcs.find(n=>n.npcKey==='dyer'&&!n.dead);
  if(!dyer) return {fail:'no dyer',all};
  // 传送到坡区(用户标记点附近):玩家传送出去防止干扰
  g.player.x=700*16; g.player.y=300*16; g.player.vx=0; g.player.vy=0;
  // 把染料商放在坡区入口,给走向坡的 AI
  const home={x:594,y:325};
  dyer.x=590*16; dyer.y=323*16; dyer.vx=0; dyer.vy=0;
  if(dyer.home) Object.assign(dyer.home,{tileX:home.x,tileY:home.y});
  await new Promise(r=>setTimeout(r,500));
  const frames=[];
  for(let t=0;t<480;t++){
    const col=Math.floor((dyer.x+dyer.w/2)/16);
    const feetRow=Math.floor((dyer.y+dyer.h)/16);
    const slopesNear=[];
    for(let dx=-2;dx<=2;dx++)for(let dy2=-1;dy2<=1;dy2++){
      const tx=col+dx,ty=feetRow+dy2;
      if(!st.inBounds(tx,ty))continue;
      const i=st.idx(tx,ty);
      if(st.slope[i]>0) slopesNear.push(`${tx},${ty}:s${st.slope[i]}`);
    }
    frames.push({
      t,
      x:+dyer.x.toFixed(1), y:+dyer.y.toFixed(1),
      vx:+dyer.vx.toFixed(2), vy:+dyer.vy.toFixed(2),
      og:dyer.onGround?1:0, hw:dyer.hitWall?1:0, cy:dyer.collideY?1:0,
      et:dyer.embedTicks||0,
      sl:slopesNear.join('|'),
    });
    await new Promise(r=>setTimeout(r,16));
  }
  return {ok:true,spawned:[+frames[0].x,+frames[0].y],n:frames.length,frames};
});
console.log(JSON.stringify(out));
fs.writeFileSync('/tmp/dyer-trace.json',JSON.stringify(out));
process.exit(0);
