// _lavaslope-repro16: 近距离(fullbright, zoom 2)渲染 oracle 标记格:
// 水岸 (1676,464)/(1679,456)/(1681,466) 与 岩浆半砖 (2018,1123)/(2027,1135)。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');
const MAP = needInput(join(DOWNLOADS, 'map-饥饿的庄园 (1).json'));
const SPOTS = [
  ['water-s4', 1679, 456], ['water-s1', 1676, 464], ['water-hf', 1681, 466],
  ['lava-hf', 2018, 1123], ['lava-hf2', 2027, 1135],
];
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 900 },
  args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-features=IntensiveWakeUpThrottling'],
});
const p = await b.newPage();
let booted = false;
for (let attempt = 0; attempt < 3 && !booted; attempt++) {
  await p.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson).catch(() => false)) { booted = true; break; }
  }
}
if (!booted) { console.log('FAIL boot'); await b.close(); process.exit(1); }
await p.evaluate(async t => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame?.world?.store?.w).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 2000));
for (let i = 0; i < 10; i++) {
  const gone = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const ok = btns.find(x => /我已知晓|已知晓|OK|知道了/.test(x.textContent || ''));
    if (ok) { ok.click(); return false; }
    return true;
  }).catch(() => true);
  if (gone) break;
  await new Promise(r => setTimeout(r, 400));
}
await p.evaluate(() => {
  const g = window.__swGame;
  g.liquid.updateLiquid = () => {};
  g.world.clock.timeOfDay = 0.5;
  if (g.world.weather) { g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0; g.world.weather.maxRaining = 0; }
  g.player.debugGod = true;
  g.player.hp = g.player.maxHp; g.player.dead = false;
  g.renderer.fullbright = true;
});
for (const [tag, tx, ty] of SPOTS) {
  await p.evaluate(({ x, y }) => {
    const g = window.__swGame, pl = g.player;
    pl.hp = pl.maxHp; pl.dead = false;
    pl.x = x * 16 - pl.w / 2; pl.y = (y - 5) * 16;
    pl.vx = 0; pl.vy = 0;
    g.camera.x = pl.x + pl.w / 2; g.camera.y = pl.y + pl.h / 2;
    try { g.camera.targetZoom = 2; } catch (e) {}
    g.camera.zoom = 2;
  }, { x: tx, y: ty });
  await p.bringToFront();
  // 钉住相机(后台上 throttling 会让 follow 停摆,直接反复 snap)
  for (let k = 0; k < 12; k++) {
    await p.evaluate(({ x, y }) => {
      const g = window.__swGame, pl = g.player;
      pl.x = x * 16 - pl.w / 2; pl.y = (y - 5) * 16;
      pl.vx = 0; pl.vy = 0;
      g.camera.x = pl.x + pl.w / 2; g.camera.y = pl.y + pl.h / 2;
      g.camera.zoom = 2;
    }, { x: tx, y: ty });
    await new Promise(r => setTimeout(r, 180));
  }
  const cam = await p.evaluate(() => {
    const g = window.__swGame;
    return { cx: g.camera.x, cy: g.camera.y, z: g.camera.zoom, W: g.renderer.canvas.width, H: g.renderer.canvas.height };
  });
  // 等画布活像素(节流恢复):非黑像素比例 > 5% 才截图
  for (let k = 0; k < 20; k++) {
    const alive = await p.evaluate(() => {
      const g = window.__swGame, cv = g.renderer.canvas;
      const t = document.createElement('canvas');
      t.width = 64; t.height = 64;
      const c2 = t.getContext('2d');
      c2.drawImage(cv, cv.width / 2 - 32, cv.height / 2 - 32, 64, 64, 0, 0, 64, 64);
      const d = c2.getImageData(0, 0, 64, 64).data;
      let nz = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 18) nz++;
      return nz / (64 * 64);
    }).catch(() => 0);
    if (alive > 0.05) break;
    await new Promise(r => setTimeout(r, 400));
  }
  await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: `${OUT}/l16-${tag}.png` });
  console.log(`${tag} (${tx},${ty}) cam=`, JSON.stringify(cam));
}
await b.close();
process.exit(0);
