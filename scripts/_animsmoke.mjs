// 动画改动冒烟：跑动相位差分（行走循环在动）+ 跳跃相位截图。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const bx = Math.floor(p.x / 16), by = Math.floor((p.y + p.h) / 16);
  for (let dx = -40; dx <= 40; dx++) for (let dy = -10; dy <= 1; dy++) {
    if (dy === 1) continue;
    st.setTile(bx + dx, by + dy, 0);
  }
  await new Promise(r => setTimeout(r, 300));
  p.x = bx * 16 + 8; p.y = (by + 1) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
  await new Promise(r => setTimeout(r, 400));
  const cam = g.camera, cv = g.renderer.canvas;
  const px = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const sample = ([x, y]) => {
    const d = g.renderer.ctx.getImageData(x - 20, y - 56, 40, 60).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 16) h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) | 0;
    return h;
  };
  // 跑动两相位
  g.input.touchKeys.add('KeyD');
  await new Promise(r => setTimeout(r, 350));
  const a = sample(px(p.cx, p.y + p.h));
  await new Promise(r => setTimeout(r, 250));
  const b = sample(px(p.cx, p.y + p.h));
  g.input.touchKeys.delete('KeyD');
  // 跳跃
  g.input.touchKeys.add('Space');
  await new Promise(r => setTimeout(r, 120));
  g.input.touchKeys.delete('Space');
  await new Promise(r => setTimeout(r, 160));
  const rising = { vy: +p.vy.toFixed(2), h: sample(px(p.cx, p.y + p.h)) };
  await new Promise(r => setTimeout(r, 500));
  const falling = { vy: +p.vy.toFixed(2), h: sample(px(p.cx, p.y + p.h)) };
  return { walkA: a, walkB: b, walkDiff: a !== b, rising, falling, grounded: p.onGround };
});
console.log(JSON.stringify({ ...out, errors }, null, 1));
await browser.close();
