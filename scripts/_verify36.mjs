import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE=readFileSync(needInput(join(DOWNLOADS, 'map-Starter_World (25).json')),'utf8');
const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',
  defaultViewport:{width:1280,height:800},protocolTimeout:180000});
const page=await browser.newPage();
page.on('pageerror',e=>console.log('[pgerr]',e.message.slice(0,120)));
await page.goto(process.env.SW_ORIGIN??'http://localhost:5199',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,3000));
// 直接调 __swLoadJson 载入用户存档(不走新建世界流程)
const ready=await page.evaluate(()=>{return typeof window.__swLoadJson==='function';});
console.log('[loadFromJson available]',ready);
if(!ready){console.log('FAIL: load bridge not ready');process.exit(1);}
await page.evaluate(async txt=>{await window.__swLoadJson(txt);},SAVE);
// 等世界就绪(loadFromJson 内部会走完整 enter 流程并设 __swGame)
try{
  await page.waitForFunction(()=>window.__swGame?.world?.store,{polling:500,timeout:120000});
  console.log('[ok] world loaded');
}catch(e){console.log('[FAIL] world load:',e.message.slice(0,100));process.exit(1);}
await new Promise(r=>setTimeout(r,1500));
// 精确站位 + 投掷诊断
const out=await page.evaluate(()=>{
  const g=window.__swGame;
  // EXACT 站位(px)
  g.player.x=53562;g.player.y=5675;
  if('vx'in g.player)g.player.vx=0;if('vy'in g.player)g.player.vy=0;
  g.camera.x=g.player.cx;g.camera.y=g.player.cy;
  // 装备荆棘旋刃
  const id=window.__swItems['vi_191_ThornChakram'];
  for(let i=0;i<60;i++)g.player.inv.slots[i]=null;
  g.player.inv.add(id,99);
  const bi=g.player.inv.slots.findIndex(it=>it&&it.id===id);
  if(bi>0){const t=g.player.inv.slots[0];g.player.inv.slots[0]=g.player.inv.slots[bi];g.player.inv.slots[bi]=t;}
  g.player.inv.selected=0;g.player.useTime=0;
  for(let i=0;i<60;i++)g.fixedUpdate(1/60);
  // 打印站位几何
  const st=g.world.store;
  const pl=g.player;
  const diag={playerPos:[pl.x,pl.y],cx:pl.cx,cy:pl.cy,
    footRow:Math.floor((pl.y+pl.h)/16),terrain:{}};
  // 地形矩阵 ±4×±5 around player
  for(let ty=Math.floor(pl.cy/16)-4;ty<=Math.floor(pl.cy/16)+5;ty++){
    const row=[];
    for(let tx=Math.floor(pl.cx/16)-3;tx<=Math.floor(pl.cx/16)+4;tx++){
      row.push(st.isSolid(tx,ty)?
        (st.slope[st.idx(tx,ty)]?('S'+st.slope[st.idx(tx,ty)]):'#'):
        '.');
    }
    diag.terrain['r'+ty]=row.join('');
  }
  // 投掷(右下)
  g.input.mouseX=640+200;g.input.mouseY=400+140;
  g.input.mouseDown=true;g.input.mouseHeld=true;
  g.fixedUpdate(1/60);
  g.input.mouseDown=false;g.input.mouseHeld=false;
  const bom=g.entities.projectiles.find(p=>p.projId===33&&!p.dead);
  if(!bom)return{...diag,err:'no-spawn'};
  diag.spawnGrace=bom.embedGrace;
  diag.spawnPos=[Math.round(bom.x*10)/10,Math.round(bom.y*10)/10];
  diag.spawnVel=[+bom.vx.toFixed(2),+bom.vy.toFixed(2)];
  // 追踪
  const trace=[];
  for(let t=0;t<50&&!bom.dead;t++){
    if(t%5===0||t<4)trace.push({t,x:+bom.cx.toFixed(0),y:+bom.cy.toFixed(0),
      vx:+bom.vx.toFixed(1),vy:+bom.vy.toFixed(1),ai0:bom.ai0,g:bom.embedGrace});
    g.fixedUpdate(1/60);
    if(bom.dead||!g.entities.projectiles.includes(bom)){trace.push({DEAD:t});break;}
  }
  return {...diag,trace};
});
console.log(JSON.stringify(out,null,1));
await browser.close();
