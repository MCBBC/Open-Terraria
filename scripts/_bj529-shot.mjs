// ★BJ529 视觉确认:暗腔内 270 复绘面截图（脉冲峰相位）
import { launchBrowser, openPage, bootstrap, createGame, freezeClock, savePageShot } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await freezeClock(page, { tod: 22 / 24 });
await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/entities/Arrow.ts');
  const st = g.world.store;
  const surf = g.world.groundLevel ?? 400;
  let sx = -1, sy = -1;
  outer: for (let ty = surf + 120; ty < Math.min(st.h - 60, surf + 700); ty += 4) {
    for (let tx = 60; tx < st.w - 60; tx += 7) {
      if (!st.inBounds(tx, ty)) continue;
      if (st.isSolid(tx, ty) || st.isSolid(tx, ty - 1) || st.isSolid(tx, ty + 1)
        || st.isSolid(tx - 1, ty) || st.isSolid(tx + 1, ty)) continue;
      if (st.liquid[st.idx(tx, ty)] !== 0) continue;
      sx = tx; sy = ty; break outer;
    }
  }
  const wx = sx * 16 + 8, wy = sy * 16 + 8;
  g.player.x = wx - g.player.w / 2; g.player.y = wy - g.player.h / 2;
  g.camera.x = wx; g.camera.y = wy;
  const p = new m.Arrow(wx + 250, wy, 0, 0, 17, 0, 270, { pierce: 3, skullBone: true, life: 320, grav: 0 });
  p.noTileCollide = true;
  g.entities.projectiles.push(p);
  g.__bj529p = p;
});
// 等到脉冲峰(life%40≈20)再截
for (let i = 0; i < 80; i++) {
  const phase = await page.evaluate(() => {
    const g = window.__swGame;
    g.camera.x = g.__bj529p.x - 250 + 0; g.camera.y = g.__bj529p.y;
    return Math.abs((g.__bj529p.life % 40) - 20);
  });
  if (phase <= 1) break;
  await new Promise((r) => setTimeout(r, 33));
}
const cv = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.__bj529p, cam = g.camera, cvv = g.renderer.canvas;
  const s = document.createElement('canvas');
  s.width = 160; s.height = 160;
  const sc = s.getContext('2d');
  const [px, py] = cam.worldToScreen(p.x + p.w / 2, p.y + p.h / 2);
  const z = cam.zoom * (window.devicePixelRatio || 1);
  sc.drawImage(cvv, px * (window.devicePixelRatio || 1) - 80, py * (window.devicePixelRatio || 1) - 80, 160, 160, 0, 0, 160, 160);
  void z;
  return s.toDataURL('image/png');
});
const fs = await import('node:fs');
fs.writeFileSync('/tmp/bj529-skull-shot.png', Buffer.from(cv.split(',')[1], 'base64'));
console.log(JSON.stringify({ ok: true, shot: '/tmp/bj529-skull-shot.png' }));
await browser.close();
