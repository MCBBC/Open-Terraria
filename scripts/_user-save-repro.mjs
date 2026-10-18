// 用户存档重放探针:__swLoadJson 载入真实存档 → 站位标记点 → 右下投掷 → 逐帧记录
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE=readFileSync(process.env.SAVE??needInput(join(DOWNLOADS, 'map-Starter_World (25).json')),'utf8');
const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',defaultViewport:{width:1280,height:800}});
const page=await browser.newPage();
page.on('pageerror',e=>console.log('[pageerror]',e.message.slice(0,160)));
await page.goto(process.env.SW_ORIGIN??'http://localhost:5199',{waitUntil:'domcontentloaded',timeout:60000});
await new Promise(r=>setTimeout(r,2500));
await page.waitForSelector('select',{timeout:120000});
await page.evaluate(()=>{const s=document.querySelector('select');s.selectedIndex=0;s.parentElement.querySelector('button').click();});
await page.waitForFunction(()=>!!window.__swGame,{polling:500,timeout:240000});
await page.evaluate(async (txt)=>{ await window.__swLoadJson(txt); },SAVE);
await page.waitForFunction(()=>window.__swGame?.world?.store,{polling:500,timeout:240000});
await new Promise(r=>setTimeout(r,1500));
const out=await page.evaluate(()=>{
  const g=window.__swGame;
  const st=g.world.store;
  const TX=3353,TY=363;
  g.player.x=TX*16; g.player.y=TY*16;
  if('vx'in g.player)g.player.vx=0; if('vy'in g.player)g.player.vy=0;
  for(let i=0;i<90;i++) g.fixedUpdate(1/60);
  const px=g.player.cx, py=g.player.cy;
  const foot=Math.floor((g.player.y+g.player.h)/16);
  // 出生盒±3 实体格快照
  const cells=[];
  for(let ty=Math.floor((py-19)/16)-2;ty<=Math.floor((py+19)/16)+1;ty++)
    for(let tx=Math.floor(px/16)-3;tx<=Math.floor(px/16)+4;tx++){
      const c={tx,ty,solid:st.isSolid(tx,ty),type:st.type[st.idx(tx,ty)],slope:st.slope[st.idx(tx,ty)],half:st.half[st.idx(tx,ty)]};
      if(c.solid||c.slope||c.half) cells.push(c);
    }
  // 装备荆棘旋刃
  const key='vi_191_ThornChakram';
  const id=window.__swItems[key];
  for(let i=0;i<60;i++)g.player.inv.slots[i]=null;
  g.player.inv.add(id,5);
  const bi=g.player.inv.slots.findIndex((it)=>it&&it.id===id);
  if(bi>0){const t=g.player.inv.slots[0];g.player.inv.slots[0]=g.player.inv.slots[bi];g.player.inv.slots[bi]=t;}
  g.player.inv.selected=0;
  // 瞄准右下:鼠标 = 屏心 +(dx,dy)=(240,160)
  const wv=640;
  g.input.mouseX=wv+240; g.input.mouseY=400+160;
  g.input.mouseDown=true; g.input.mouseHeld=true;
  g.fixedUpdate(1/60);
  g.input.mouseDown=false; g.input.mouseHeld=false;
  const bom=g.entities.projectiles.find(p=>p.projId===33&&!p.dead);
  if(!bom)return{err:'no spawn',px,py,cells,foot};
  const trace=[];
  for(let t=0;t<28&&!bom.dead;t++){
    trace.push({t,x:+bom.x.toFixed(1),y:+bom.y.toFixed(1),vx:+bom.vx.toFixed(2),vy:+bom.vy.toFixed(2),ai0:bom.ai0});
    g.fixedUpdate(1/60);
    if(!g.entities.projectiles.includes(bom)||bom.dead){trace.push({dead:true});break;}
  }
  return {player:[+px.toFixed(1),+py.toFixed(1)],footRow:foot,solidCellsNearSpawn:cells,trace};
});
console.log(JSON.stringify(out));
if(typeof res!=='undefined') void res;
await browser.close();
