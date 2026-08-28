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


// ---- 方案A 视觉对拍:同机位 K=1 vs K=0.66 ----
await new Promise(r=>setTimeout(r,1500));
await page.evaluate(() => {
  const g=window.__swGame;
  g.player.vx=0; g.player.vy=0;
  // 固定机位:地表上空含背景/HUD 静区
  g.camera.x = g.player.cx; g.camera.y = g.player.cy - 40;
});
const shot = async () => await page.screenshot({ type:'png' });
const setK = async (K) => { await page.evaluate(async(K)=>{ const m=await import('/src/core/Options.ts'); await m.options.set('renderScale',K); window.__swGame.renderer.applyUserRenderScale(); },K); await new Promise(r=>setTimeout(r,350)); };
await setK(1);  await new Promise(r=>setTimeout(r,250));
const pngA = (await shot()).toString('base64');
await setK(0.66); await new Promise(r=>setTimeout(r,250));
const pngB = (await shot()).toString('base64');
await setK(1);

// 页面内对比
const metrics = await page.evaluate(async (aB64,bB64) => {
  const load=(b)=>new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.src='data:image/png;base64,'+b;});
  const A=await load(aB64), B=await load(bB64);
  const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c.getContext('2d',{willReadFrequently:true});};
  // ① 把 A 缩到 B 的尺寸(模拟理想低清),逐像素比 B
  const s=mk(B.width,B.height); s.imageSmoothingEnabled=true; s.drawImage(A,0,0,B.width,B.height);
  const d1=s.getImageData(0,0,B.width,B.height).data, d2=B.getContext? null:null;
  const bctx=mk(B.width,B.height); bctx.drawImage(B,0,0);
  const db=bctx.getImageData(0,0,B.width,B.height).data;
  let diff=0, tot=B.width*B.height;
  for(let i=0;i<db.length;i+=4){ const d=Math.max(Math.abs(d1[i]-db[i]),Math.abs(d1[i+1]-db[i+1]),Math.abs(d1[i+2]-db[i+2])); if(d>12)diff++; }
  // ② HUD 区(右上 420×260)原尺寸直比:K 变化下 HUD 应逐位近似
  const hw=420,hh=260,hx=A.width-hw,hy=0;
  const ha=mk(hw,hh); ha.drawImage(A,hx,hy,hw,hh,0,0,hw,hh);
  const hb=mk(hw,hh); hb.drawImage(B,hx,hy,hw,hh,0,0,hw,hh);
  const da=ha.getImageData(0,0,hw,hh).data, dbb=hb.getImageData(0,0,hw,hh).data;
  let hd=0; for(let i=0;i<dbb.length;i+=4){ const d=Math.max(Math.abs(da[i]-dbb[i]),Math.abs(da[i+1]-dbb[i+1]),Math.abs(da[i+2]-dbb[i+2])); if(d>12)hd++; }
  return { worldDiffPct:+(diff/tot*100).toFixed(2), hudDiffPct:+(hd/(hw*hh)*100).toFixed(2), aw:A.width,bw:B.width };
}, pngA, pngB);
console.log('METRICS:',JSON.stringify(metrics));
let fail=0;
if(metrics.worldDiffPct>8){console.log('FAIL 世界构图差超阈值');fail++;}
if(metrics.hudDiffPct>3){console.log('FAIL HUD 区差异超阈值(HUD 应不随 K 变)');fail++;}
console.log(fail?'=== FAIL':'=== VISUAL PARITY PASS');
await browser.close(); process.exit(fail?3:0);
