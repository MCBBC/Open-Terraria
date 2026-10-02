// 修复后 2 分钟稳定性:星璇柱场景,合成山带指纹逐秒采样,统计硬切换次数
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await clockSet(page, 0.85);
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = g.world.spawnX * 16 + 400;
  g.player.y = ((g.world.store.surfaceY ?? 300) - 6) * 16;
  g.player.vy = 0;
  void g.__swFlow;
});
await page.evaluate(() => {
  const g = window.__swGame;
  const px = g.player.x, py = g.player.y;
  g.player.debugGod = true;
  g.player.statLife = g.player.statLifeMax2;
  window.__swFlow.spawnVanillaEnemy(507, px + 300, py - 100);
  for (const vid of [420, 421, 423]) window.__swFlow.spawnVanillaEnemy(vid, px + 150, py - 60);
  const iid = window.__swFlow.itemByVid(4956);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
});
await page.mouse.move(900, 300);
await page.mouse.down();
await page.keyboard.down('KeyW');
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__s = [];
  const W = r.canvas.width, H = r.canvas.height;
  const sc = document.createElement('canvas');
  sc.width = W; sc.height = 40;
  const scx = sc.getContext('2d', { willReadFrequently: true });
  window.__band = (y0f) => {
    const gl = document.getElementById('sw-c10e-glcanvas');
    const y0 = Math.round(H * y0f);
    scx.clearRect(0, 0, W, 40);
    for (const c of [r.skyCanvas, gl, r.canvas]) if (c) { try { scx.drawImage(c, 0, y0, W, 40, 0, 0, W, 40); } catch { /* - */ } }
    const d = scx.getImageData(0, 0, W, 40).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
    return Math.round(sum / n * 10) / 10;
  };
  setInterval(() => {
    window.__s.push({ t: Math.round(performance.now() / 100), m: window.__band(0.42), cam: Math.round(g.camera.y), py: Math.round(g.player.y) });
    if (window.__s.length > 600) window.__s.shift();
  }, 1000);
});
// 横移扫荡(同原探针)
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  await page.keyboard.down(i % 2 ? 'KeyA' : 'KeyD');
  await new Promise((r) => setTimeout(r, 1200));
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyD');
}
await page.keyboard.up('KeyW');
await page.mouse.up();
const s = await page.evaluate(() => window.__s);
let flips = 0, prev = null, lo = 1e9, hi = 0;
for (const x of s) {
  lo = Math.min(lo, x.m); hi = Math.max(hi, x.m);
  const st = x.m > 12;
  if (prev !== null && st !== prev) flips++;
  prev = st;
}
const pys = [...new Set(s.map((x) => Math.round(x.py / 100) * 100))];
console.log(`2min: n=${s.length} 山带均亮=[${lo},${hi}] 亮暗硬切换=${flips} 玩家高度档=${pys.join(',')}`);
process.exit(0);
