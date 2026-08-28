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


// ---- 方案A 验证体 ----
await new Promise(r=>setTimeout(r,1200));
const measure = () => page.evaluate(async () => {
  const g=window.__swGame,c=g.renderer.canvas,cam=g.camera;
  const rect=c.getBoundingClientRect();
  window.dispatchEvent(new MouseEvent('mousemove',{clientX:rect.left+rect.width/2,clientY:rect.top+100}));
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return { cw:c.width,ch:c.height,zoomEff:+cam.zoom.toFixed(3),
    tilesSpan:+(c.width/(cam.zoom*16)).toFixed(2),
    mx:+g.input.mouseX.toFixed(1),
    wx:Math.round(g.camera.screenToWorld(g.input.mouseX,g.input.mouseY)[0]),
    wy:Math.round(g.camera.screenToWorld(g.input.mouseX,g.input.mouseY)[1]) };
});
const base=await measure();
const rungs=[0.75,0.5];
const results=[];
for(const K of rungs){
  await page.evaluate(async(K)=>{
    const m=await import('/src/core/Options.ts');
    await m.options.set('renderScale',K);
    window.__swGame.renderer.applyUserRenderScale();
  },K);
  await new Promise(r=>setTimeout(r,250));
  results.push({K,...(await measure())});
}

// 直发画布事件复核(绕开命中目标问题)
for (const K of [1, 0.5]) {
  await page.evaluate(async (K) => {
    const m = await import('/src/core/Options.ts');
    await m.options.set('renderScale', K);
    window.__swGame.renderer.applyUserRenderScale();
    await new Promise(r=>setTimeout(r,150));
    const c = window.__swGame.renderer.canvas;
    const r = c.getBoundingClientRect();
    const ev = new MouseEvent('mousemove', { clientX: r.left + r.width / 2, clientY: r.top + 100, bubbles: true });
    c.dispatchEvent(ev);
  }, K);
  await new Promise(r=>setTimeout(r,80));
  const got = await page.evaluate(() => {
    const g=window.__swGame;
    return { cw:g.renderer.canvas.width, mx:+g.input.mouseX.toFixed(1),
      mid:+(g.renderer.canvas.width/2).toFixed(1) };
  });
  console.log(`${Math.abs(got.mx-got.mid)<=2?'PASS':'FAIL'} K=${K}: 直接派发后 mouseX=${got.mx} ≈ 内部中心 ${got.mid}`);
}
await browser.close();
process.exit(0);
// ---- 铺满验证:K=0.5 下 boundingRect 必须=视口,且截图四角非黑 ----
for (const K of [1, 0.5]) {
  await page.evaluate(async (K) => {
    const m = await import('/src/core/Options.ts');
    await m.options.set('renderScale', K);
    window.__swGame.renderer.applyUserRenderScale();
    await new Promise(r=>setTimeout(r,200));
  }, K);
  await new Promise(r=>setTimeout(r,300));
  const got = await page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const r = c.getBoundingClientRect();
    return { cw:c.width, cssW:+r.width.toFixed(0), cssH:+r.height.toFixed(0),
      vw:innerWidth, vh:innerHeight,
      right:+r.right.toFixed(0), bottom:+r.bottom.toFixed(0) };
  });
  const fills = Math.abs(got.cssW-got.vw)<=2 && Math.abs(got.cssH-got.vh)<=2 && Math.abs(got.right-got.vw)<=2;
  console.log(`${fills?'PASS':'FAIL'} K=${K}: css=${got.cssW}x${got.cssH} 视口=${got.vw}x${got.vh} right=${got.right} bottom=${got.bottom}`);
}
await page.evaluate(async () => {
  const m = await import('/src/core/Options.ts');
  await m.options.set('renderScale', 0.5);
  window.__swGame.renderer.applyUserRenderScale();
});
await new Promise(r=>setTimeout(r,600));
await page.screenshot({ path: '/tmp/rscale-050-fill.png' });
console.log('screenshot: /tmp/rscale-050-fill.png');
await browser.close();
process.exit(0);
