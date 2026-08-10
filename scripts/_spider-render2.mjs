// 蜘蛛巢终判：火把照亮后拍墙 62 区域 + 输出用户种子里最近的巢坐标
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
  const tiles = await import('/src/data/tiles.ts');
  const TORCH = tiles.TILE_BY_KEY['torch'];
  // 找巢腔
  let target = null;
  for (let y = Math.floor(g.world.groundLevel) + 60; y < st.h - 240 && !target; y += 3) {
    for (let x = 200; x < st.w - 200; x += 3) {
      const i = st.idx(x, y);
      if (st.wall[i] === 62 && !st.flags[i]) { target = [x, y]; break; }
    }
  }
  if (!target) return { err: 'no nest' };
  // 周围一圈火把照亮（观察用，不落盘影响——setTileSilent）
  for (let dx = -6; dx <= 6; dx += 2) for (let dy = -5; dy <= 5; dy += 2) {
    const j = st.idx(target[0] + dx, target[1] + dy);
    if (!st.flags[j]) st.setTileSilent(target[0] + dx, target[1] + dy, TORCH, 0, 0);
  }
  g.player.x = target[0] * 16 + 8;
  g.player.y = target[1] * 16;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  await new Promise((r) => setTimeout(r, 2500));
  // 差分：移除墙 62（改 0）再拍一次对比
  const grab = () => {
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    const S = 40;
    const d = g.renderer.ctx.getImageData(Math.round(sx) - S, Math.round(sy) - S, S * 2, S * 2).data;
    let lum = 0, n = 0;
    for (let p = 0; p < d.length; p += 4) {
      if (d[p + 3] > 30) { lum += (d[p] + d[p + 1] + d[p + 2]) / 3; n++; }
    }
    return Math.round(lum / Math.max(1, n));
  };
  const withWall = grab();
  // 挖掉视野内墙 62（临时）重拍
  const saved = [];
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    const j = st.idx(target[0] + dx, target[1] + dy);
    if (st.wall[j] === 62) { saved.push([target[0] + dx, target[1] + dy]); st.wall[j] = 0; }
  }
  await new Promise((r) => setTimeout(r, 1200));
  const noWall = grab();
  for (const [x, y] of saved) st.wall[st.idx(x, y)] = 62;
  return { target, withWallLum: withWall, noWallLum: noWall };
});
console.log(JSON.stringify(out, null, 1));
if (!out.err) {
  await page.screenshot({ path: 'shots/spider-nest.png' });
  console.log('screenshot: shots/spider-nest.png');
}
await browser.close();
