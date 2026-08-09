// 噬魂怪渲染像素分析：怪在画布上的实际绘制范围 + AI 状态（复用 _eaterdbg2 的可靠加载流程）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 90000 });
    break;
  } catch (e) { console.log(`goto retry ${attempt}: ${e.message}`); }
}
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  window.__swSetPool?.([6]);
  g.world.clock.timeOfDay = 0.9;
  const st = g.world.store;
  const ty = Math.floor(g.world.rockLevel) + 30;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = ty;
  while (gy < st.h - 20 && !st.isSolid(px0, gy)) gy++;
  const py0 = gy - 4;
  for (let dy = -12; dy <= 2; dy++) for (let dx = -30; dx <= 30; dx++) {
    st.setTile(px0 + dx, py0 + dy, dy === 2 ? 2 : 0);
    st.liquid[st.idx(px0 + dx, py0 + dy)] = 0;
  }
  g.player.x = (px0 + 10) * 16; g.player.y = (py0 - 4) * 16;
  for (let i = 0; i < 2000; i++) g.fixedUpdate(1 / 60);
  let e = g.entities.enemies.find((x) => x.vanilla?.aiStyle === 5 && !x.dead);
  if (!e) return { spawned: 0 };
  for (let i = 0; i < 400; i++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.querySelector('canvas');
  const ctx2 = canvas.getContext('2d');
  const [sx, sy] = g.camera.worldToScreen(e.cx, e.cy);
  const X0 = Math.max(0, Math.round(sx) - 100), Y0 = Math.max(0, Math.round(sy) - 100);
  const blk = ctx2.getImageData(X0, Y0, 200, 200).data;
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, cnt = 0;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
    const i = (y * 200 + x) * 4;
    const r = blk[i], gg = blk[i + 1], b = blk[i + 2];
    if (r < 95 && gg < 75 && b < 120 && !(r < 20 && gg < 20 && b < 20)) {
      cnt++;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }
  return {
    spawned: 1,
    eater: { x: Math.round(e.x), y: Math.round(e.y), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), onGround: e.onGround },
    screen: { sx: Math.round(sx), sy: Math.round(sy) },
    sprite: cnt ? { w: maxx - minx + 1, h: maxy - miny + 1, cnt, offX: minx - 100, offY: miny - 100 } : null,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
