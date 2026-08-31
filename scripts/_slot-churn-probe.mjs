// 槽位 churn 稳定性探针：相机往返后，同一世界窗的静态内容应逐位一致
// （动态格排除：选无动画物的实心木板/齿轮以外区域）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN='http://localhost:5201';
const MAP='/Users/vinlic/Downloads/map-Starter_World (16).json';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:988,height:862},protocolTimeout:600000});
const page=await browser.newPage();
await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof window.__swFlow==='object'&&!!window.__swFlow?.loadJson,{timeout:120000});
await page.evaluate(async(t)=>{await window.__swFlow.loadJson(t);},fs.readFileSync(MAP,'utf8'));
await page.waitForFunction(()=>!!window.__swGame?.world?.store?.w,{timeout:240000});
const out=await page.evaluate(async()=>{
  void 0;
  const g=window.__swGame,st=g.world.store;
  const park=()=>{g.player.x=1640*16;g.player.y=(321-3)*16;g.player.vx=0;g.player.vy=0;g.player.fallStartY=null;};  // 出生点静区（无动画物）
  park();
  await new Promise(r=>setTimeout(r,1800));
  const cam=g.camera;
  const cvs=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const ctx=cvs.getContext('2d',{willReadFrequently:true});
  const z=cam.zoom,vw=cvs.width/z,vh=cvs.height/z;
  // 世界锚定窗：船舷实心区（6192..6200 × wl 上方 6..10 格）
  const win={x:Math.round((1636*16-(cam.x-vw/2))*z),y:Math.round((315*16-(cam.y-vh/2))*z),w:Math.round(96*z),h:Math.round(64*z)};
  const cap0=ctx.getImageData(win.x,win.y,win.w,win.h).data.slice();
  // 远行 60 格再折返（强制淘汰+重分配）
  g.player.x+=70*16; await new Promise(r=>setTimeout(r,900));
  g.player.x-=70*16; await new Promise(r=>setTimeout(r,900));
  g.player.y+=45*16; await new Promise(r=>setTimeout(r,900));
  g.player.y-=45*16; await new Promise(r=>setTimeout(r,1200));
  park(); await new Promise(r=>setTimeout(r,1500));   // 相机收敛回原位
  const cap1=ctx.getImageData(win.x,win.y,win.w,win.h).data;
  let diffPx=0,tot=0;const rows=new Map();
  for(let o=0;o<cap0.length;o+=4){tot++;
    if(Math.abs(cap0[o]-cap1[o])>20||Math.abs(cap0[o+1]-cap1[o+1])>20||Math.abs(cap0[o+2]-cap1[o+2])>20){
      diffPx++;const ry=Math.floor((o/4)/win.w);rows.set(ry,(rows.get(ry)??0)+1);
    }}
  // 船区复验：排除动画格（动态层合法时变）后的静态稳定性
  const TA=await import('/src/render/TileAnim.ts');
  const TILE_DEFS=(await import('/src/data/tiles.ts')).TILE_DEFS;
  const tmap=(await import('/src/data/tiles.ts')).TILE_INTERNAL_BY_SHEET;
  const cam2=g.camera;
  park();
  await new Promise(r=>setTimeout(r,1500));
  const w2={x:Math.round((6192*16-(cam2.x-vw/2))*z),y:Math.round((325*16-(cam2.y-vh/2))*z),w:Math.round(96*z),h:Math.round(64*z)};
  const mask=new Uint8Array(w2.w*w2.h);
  for(let py2=0;py2<w2.h;py2++)for(let px2=0;px2<w2.w;px2++){
    const wx2=Math.floor((w2.x+px2)/z/16+ (cam2.x-vw/2)/16), wy2=Math.floor((w2.y+py2)/z/16+(cam2.y-vh/2)/16);
    if(!st.inBounds(wx2,wy2))continue;
    const vd=TILE_DEFS[st.type[st.idx(wx2,wy2)]]?.vanilla;
    if(vd && TA.isDynamicAnimSheet(vd.sheet)) mask[py2*w2.w+px2]=1;
  }
  const capA=ctx.getImageData(w2.x,w2.y,w2.w,w2.h).data.slice();
  g.player.x+=70*16; await new Promise(r=>setTimeout(r,900));
  g.player.x-=70*16; await new Promise(r=>setTimeout(r,900));
  park(); await new Promise(r=>setTimeout(r,1500));
  const capB=ctx.getImageData(w2.x,w2.y,w2.w,w2.h).data;
  let dShip=0,tShip=0;
  for(let pi=0;pi<mask.length;pi++){ if(mask[pi])continue; tShip++;
    const o=pi*4;
    if(Math.abs(capA[o]-capB[o])>20||Math.abs(capA[o+1]-capB[o+1])>20||Math.abs(capA[o+2]-capB[o+2])>20)dShip++;
  }
  const cap=window.__swTileCap;
  return { diffPx, ratio:+(diffPx/tot).toFixed(4),
    shipDiffPx:dShip, shipRatio:+(dShip/Math.max(1,tShip)).toFixed(4),
    hotRows:[...rows.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4),
    win, bakesTotal:[...cap.bakes.values()].reduce((a,b)=>a+b.n,0) };
});
console.log(JSON.stringify(out));
process.exit(0);
