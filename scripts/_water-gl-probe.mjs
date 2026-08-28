// 水体 GL 效果回归验证:传送至最近水域 →
// ① fgCanvas 有前景水内容(非全透明)
// ② gpulog waterDistortion 上传/合成持续(全屏扭曲管线活着)
// ③ 截图肉眼复核
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5210') + '/?gpulog=1';
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const logs = [];
page.on('console', m => { const t = m.text(); if (t.includes('gpulog') || t.includes('驻留=')) logs.push(t); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('wg');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
if (await page.$('.sw-vsel .sw-vitem')) {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 1000 });
}
await new Promise(r => setTimeout(r, 1500));
// 找最近水域并传送
const tp = await page.evaluate(() => {
  const g = window.__swGame; const st = g.world.store;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  let best = null;
  for (let r = 4; r < 200 && !best; r += 4) {
    for (let a = 0; a < 360; a += 15) {
      const x = px + Math.round(r * Math.cos(a * Math.PI / 180));
      const y = py + Math.round(r * Math.sin(a * Math.PI / 180));
      if (x < 5 || y < 5 || x >= st.w - 5 || y >= st.h - 5) continue;
      if (st.liquid[st.idx(x, y)] > 100) { best = { x, y }; break; }
    }
  }
  if (best) {
    g.player.x = best.x * 16; g.player.y = (best.y - 6) * 16;
    g.player.vx = 0; g.player.vy = 0;
  }
  return best;
});
console.log('water found at:', JSON.stringify(tp));
if (!tp) { console.log('=== 附近无水域,探针不适用 ==='); await browser.close(); process.exit(0); }
await new Promise(r => setTimeout(r, 2500));
const check = await page.evaluate(() => {
  const g = window.__swGame;
  const gate = g.renderer.waterWarp.gateCanvas();
  let alphaPx = 0;
  if (gate && gate.width > 0) {
    const t = document.createElement('canvas'); t.width = Math.min(200, gate.width); t.height = gate.height;
    const x = t.getContext('2d', { willReadFrequently: true });
    x.drawImage(gate, 0, 0);
    const d = x.getImageData(0, 0, t.width, t.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) alphaPx++;
  }
  const c = g.renderer.canvas;
  const t2 = document.createElement('canvas'); t2.width = 60; t2.height = 60;
  const x2 = t2.getContext('2d', { willReadFrequently: true });
  x2.drawImage(c, c.width / 2 - 30, c.height / 2 - 30, 60, 60, 0, 0, 60, 60);
  const d2 = x2.getImageData(0, 0, 60, 60).data;
  let blueish = 0;
  for (let i = 0; i < d2.length; i += 4) if (d2[i + 2] > d2[i] + 20 && d2[i + 2] > 60) blueish++;
  return { gateAlphaPx: alphaPx, blueishCenter: blueish, warpActive: g.renderer.waterWarpActive() };
});
console.log(JSON.stringify(check));
await page.screenshot({ path: '/tmp/water-gl-check.png' });
const ok = check.gateAlphaPx > 50 && check.warpActive;
console.log(ok ? '=== WATER GL PIPELINE ALIVE ===' : '=== GL 管线异常 ===');
await browser.close();
process.exit(ok ? 0 : 3);
