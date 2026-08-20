// 史莱姆三档观感对比图：A=当前(原版公式) B=色层×1.5 C=旧观感(不透明)
// 生成横向拼图让用户指认哪个匹配原版记忆
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 220000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  g.world.clock.isDay = true; g.world.clock.timeOfDay = 0.5;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  // 草地平台（同用户场景的草地背景）
  for (let dx = -20; dx <= 20; dx++) {
    for (let dy = -18; dy <= 0; dy++) st.setTile(bx + dx, by + dy, 0);
    st.setTile(bx + dx, by + 1, 2, 0, 0);   // 草方块
  }
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const mk = (x) => {
    const s = Enemy.fromVanilla(1, x * 16, (by - 1) * 16);
    g.entities.add(s, 'enemies');
    s.facing = -1; s.vx = 0; s.vy = 0;
    return s;
  };
  const s1 = mk(bx - 8);
  p.x = (bx + 8) * 16; p.y = by * 16 - p.h; p.vx = 0; p.vy = 0;
  await new Promise(r => setTimeout(r, 300));
  const cv = g.renderer.canvas, cam = g.camera, zoom = cam.zoom;
  const crop = (wx, wy) => {
    const x = (wx - cam.x) * zoom + cv.width / 2, y = (wy - cam.y) * zoom + cv.height / 2;
    const c = document.createElement('canvas'); c.width = 96; c.height = 64;
    c.getContext('2d').drawImage(cv, x - 48, y - 32, 96, 64, 0, 0, 96, 64);
    return c;
  };
  const a = crop(s1.x, s1.y);
  // B 档：色层强度×1.5（color.A 100→150 模拟）
  const s2 = mk(bx - 4);
  s2.colorRGBA = [0, 80, 255, 150];
  await new Promise(r => setTimeout(r, 120));
  const b = crop(s2.x, s2.y);
  // C 档：不透明旧观感（spawnAlpha 0 + color.A 150）
  const s3 = mk(bx + 0);
  s3.spawnAlpha = 0; s3.colorRGBA = [0, 80, 255, 150];
  await new Promise(r => setTimeout(r, 120));
  const c = crop(s3.x, s3.y);
  const strip = document.createElement('canvas');
  strip.width = 96 * 3 + 20; strip.height = 64;
  const sc = strip.getContext('2d');
  sc.fillStyle = '#222'; sc.fillRect(0, 0, strip.width, strip.height);
  sc.drawImage(a, 0, 0); sc.drawImage(b, 102, 0); sc.drawImage(c, 204, 0);
  return { shot: strip.toDataURL('image/png').split(',', 2)[1] };
});
console.log(JSON.stringify(out));
await browser.close();
