// 船区扭曲归因仪（2026-08-31）：理论A=atlas槽位churn渗色 / 理论B=水波warp越界
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP=needInput(join(DOWNLOADS, 'map-Starter_World (16).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
await new Promise(r=>setTimeout(r,1200));
const out=await page.evaluate(async()=>{
  const g=window.__swGame,st=g.world.store;
  const WW=await import('/src/render/WaterWaves.ts');
  const waves=(await import('/src/render/WaterWaves.ts')).waterWaves;  // 模块级单例
  // 玩家放船区
  g.player.x=6193*16;g.player.y=(304+4)*16;g.player.vx=0;g.player.vy=0;g.player.fallStartY=null;
  await new Promise(r=>setTimeout(r,1800));
  const cam=g.camera;
  const cvs=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const ctx=cvs.getContext('2d',{willReadFrequently:true});
  const z=cam.zoom,vw=cvs.width/z,vh=cvs.height/z;
  const toScr=(wx,wy)=>[Math.round((wx-(cam.x-vw/2))*z),Math.round((wy-(cam.y-vh/2))*z)];
  // 找水线：从船区某列向下扫第一个 liquid>0 的格
  const findWaterline=(tx)=>{
    for(let ty=280;ty<360;ty++){const i=st.idx(tx,ty);if(st.liquid[i]>0)return ty;}
    return -1;
  };
  const wl=findWaterline(6200);
  // A 位移场：水心/水线/岸内1格/岸内4格
  const disp=(wx,wy)=>{const d=[0,0];waves.sampleDisplace(wx,wy,d);return +Math.hypot(d[0],d[1]).toFixed(2);};
  const dWater=disp(6200*16,(wl+2)*16);
  const dLine=disp(6200*16,(wl)*16);
  const dLand1=disp(6200*16,(wl-1)*16-8);
  const dLand4=disp(6200*16,(wl-4)*16-8);
  // B 静立烘焙活动
  const cap=window.__swTileCap;
  const b0=JSON.stringify([...cap.bakes.entries()]);
  // C 干地稳定差分：取水线上方 ≥3 格的 32×32 窗，两次抓拍差分
  const [sx0,sy0]=toScr(6192*16,(wl-6)*16);
  const snap=()=>ctx.getImageData(sx0,sy0,48,48).data;
  const a=snap();await new Promise(r=>setTimeout(r,700));const b=snap();await new Promise(r=>setTimeout(r,700));const c=snap();
  const diff=(x,y)=>{let n=0;for(let o=0;o<x.length;o+=4){if(Math.abs(x[o]-y[o])>25||Math.abs(x[o+1]-y[o+1])>25||Math.abs(x[o+2]-y[o+2])>25)n++;}return n/(x.length/4);};
  const dryCh=Math.max(diff(a,b),diff(b,c));
  // D 水线带差分（预期有动画=果冻）
  const [wx0,wy0]=toScr(6200*16-24,(wl-1)*16);
  const wa=ctx.getImageData(wx0,wy0,48,48).data;await new Promise(r=>setTimeout(r,700));
  const wb=ctx.getImageData(wx0,wy0,48,48).data;await new Promise(r=>setTimeout(r,700));
  const wc=ctx.getImageData(wx0,wy0,48,48).data;
  const lineCh=Math.max(diff(wa,wb),diff(wb,wc));
  await new Promise(r=>setTimeout(r,2500));
  const b1=JSON.stringify([...cap.bakes.entries()]);
  // A/B：关水波（disable ⇒ warp+glint+波场全停），同窗重测
  waves.disable();
  await new Promise(r=>setTimeout(r,500));
  const a2=snap();await new Promise(r=>setTimeout(r,700));const b2=snap();await new Promise(r=>setTimeout(r,700));const c2=snap();
  const dryChOff=Math.max(diff(a2,b2),diff(b2,c2));
  const wa2=ctx.getImageData(wx0,wy0,48,48).data;await new Promise(r=>setTimeout(r,700));
  const wb2=ctx.getImageData(wx0,wy0,48,48).data;await new Promise(r=>setTimeout(r,700));
  const wc2=ctx.getImageData(wx0,wy0,48,48).data;
  const lineChOff=Math.max(diff(wa2,wb2),diff(wb2,wc2));
  // 岸内 1 格带（船底板）：warp 嫌疑窗
  const [lx0,ly0]=toScr(6192*16,(wl-1)*16-8);
  const la=ctx.getImageData(lx0,ly0,48,24).data;await new Promise(r=>setTimeout(r,700));
  const lb=ctx.getImageData(lx0,ly0,48,24).data;await new Promise(r=>setTimeout(r,700));
  const lc=ctx.getImageData(lx0,ly0,48,24).data;
  const land1ChOn=Math.max(diff(la,lb),diff(lb,lc));
  waves.setQuality(3);   // 还原
  await new Promise(r=>setTimeout(r,600));
  const la2=ctx.getImageData(lx0,ly0,48,24).data;await new Promise(r=>setTimeout(r,700));
  const lb2=ctx.getImageData(lx0,ly0,48,24).data;await new Promise(r=>setTimeout(r,700));
  const lc2=ctx.getImageData(lx0,ly0,48,24).data;
  const land1ChOff=Math.max(diff(la2,lb2),diff(lb2,lc2));
  return { waterlineTy:wl,
    disp:{water:dWater,line:dLine,land1:dLand1,land4:dLand4},
    dryChange:+dryCh.toFixed(3), waterlineChange:+lineCh.toFixed(3),
    land1ChangeOn:+land1ChOn.toFixed(3), land1ChangeOff:+land1ChOff.toFixed(3),
    dryChangeOff:+dryChOff.toFixed(3), waterlineChangeOff:+lineChOff.toFixed(3),
    bakesGrewWhileStill: b0!==b1 };
});
console.log(JSON.stringify(out));
process.exit(0);
