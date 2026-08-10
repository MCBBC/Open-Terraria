// 史莱姆王视觉验证：①体内忍者（中心深色像素）②小史莱姆颜色滤镜（半透明+黑蒙版）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
for (let a = 0; a < 3; a++) {
  try { await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); }); break; }
  catch { await new Promise((r) => setTimeout(r, 1500)); }
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  // 把玩家放到开阔平地上，召唤 KS 到近处（summonBoss 选 55 格外——直接手动放 12 格外）
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 30;
  while (gy < st.h - 10 && !st.isSolid(px, gy)) gy++;
  for (let dy = -8; dy <= 1; dy++) for (let dx = -14; dx <= 14; dx++) st.setTile(px + dx, gy + dy, dy === 1 ? 2 : 0);
  g.player.x = px * 16 - g.player.w / 2;
  g.player.y = (gy - 3) * 16;
  // 直接 fromVanilla 造 KS 放近处
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const e = Enemy.fromVanilla(50, px * 16 + 12 * 16, (gy - 6) * 16);
  if (!e) return { err: 'no ks' };
  e.id = g.entities.nextId++;
  g.entities.add(e, 'enemies');
  g.boss = e;
  // 跑 120 tick 让 KS 落地
  for (let k = 0; k < 120; k++) g.fixedUpdate(1 / 60);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // 采样 KS 中心区域：找深色忍者像素（r<60,g<60,b<70）
  const [sx, sy] = g.camera.worldToScreen(e.cx, e.cy);
  const cv = g.renderer.canvas;
  const cx2 = cv.getContext('2d');
  function countDark(x0, y0, w, h) {
    const d = cx2.getImageData(x0, y0, w, h).data;
    let dark = 0, total = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) continue;
      total++;
      if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 70) dark++;
    }
    return { dark, total };
  }
  const kScale = cv.width / (g.camera.viewW || cv.width);
  const ksRegion = { raw: [Math.round(sx), Math.round(sy)], cw: cv.width, ch: cv.height, k: kScale, ...countDark(
    Math.max(0, Math.round(sx * kScale) - 100), Math.max(0, Math.round(sy * kScale) - 100), 200, 200) };
  // 小史莱姆：跑 600 tick 等落地出小怪（30% 概率），找 16 号
  for (let k = 0; k < 900; k++) {
    g.fixedUpdate(1 / 60);
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const babies = g.entities.enemies.filter((x) => x.vanillaId === 16 && !x.dead);
  let babyInfo = null;
  if (babies.length) {
    const b = babies[0];
    const [bx, by] = g.camera.worldToScreen(b.cx, b.cy);
    const bs = cv.width / (g.camera.viewW || cv.width);
    const d = cx2.getImageData(Math.max(0, Math.round(bx * bs) - 24), Math.max(0, Math.round(by * bs) - 24), 48, 48).data;
    let opaque = 0, total = 0, darkTint = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      total++;
      if (d[i + 3] > 200) opaque++;
      if (d[i] < 90 && d[i + 1] < 110 && d[i + 2] < 180) darkTint++;
    }
    babyInfo = {
      count: babies.length, alpha: b.spawnAlpha, color: b.colorRGBA,
      canvas: { total, opaqueRatio: +(opaque / Math.max(1, total)).toFixed(2), darkRatio: +(darkTint / Math.max(1, total)).toFixed(2) },
    };
  }
  return { ksRegion, babyInfo, babyCount: babies.length };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
