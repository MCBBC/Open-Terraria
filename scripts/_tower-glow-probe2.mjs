// 探针 v2:关欢迎弹窗 → 夜间 → 玩家贴塔 → 塔屏幕 bbox + halo 带像素采样 + 截图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&twr2' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));
// 关欢迎弹窗
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('我已知晓'));
  btn?.click();
});
await new Promise((r) => setTimeout(r, 400));

await page.evaluate(() => {
  const g = window.__swGame;
  // 插桩(中立)
  const proto = Object.getPrototypeOf(g.renderer);
  window.__probe = { glow: [], shield: [], vimg: [] };
  const og = proto.drawNpcGlow;
  proto.drawNpcGlow = function (e, r, bx, by) {
    window.__probe.glow.push(e?.vanillaId ?? null);
    return og.call(this, e, r, bx, by);
  };
  const os = proto.drawTowerShield;
  proto.drawTowerShield = function (e, world) {
    window.__probe.shield.push({ vid: e?.vanillaId, s: world?.lunarEvent.shield.solar });
    return os.call(this, e, world);
  };
  // 夜间(0=午夜线性 24h;0.0=午夜 → isDay=false)
  g.world.timeOfDay = 0.02;
  // 找平地
  const st = g.world.store;
  for (let x = Math.floor(st.w / 2) - 30; x < Math.floor(st.w / 2) + 30; x++) {
    for (let y = 60; y < st.h - 60; y++) {
      if (st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
        g.player.x = x * 16 - g.player.w / 2;
        g.player.y = (y - 3) * 16 - g.player.h;
        break;
      }
    }
  }
  g.debugSpawnNpc(517, 1, false);
  const t = [...g.entities.enemies].reverse().find((n) => n.vanillaId === 517);
  // 玩家挪到塔底旁(塔盒 270 高;底 = t.y + t.h)
  if (t) {
    g.player.x = t.x + t.w + 30;
    g.player.y = t.y + t.h - g.player.h - 4;
  }
});
await new Promise((r) => setTimeout(r, 2500));
const st1 = await page.evaluate(() => {
  const g = window.__swGame;
  const t = [...g.entities.enemies].find((n) => n.vanillaId === 517 && !n.dead);
  if (!t) return { err: 'no tower' };
  const cam = g.camera;
  const c1 = cam.worldToScreen(t.x, t.y);
  const c2 = cam.worldToScreen(t.x + t.w, t.y + t.h);
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cv.getContext('2d');
  const s = (x, y) => ctx.getImageData(x, y, 1, 1).data;
  // halo 带:塔 bbox 外扩 14px 减去内部(仅左右带,顶带夹在屏内)
  const x0 = Math.max(0, Math.floor(c1[0]) - 14), y0 = Math.max(0, Math.floor(c1[1]) - 14);
  const x1 = Math.min(cv.width, Math.ceil(c2[0]) + 14), y1 = Math.min(cv.height, Math.ceil(c2[1]) + 14);
  const bw = x1 - x0, bh = y1 - y0;
  const d = ctx.getImageData(x0, y0, bw, bh).data;
  let maxIn = 0, maxBand = 0, cntBand = 0;
  const ix = Math.floor(c1[0]) - x0, ax = Math.ceil(c2[0]) - x0, iy = Math.floor(c1[1]) - y0, ay = Math.ceil(c2[1]) - y0;
  for (let yy = 0; yy < bh; yy++) {
    for (let xx = 0; xx < bw; xx++) {
      const i = (yy * bw + xx) * 4;
      const v = Math.max(d[i], d[i + 1], d[i + 2]);
      const inside = xx >= ix && xx <= ax && yy >= iy && yy <= ay;
      if (inside) { if (v > maxIn) maxIn = v; }
      else { if (v > maxBand) maxBand = v; if (v > 12) cntBand++; }
    }
  }
  const px = s(Math.floor((c1[0] + c2[0]) / 2), Math.floor((c1[1] + c2[1]) / 2));
  return { towerBox: { x: t.x, y: t.y, w: t.w, h: t.h }, screen: { c1, c2 }, canvas: { w: cv.width, h: cv.height },
    maxIn, maxBand, cntBand, centerPx: [...px],
    ai: { ai0: t.ai0, ai1: t.ai1, ai3: t.ai3 }, minions: [...g.entities.enemies].filter((n) => n.vanillaId === 519 && !n.dead).length,
    probe: { glowTower: window.__probe.glow.filter((v) => v === 517).length, glowAll: window.__probe.glow.length,
      shieldTower: window.__probe.shield.filter((c) => c.vid === 517).length } };
});
await page.screenshot({ path: '/tmp/tower2-night.png' });

// 护盾:置满盾再采一轮
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.lunarEvent.shield.solar = 100;
  g.world.lunarEvent.towerActive.solar = true;
});
await new Promise((r) => setTimeout(r, 800));
const st2 = await page.evaluate(() => {
  const g = window.__swGame;
  const t = [...g.entities.enemies].find((n) => n.vanillaId === 517 && !n.dead);
  if (!t) return { err: 'no tower2' };
  const cam = g.camera;
  const c1 = cam.worldToScreen(t.x, t.y);
  const c2 = cam.worldToScreen(t.x + t.w, t.y + t.h);
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cv.getContext('2d');
  const x0 = Math.max(0, Math.floor(c1[0]) - 40), y0 = Math.max(0, Math.floor(c1[1]) - 40);
  const x1 = Math.min(cv.width, Math.ceil(c2[0]) + 40), y1 = Math.min(cv.height, Math.ceil(c2[1]) + 40);
  const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let mx = 0, sum = 0, n = 0, cnt = 0;
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(d[i], d[i + 1], d[i + 2]); if (v > mx) mx = v; sum += v; n++; if (v > 12) cnt++; }
  return { shieldTowerCalls: window.__probe.shield.filter((c) => c.vid === 517).length, lastShield: window.__probe.shield.at(-1),
    maxCh: mx, avg: +(sum / n).toFixed(1), cntBright: cnt,
    screen: { c1, c2 } };
});
await page.screenshot({ path: '/tmp/tower2-night-shield.png' });
console.log(JSON.stringify({ st1, st2, pageErrors: errors.slice(0, 3) }, null, 1));
await browser.close();
