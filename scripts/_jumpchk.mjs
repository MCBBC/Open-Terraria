// 复测：跳高不受 vy==0 守卫影响 + 撞顶终止平台段
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1800));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  // ① 敞顶跳（正常跳高）
  for (let dx = -40; dx <= 40; dx++) {
    for (let dy = -12; dy <= 2; dy++) st.setTile(bx + dx, by + dy, dy === 2 ? 1 : 0);
  }
  await new Promise(r => setTimeout(r, 300));
  p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.fallStartY = null; p.onGround = false;
  await new Promise(r => setTimeout(r, 200));
  let y0 = p.y, peak = 0;
  g.input.touchKeys.add('Space');
  for (let f = 0; f < 90; f++) {
    await new Promise(r => setTimeout(r, 16));
    peak = Math.max(peak, y0 - p.y);
    if (p.onGround && f > 10) break;
  }
  g.input.touchKeys.delete('Space');
  await new Promise(r => setTimeout(r, 400));
  // ② 低顶跳（6 格上方天花板——平台段应在撞顶 vy=0 时终止）
  for (let dx = -3; dx <= 3; dx++) st.setTile(bx + dx, by - 6, 1);   // 天花板在头顶 8 格上方（by-6）
  p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.fallStartY = null; p.onGround = false;
  await new Promise(r => setTimeout(r, 300));
  let ceilPeak = 0, vyAtCeil = 99, jumpHoldAtCeil = -1;
  y0 = p.y;
  g.input.touchKeys.add('Space');
  for (let f = 0; f < 90; f++) {
    await new Promise(r => setTimeout(r, 16));
    ceilPeak = Math.max(ceilPeak, y0 - p.y);
    if (p.hitHead) { vyAtCeil = p.vy; jumpHoldAtCeil = p.jumpHold; break; }
    if (p.onGround && f > 10) break;
  }
  g.input.touchKeys.delete('Space');
  // 撞顶后下一 tick jumpHold 应清零
  await new Promise(r => setTimeout(r, 40));
  const after = { jumpHold: p.jumpHold };
  for (let dx = -3; dx <= 3; dx++) st.setTile(bx + dx, by - 6, 0);
  return { openPeakPx: Math.round(peak * 10) / 10, ceilPeakPx: Math.round(ceilPeak * 10) / 10,
    hitHead: vyAtCeil !== 99, vyAtCeil, jumpHoldAtCeil, after };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
