// 放置动画验证：持泥土块按住左键——swing 循环重启、放置成功、useTime=10×tileSpeed。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  // 泥土块入手（__swItems 全局映射）
  const dirtKey = Object.keys(window.__swItems).find((k) => /^vi_2_|^dirt_block$/.test(k));
  const dirtId = window.__swItems[dirtKey];
  p.inv.slots[p.inv.selected] = { id: dirtId, stack: 999 };
  // 平整地面：脚下 3 格内清空 + 一块空地
  const bx = Math.floor(p.x / 16), by = Math.floor((p.y + p.h) / 16);
  for (let dx = -20; dx <= 20; dx++) for (let dy = -8; dy <= 1; dy++) {
    if (dy === 1) continue;
    st.setTile(bx + dx, by + dy, 0);
  }
  await new Promise(r => setTimeout(r, 300));
  p.x = bx * 16 + 8; p.y = (by + 1) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
  await new Promise(r => setTimeout(r, 300));
  // 目标格：地板正上方第一排空格，列避开玩家身体（原版禁覆盖玩家）
  const tx = bx + 3, ty = by;
  // 模拟左键按下：input.mouseDown + 鼠标世界坐标指向目标格
  const cam = g.camera, cv = g.renderer.canvas;
  const sx = (tx * 16 + 8 - cam.x) * cam.zoom + cv.width / 2;   // 屏幕像素
  const sy = (ty * 16 + 8 - cam.y) * cam.zoom + cv.height / 2;
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.input.mouseDown = true;
  const samples = [];
  const t0 = performance.now();
  const sampler = setInterval(() => {
    samples.push({ t: +(performance.now() - t0).toFixed(0), swing: g.swing ? g.swing.t : 0, useTime: p.useTime, type: st.get(tx, ty) });
  }, 60);
  await new Promise(r => setTimeout(r, 2000));
  clearInterval(sampler);
  g.input.mouseDown = false;
  const placedVid = st.get(tx, ty);
  return { samples: samples.filter((s, i) => i % 2 === 0), placed: placedVid, dirtId };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
