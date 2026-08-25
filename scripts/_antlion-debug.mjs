// B 场景轨迹调试：采样沙球位置/存活 + 列内 tile 变化时序
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1000));
  const g = window.__swGame;
  const st = g.world.store;
  const { Dart } = await import('/src/entities/Dart.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const X = g.world.spawnX + 12;
  const Y = Math.floor(g.world.groundLevel);
  for (let dx = -4; dx <= 4; dx++) for (let dy = -9; dy <= -1; dy++) {
    if (st.inBounds(X + dx, Y + dy) && st.get(X + dx, Y + dy) !== 0) st.setTile(X + dx, Y + dy, 0, 0, 0);
  }
  for (let dx = -1; dx <= 1; dx++) st.setTile(X + dx, Y, 2, 0, 0);
  st.setTile(X, Y - 1, 3, 0, 0);   // 草苗

  const d = new Dart(X * 16 + 3, (Y - 7) * 16 + 3, 0, 5, 10, 31);
  d.hostile = true;
  g.entities.add(d, 'projectiles');

  const samples = [];
  for (let i = 0; i < 14; i++) {
    await sleep(100);
    const col = [];
    for (let dy = -9; dy <= -1; dy++) { const t = st.get(X, Y + dy); if (t !== 0) col.push([Y + dy, t]); }
    samples.push({
      dartDead: d.dead,
      cy: +((d.y + d.h / 2) / 16).toFixed(2),
      cell: [Math.floor(d.cx / 16) - X, Math.floor(d.cy / 16) - Y],
      col: col.map(([y, t]) => `${y - Y}:${t}`).join(' '),
    });
    if (d.dead && i > 4) break;
  }
  return { X, Y, samples };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
