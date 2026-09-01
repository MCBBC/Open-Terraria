// NPC 模式复验:强制向左走(vx=-1 无视 hitWall 模拟 AI 重试)+hitWall 可见性断言
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
  const g=window.__swGame;
  const TC=await import('/src/physics/TileCollision.ts');
  const b={x:600*16,y:331*16-42,w:20,h:42,vx:0,vy:0,onGround:false,hitWall:false,hitHead:false,
    collideY:false,stepUp:true,stepUpHolds:true,stepUpNpc:true};
  let hwSeen=false,minX=1e9,maxJump=0,prevX=b.x,etMax=0;
  for(let t=0;t<400;t++){
    b.vx=-1; b.vy=Math.min(8,b.vy+0.35);
    TC.moveAndCollide(b,g.world,b.vx,b.vy);
    if(b.hitWall)hwSeen=true;
    minX=Math.min(minX,b.x); maxJump=Math.max(maxJump,Math.abs(b.x-prevX)); prevX=b.x;
    etMax=Math.max(etMax,b.embedTicks||0);
  }
  return {hwSeen,minX,maxJump:+maxJump.toFixed(1),endX:+b.x.toFixed(1),etMax};
});
console.log(JSON.stringify(out));
process.exit(0);
