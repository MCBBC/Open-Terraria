// 蜘蛛巢渲染验证：找到墙 62 区域，传送拍照，与邻近石墙洞穴对比
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  const has = await page.evaluate(() => !!document.querySelector('select')).catch(() => false);
  if (has) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  const g = window.__swGame;
  const st = g.world.store;
  // 找一个墙 62 且空气的格（巢腔内部）
  let target = null;
  for (let y = Math.floor(g.world.groundLevel) + 60; y < st.h - 240 && !target; y += 3) {
    for (let x = 200; x < st.w - 200; x += 3) {
      const i = st.idx(x, y);
      if (st.wall[i] === 62 && !st.flags[i]) { target = [x, y]; break; }
    }
  }
  if (!target) return { err: 'no wall62 air cell' };
  g.player.x = target[0] * 16 + 8;
  g.player.y = target[1] * 16;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  await new Promise((r) => setTimeout(r, 2500));
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  const S = 60;
  const d = g.renderer.ctx.getImageData(Math.round(sx) - S, Math.round(sy) - S, S * 2, S * 2).data;
  let n = 0, rSum = 0, gSum = 0, bSum = 0;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] > 30) { n++; rSum += d[p]; gSum += d[p + 1]; bSum += d[p + 2]; }
  }
  return { target, avg: n ? [Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)] : null };
});
console.log(JSON.stringify(out, null, 1));
if (!out.err) await page.screenshot({ path: 'shots/spider-nest.png' });
await browser.close();
