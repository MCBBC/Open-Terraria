// #perf2026-08-26 批零视觉差异优化对拍探针:
// ① 水体扭曲门控安全性:站在合成旱地(清液体带)上→前景水离屏(fgCanvas)应全透明;
//    此时【离线直调】applyFullScreen(真实管线/真噪声图),逐字节对比扭曲输出 vs
//    原样 scene——差=0 即"跳过上传"像素级安全实证。自然门控字段在旱地应为 false、
//    且真实帧循环中 applyFullScreen 零调用;水池视口则门=true 且合成照常。
// ② 云近双通道合并:'both'(新批路径)vs 'closer'+'closest' 分离调用(=改动前独立
//    会话语义,菜单注入路径原样保留)在两张同底色画布上逐字节对比;重复自跑两遍
//    作确定性对照(harness 自检);blit 计数验证 2→1。
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
// 音频解锁门会吞首次合成 click(既有坑)——先真点角落再进单人,失败重试
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
}
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('parity');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();   // 小世界 4200×1200
  });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 2500));


// ---- 方案A 视觉对拍:同机位 K=1 vs 0.66 vs 0.50 ----
await new Promise(r=>setTimeout(r,1500));
await page.evaluate(() => {
  const g=window.__swGame;
  g.player.vx=0; g.player.vy=0;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy - 40;
});
const fs=await import('node:fs');
  const shot = async (name) => { const b=await page.screenshot({ type:'png' }); fs.writeFileSync(name,b); return b; };
const setK = async (K) => { await page.evaluate(async(K)=>{ const m=await import('/src/core/Options.ts'); await m.options.set('renderScale',K); window.__swGame.renderer.applyUserRenderScale(); },K); await new Promise(r=>setTimeout(r,350)); };
await setK(1);  await new Promise(r=>setTimeout(r,250));
const pngA=(await shot('/tmp/rs-A.png')).toString('base64');
await setK(0.66); await new Promise(r=>setTimeout(r,250));
const pngB=(await shot('/tmp/rs-B.png')).toString('base64');
await setK(0.5); await new Promise(r=>setTimeout(r,250));
const pngC=(await shot('/tmp/rs-C.png')).toString('base64');
await setK(1);

const metrics = await page.evaluate(async (aB64,bB64,cB64) => {
  const load=(b)=>new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/png;base64,'+b;});
  const A=await load(aB64), B=await load(bB64), C=await load(cB64);
  const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c.getContext('2d',{willReadFrequently:true});};
  const cmp=(imgBig,K)=>{
    const W=Math.round(imgBig.width*K), H=Math.round(imgBig.height*K);
    const s=mk(W,H); s.imageSmoothingEnabled=true; s.drawImage(imgBig,0,0,W,H);
    const d1=s.getImageData(0,0,W,H).data;
    const t=mk(W,H); t.drawImage(K<1? (K===0.66?B:C):A, 0,0);
    const d2=t.getImageData(0,0,W,H).data;
    let diff=0; for(let i=0;i<d2.length;i+=4){ const d=Math.max(Math.abs(d1[i]-d2[i]),Math.abs(d1[i+1]-d2[i+1]),Math.abs(d1[i+2]-d2[i+2])); if(d>12)diff++; }
    return +(diff/(W*H)*100).toFixed(2);
  };
  const hud=(big,K)=>{
    const hw=420, hh=260;
    const w2=Math.round(hw*K), h2=Math.round(hh*K);
    const ca=mk(w2,h2); ca.drawImage(A, A.width-w2, 0, w2, h2, 0,0,w2,h2);       // 基线A该区→降采样
    const cb=mk(w2,h2); cb.drawImage(big, big.width-w2, 0, w2, h2, 0,0,w2,h2);   // 低清帧同区
    const da=ca.getImageData(0,0,w2,h2).data, db=cb.getImageData(0,0,w2,h2).data;
    let hd=0; for(let i=0;i<db.length;i+=4){ const d=Math.max(Math.abs(da[i]-db[i]),Math.abs(da[i+1]-db[i+1]),Math.abs(da[i+2]-db[i+2])); if(d>12)hd++; }
    return +(hd/(w2*h2)*100).toFixed(2);
  };
  return {
    world066: cmp(A,0.66),
    world050: cmp(A,0.5),
    hud066: hud(B,0.66),
    hud050: hud(C,0.5),
    aw:A.width, bw:B.width, cw:C.width,
  };
}, pngA, pngB, pngC);
console.log('METRICS:',JSON.stringify(metrics));
let fail=0;
if(metrics.world066>8){console.log('FAIL 0.66 构图差超阈值');fail++;}
if(metrics.world050>8){console.log('FAIL 0.5 构图差超阈值(疑似裂缝)');fail++;}
if(metrics.hud066>3||metrics.hud050>3){console.log('FAIL HUD 区差异超阈值');fail++;}
console.log(fail?'=== FAIL':'=== VISUAL PARITY PASS');
await browser.close(); process.exit(fail?3:0);
