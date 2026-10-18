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
  const g=window.__swGame;
  const TC=await import('/src/physics/TileCollision.ts');
  const { setSlopeG2 }=await import('/src/physics/TileCollision.ts');
  const { Enemy }=await import('/src/entities/Enemy.ts');
  const run=(label,useG2,species)=>{
    setSlopeG2(useG2);
    // 玩家放西墙侧（飞行眼朝玩家俯冲=用户现场方向）
    g.player.x=9500; g.player.y=5200;
    const z=new Enemy(species,9635,5196-30);
    if(species==='demon_eye') z.vanillaId=2;   // 真实生成器会带 vid=2（AI_002 floatEyeAI 路由）
    const routed = { key:z.key, vid:z.vanillaId };
    g.entities.add(z,'enemies');
    const traj=[];
    let posChanges=0,lastX=z.x;
    for(let t=0;t<300;t++){ z.fixedUpdate(1/60,g); if(Math.abs(z.x-lastX)>0.01){posChanges++;lastX=z.x;} if(t%30===0||t===299) traj.push({t,x:+z.x.toFixed(1),y:+z.y.toFixed(1),vx:+z.vx.toFixed(2),vy:+z.vy.toFixed(2),og:z.onGround,cx:z.collideX??null,cy:z.collideY??null}); }
    g.entities.remove?.(z) ?? (z.dead=true);
    return {label,routed,posChanges,finalX:+z.x.toFixed(1),traj};
  };
  const post=run('eye-post-G2(新)',true,'demon_eye');
  const pre=run('eye-pre-G2(旧)',false,'demon_eye');
  setSlopeG2(true);
  return {post,pre};
});


console.log(JSON.stringify(out,null,1));
process.exit(0);