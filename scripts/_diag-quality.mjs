// 对角线跟随质量量化:A/B = setWalkDownPre(true/false)
// 跑道=真实存档 x586-596 纯 s2 上行链(rows 324-329);指标:
//  - downJitterMax:下行中单帧 |dy| 与理想(|vx|)的最大偏差
//  - airFrames:行走中的悬空帧数(og=0)
//  - upAirFrames:上行悬空帧数
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
  const mk=(x,y)=>({x,y,w:20,h:42,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,
    collideY:false,stepUp:true,stepUpHolds:true,stepUpNpc:true});
  // 跑道起点:链高端右侧平台? 反向:从低处左端起。低处端=x586,row329(其顶 5264)。
  // 下行:站在顶 x=597*(s2@596 row324 高侧)=596*16+14 处起步向左走。
  const run=(wdOn,vx,startX,startY,ticks)=>{
    TC.setWalkDownPre(wdOn);
    const b=mk(startX,startY);
    let prevY=b.y+b.h,prevX=b.x;
    let downDev=0,air=0,cyT=0,nMove=0;
    for(let t=0;t<ticks;t++){
      b.vx=vx; b.vy=Math.min(8,b.vy+0.35);
      TC.moveAndCollide(b,g.world,b.vx,b.vy);
      const dx=b.x-prevX,dy=b.y+b.h-prevY;
      if(Math.abs(dx)>0.4){           // 只统计实际移动帧
        nMove++;
        if(dy<0)air++;
        if(vx<0&&dy>Math.abs(dx)+1.21)downDev=Math.max(downDev,dy-Math.abs(dx));
        if(b.collideY!==false&&b.collideY)cyT++;
      }
      prevY=b.y+b.h;prevX=b.x;
    }
    return {downDev:+downDev.toFixed(2),air,cyT,endY:+(b.y+b.h).toFixed(1),endX:+b.x.toFixed(1)};
  };
  // 下行:起点在链条顶右缘(x597 s2@596),脚贴行顶。起步 y=324*16-42+对角线深?
  // 直接放在高端台面 597*16 空地步降…先落稳 20 帧再计时
  const startRun=(vx)=>{
    TC.setWalkDownPre(true);
    const b=mk(599*16,324*16-42);
    for(let t=0;t<40;t++){b.vx=0;b.vy=Math.min(8,b.vy+0.35);TC.moveAndCollide(b,g.world,b.vx,b.vy);}
    return b.y+b.h;
  };
  const surf=startRun(-1);   // 得到自然落脚点
  const D_ON=run(true,-1,surf>=0?598*16:598*16,324*16-42+ (surf-324*16)||0,300);
  // 统一构造:startY 使脚贴链顶入口;两组同参对照
  const baseY=324*16-42-4;
  const d1=run(true,-1,598.5*16,baseY,320);
  const d0=run(false,-1,598.5*16,baseY,320);
  const u1=run(true,+1,586.5*16,baseY+80,420);
  const u0=run(false,+1,586.5*16,baseY+80,420);
  return {surf,down:{on:d1,off:d0},up:{on:u1,off:u0}};
});
fs.writeFileSync('/tmp/diag.json',JSON.stringify(out,null,1));
console.log(JSON.stringify(out));
process.exit(0);
