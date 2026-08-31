// 齿轮块 272 修复验证（2026-08-31）：Starter_World 海盗船区
//   A 生效表：pitch=90 / rate=10 / frames=2
//   B 相位域：cogAddFrY 全 tick 扫描 ∈ {0,90}
//   C 实机账本：sheets[272] 的 oob/clamp/fallback 恒 0
//   D 视觉留证：两时刻截图 /tmp/cog-a.png|b.png（间隔≥2 周期）
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
await new Promise(r=>setTimeout(r,1500));
const out=await page.evaluate(async()=>{
  const g=window.__swGame,st=g.world.store;
  const TA=await import('/src/render/TileAnim.ts');
  const cap=window.__swTileCap;
  const A={rate:cap.tblRate[272],pitch:cap.tblPitch[272],frames:cap.tblFrames[272]};
  // B 相位域扫描
  let bad=null;
  outer:
  for(let tk=0;tk<40;tk++){TA.tileAnim.tick=tk;
    for(let x=0;x<7;x++)for(let y=0;y<7;y++){
      const off=TA.cogAddFrY(x,y);
      if(off!==0&&off!==90){bad={tk,x,y,off};break outer;}
    }}
  // 玩家放船区（报告相机中心 6193,305）
  g.player.x=6193*16;g.player.y=(305+6)*16;g.player.vx=0;g.player.vy=0;
  await new Promise(r=>setTimeout(r,2000));
  const s272=cap.sheets.get(272);
  const d0={oob:s272?.oob??0,clamp:s272?.clamped??0,fb:s272?.fallback??0,n:s272?.n??0};
  await new Promise(r=>setTimeout(r,3000));
  const s272b=cap.sheets.get(272);
  return {A,bad,
    draws:s272b?.n??-1,
    oobGrow:(s272b?.oob??0)-d0.oob,
    clampGrow:(s272b?.clamped??0)-d0.clamp,
    fbGrow:(s272b?.fallback??0)-d0.fb};
});
console.log(JSON.stringify(out));
// D 截图两张（★勿 setViewport——会触发整页 reload 回到加载页，探针三坑老雷）
await new Promise(r=>setTimeout(r,600));
// 把相机摆到让船区落在屏幕左上 400×300（相机=玩家中心）
await page.evaluate(() => {
  const g = window.__swGame, cam = g.camera;
  const viewW = 988 / cam.zoom, viewH = 862 / cam.zoom;
  const shipX = 6193 * 16, shipY = 305 * 16;
  const wantCamX = shipX - 60 + viewW / 2 - 0;    // 船偏屏幕左侧
  const wantCamY = shipY + 40 + viewH / 2 - 0;    // 船偏屏幕上侧
  g.player.x = wantCamX; g.player.y = wantCamY;
  g.player.vx = 0; g.player.vy = 0;
});
await new Promise(r=>setTimeout(r,1500));   // 相机收敛
// 隐藏全部不含 canvas 的 fixed/absolute DOM 覆盖层（欢迎框/背包/热键条），仅留世界画布
await page.evaluate(() => {
  const hideOverlay = (root) => {
    for (const el of [...root.children]) {
      if (el.tagName === 'CANVAS') continue;
      if (el.querySelector?.('canvas')) { hideOverlay(el); continue; }
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'absolute') { el.style.display = 'none'; continue; }
      if (el.children.length) hideOverlay(el);
    }
  };
  hideOverlay(document.body);
});
await new Promise(r=>setTimeout(r,600));
const camDump = { x: 0, y: 0, width: 400, height: 300 };
fs.writeFileSync('/tmp/cog-a.png', Buffer.from(await page.screenshot({ clip: camDump })));
await new Promise(r=>setTimeout(r,1800));
fs.writeFileSync('/tmp/cog-b.png', Buffer.from(await page.screenshot({ clip: camDump })));
try{
  if(out.fail||out.bad) process.exit(2);
  const pass=out.A.pitch===90&&out.A.rate===10&&out.oobGrow===0&&out.clampGrow===0&&out.fbGrow===0&&out.draws>500;
  process.exit(pass?0:1);
}finally{await browser.close();}
