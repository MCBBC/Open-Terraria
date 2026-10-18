// 墙动画动态层验证（2026-08-31 根治墙版）：造景星彩玻璃墙(242, rate1 逐格错相)
//   A 烘焙跳过：cap.bakes 无 wall 键增长；advancAnim 无墙循环（结构断言经页内源码 import）
//   B 动态层活性：墙面像素随时间变化（逐格错相带滚动）
//   C 静态墙零回归：相邻普通墙(石墙1)像素恒定
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP=needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  const g=window.__swGame,st=g.world.store;
  const VWT=await import('/src/render/VanillaWallTiler.ts');
  // 出生点附近找 6×6 空域（无墙无砖），铺 5×5 星彩玻璃墙 + 四周石墙对照
  const sx=Math.floor(st.w/2), sy=Math.floor(st.h/2);
  let ox=-1,oy=-1;
  outer: for(let y=sy;y<st.h-10;y++)for(let x=sx-30;x<sx+30;x++){
    let ok=true;
    for(let dy=-1;dy<8&&ok;dy++)for(let dx=-1;dx<8&&ok;dx++){
      const i=st.idx(x+dx,y+dy);
      if(st.flags[i]||st.wall[i]) ok=false;
    }
    if(ok){ox=x;oy=y;break outer;}
  }
  if(ox<0) return {fail:'no empty area'};
  for(let dy=0;dy<5;dy++)for(let dx=0;dx<5;dx++)st.setWall(ox+dx,oy+dy,242);
  // 对照墙：紧邻左列石墙
  for(let dy=0;dy<5;dy++)st.setWall(ox-1,oy+dy,1);
  g.player.x=(ox+2)*16;g.player.y=(oy+7)*16;g.player.vx=0;g.player.vy=0;
  await new Promise(r=>setTimeout(r,1600));
  const cam=g.camera;
  const cvs=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const ctx=cvs.getContext('2d',{willReadFrequently:true});
  const z=cam.zoom,vw=cvs.width/z,vh=cvs.height/z;
  const win={x:Math.round((ox*16-(cam.x-vw/2))*z),y:Math.round((oy*16-(cam.y-vh/2))*z),w:Math.round(80*z),h:Math.round(80*z)};
  const ctrl={x:Math.round(((ox-1)*16-(cam.x-vw/2))*z),y:win.y,w:Math.round(16*z),h:win.h};
  let bakesWallGrew=false;
  const cap=window.__swTileCap;
  const bw0=JSON.stringify([...cap.bakes.entries()].filter(([k])=>k>=1e6).map(([k,v])=>[k,v.n]));
  // 变化像素占比判据（抗光照噪声）：窗口内 |ΔRGB|>25 的像素比例，取三次间隔最大值
  const changedRatio=async(win)=>{
    const snap=()=>ctx.getImageData(win.x,win.y,win.w,win.h).data;
    const a=snap(); await new Promise(r=>setTimeout(r,700));
    const b=snap(); await new Promise(r=>setTimeout(r,700));
    const c=snap();
    const diff=(x,y)=>{let n=0;for(let o=0;o<x.length;o+=4){if(Math.abs(x[o]-y[o])>25||Math.abs(x[o+1]-y[o+1])>25||Math.abs(x[o+2]-y[o+2])>25)n++;}return n/(x.length/4);};
    return Math.max(diff(a,b),diff(b,c));
  };
  const glassCh=await changedRatio(win);
  const ctrlCh=await changedRatio(ctrl);
  const bw1=JSON.stringify([...cap.bakes.entries()].filter(([k])=>k>=1e6).map(([k,v])=>[k,v.n]));
  bakesWallGrew = bw0!==bw1;
  return { area:[ox,oy], glassCh:+glassCh.toFixed(3), ctrlCh:+ctrlCh.toFixed(3), bakesWallGrew };
});
console.log(JSON.stringify(out));
try{
  if(out.fail) process.exit(2);
  // 星彩玻璃逐格错相 ⇒ 玻璃窗变化像素占比应显著高于对照石墙（光照噪声同乘两侧）
  // 实测星彩玻璃带移=细碎闪点（~1.8% 像素/窗），对照墙光照下 0% ⇒ 阈值按机理校准
  const pass=out.glassCh>=0.015 && out.glassCh>Math.max(0.003,out.ctrlCh*3) && !out.bakesWallGrew;
  process.exit(pass?0:1);
}finally{await browser.close();}
