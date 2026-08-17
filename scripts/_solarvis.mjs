// 日曜盾球视觉验证：穿全套日耀甲→回盾→轨道摆动→buff 170 上栏→充能尘6。
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
  const g = window.__swGame, p = g.player;
  const pick = (n) => { const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + n + '_').test(x)); return window.__swItems[k]; };
  const [h, b, l] = [pick(2763), pick(2764), pick(2765)];
  p.inv.armor[0] = { id: h, stack: 1 };
  p.inv.armor[1] = { id: b, stack: 1 };
  p.inv.armor[2] = { id: l, stack: 1 };
  await new Promise(r => setTimeout(r, 400));
  const solarSet = p.equipStats.solarSet;
  const dustBefore = g.vanillaDust.pool.filter(d => d.type === 6).length;
  // 等 3.5s 回一层盾（180t=3s）
  await new Promise(r => setTimeout(r, 3500));
  const posA = { ...p.solarShieldPos[0] };
  await new Promise(r => setTimeout(r, 400));
  const posB = { ...p.solarShieldPos[0] };
  const dust6 = g.vanillaDust.pool.filter(d => d.type === 6).length - dustBefore;
  const buffs = [...p.buffs.active.keys()].map(Number);
  // 画布像素实证：盾球屏位（玩家中心+pos0）周边 24×44 采样非背景亮像素
  const cam = g.camera, cv = g.renderer.canvas;
  const sx = Math.round((p.x + p.w / 2 + p.solarShieldPos[0].x - cam.x) * cam.zoom + cv.width / 2);
  const sy = Math.round((p.y + p.h / 2 + p.solarShieldPos[0].y - cam.y) * cam.zoom + cv.height / 2);
  const img = g.renderer.ctx.getImageData(Math.max(0, sx - 12), Math.max(0, sy - 22), 24, 44).data;
  let bright = 0, rSum = 0, gSum = 0, bSum = 0, orange = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] > 80 && img[i] + img[i + 1] + img[i + 2] > 200) {
      bright++; rSum += img[i]; gSum += img[i + 1]; bSum += img[i + 2];
      if (img[i] > img[i + 2] + 30 && img[i] > 120) orange++;   // 火球橙系
    }
  }
  return {
    solarSet, pieces: [h, b, l],
    shields: p.solarShields,
    posA: [ +posA.x.toFixed(1), +posA.y.toFixed(1) ],
    posB: [ +posB.x.toFixed(1), +posB.y.toFixed(1) ],
    orbitMoving: Math.abs(posB.x - posA.x) + Math.abs(posB.y - posA.y) > 0.01,
    dust6Spawned: dust6,
    buffsHasSolar: buffs.includes(103) || buffs.includes(104) || buffs.includes(105),
    buffsRaw: buffs,
    orbPx: { bright, orange, avg: bright ? [Math.round(rSum / bright), Math.round(gSum / bright), Math.round(bSum / bright)] : null },
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/solar_orb.png' });
await browser.close();
