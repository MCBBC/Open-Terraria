// 帐篷悬臂区(用户标记592,328)行走取证:玩家/NPC两模式,逐帧全字段
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP=needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto('http://localhost:5201',{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const g=window.__swGame,st=g.world.store;
  const TC=await import('/src/physics/TileCollision.ts');
  const runOne=(mode)=>{
    // 玩家盒 20x42;NPC 盒 20x42 近似
    const b={x:600*16,y:331*16-42,w:20,h:42,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,
      collideY:false,stepUp:true,stepUpHolds:false,stepUpNpc:mode==='npc',
      stepDownGate:mode==='npc'?'grounded':'gravity'};
    const W=g.world;
    const frames=[]; let prevX=b.x;
    for(let t=0;t<360;t++){
      b.vx=-1;                        // 持续向左(NPC式)
      b.vy=Math.min(8,b.vy+0.35);
      TC.moveAndCollide(b,W,b.vx,b.vy);
      const cx=Math.floor((b.x+b.w/2)/16), topRow=Math.floor(b.y/16);
      // 复算 topEmbedded 判据(unembedPass 同款)
      let topEmbed=false;
      if(!st.isSolid(cx,topRow)){
        for(let tx=Math.floor(b.x/16);tx<=Math.floor((b.x+b.w-0.01)/16);tx++){
          const ti=st.idx(tx,topRow);
          if(st.isSolid(tx,topRow)&&st.slope[ti]===0&&!st.half[ti]&&!st.isPlatform(tx,topRow)){topEmbed=true;break;}
        }
      }
      frames.push({t,x:+b.x.toFixed(1),y:+b.y.toFixed(1),vy:+b.vy.toFixed(2),
        og:b.onGround?1:0,hw:b.hitWall?1:0,cy:b.collideY?1:0,
        et:b.embedTicks||0,sb:b.slopeBlockFired?1:0,te:topEmbed?1:0,
        ddl:+(b.x-prevX).toFixed(2)});
      prevX=b.x;
      if(b.x<581*16)break;           // 已越过目标走到边界外则停
    }
    return {mode,frames};
  };
  const res=[runOne('player'),runOne('npc')];
  return res;
});
fs.writeFileSync('/tmp/tent-probe.json',JSON.stringify(out));
console.log('ok');
process.exit(0);
