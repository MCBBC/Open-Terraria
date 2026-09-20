// BJ-chest-sparkle 探针 v2：加活性诊断（tickCount 推进/暂停态/粒子活跃数/光照延迟）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/tmp/chest-sparkle';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1024, height: 640 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5256') + '/?play=small&tp=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const TBK = g.tileByKey;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  let gy = py;
  for (; gy < py + 60; gy++) { const d = g.TILE_DEFS?.[st.type[st.idx(px, gy)]]; if (d?.solid) break; }
  const groundY = gy;
  const baseY = groundY - 1;
  for (let x = px - 24; x <= px + 24; x++) for (let y = baseY - 12; y <= baseY; y++) st.setTile(x, y, 0);
  for (let x = px - 24; x <= px + 24; x++) st.setTile(x, groundY, TBK['dirt'] ?? 1, 0, 0);
  const put = (x, y, id, fx, fy) => st.setTile(x, y, id, fx, fy);
  const chest = TBK['chest'];
  const ore = TBK['ore_gold'];
  const torch = TBK['torch'];
  const ax = px - 6, bx = px + 6, ox = px - 14;
  put(ax, baseY - 1, chest, 36, 0); put(ax + 1, baseY - 1, chest, 54, 0);
  put(ax, baseY, chest, 36, 18); put(ax + 1, baseY, chest, 54, 18);
  put(bx, baseY - 1, chest, 0, 0); put(bx + 1, baseY - 1, chest, 18, 0);
  put(bx, baseY, chest, 0, 18); put(bx + 1, baseY, chest, 18, 18);
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) put(ox + dx, baseY - 1 + dy, ore, 0, 0);
  put(ax + 3, baseY, torch, 0, 0);
  put(bx - 3, baseY, torch, 0, 0);
  // 玩家挪到布景中间，防相机跟人跑丢
  g.player.x = (px) * 16; g.player.y = (groundY - 3) * 16;
  g.player.vy = 0;
  g.camera.x = px * 16; g.camera.y = (baseY - 3) * 16;
  const vd = g.vanillaDust;
  const orig = vd.spawn.bind(vd);
  window.__sparkLog = { counts: {}, spawns: [] };
  vd.spawn = function (...a) {
    const type = a[4];
    window.__sparkLog.counts[type] = (window.__sparkLog.counts[type] ?? 0) + 1;
    if (type === 43) window.__sparkLog.spawns.push({ x: a[0], y: a[1] });
    return orig(...a);
  };
  window.__sparkSetup = { ax, bx, ox, baseY, groundY };
  return { ax, bx, ox, baseY, groundY, chestId: chest, oreId: ore,
    paused: g.paused ?? null, tick: g.tickCount };
});
console.log('SETUP', JSON.stringify(setup));
await new Promise((r) => setTimeout(r, 3000));

// 活性 + 光照延迟快照
const live1 = await page.evaluate(() => {
  const g = window.__swGame;
  const S = window.__sparkSetup;
  let activeDust = 0;
  for (const d of g.vanillaDust.pool) if (d.active) activeDust++;
  return {
    tick: g.tickCount, paused: g.paused ?? null,
    particles: g.particles.length, activeDust,
    lightA: g.lighting.lightAt(S.ax, S.baseY - 1),
    lightB: g.lighting.lightAt(S.bx, S.baseY - 1),
    lightOre: g.lighting.lightAt(S.ox, S.baseY - 1),
    lightTorch: g.lighting.lightAt(S.ax + 3, S.baseY),
    cam: { x: g.camera.x, y: g.camera.y }, player: { x: g.player.x, y: g.player.y },
  };
});
console.log('LIVE1', JSON.stringify(live1));

// 采样 24s
const samples = [];
for (let s = 0; s < 6; s++) {
  await new Promise((r) => setTimeout(r, 4000));
  const snap = await page.evaluate(() => {
    const log = window.__sparkLog;
    const g = window.__swGame;
    let activeDust = 0;
    for (const d of g.vanillaDust.pool) if (d.active) activeDust++;
    return { counts: { ...log.counts }, n43: log.spawns.length, tick: g.tickCount, activeDust };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  samples.push({ t: (s + 1) * 4, ...snap });
}
const attribution = await page.evaluate(() => {
  const log = window.__sparkLog;
  const S = window.__sparkSetup;
  const zones = { chestGold: { cx: S.ax * 16 + 16 }, chestWood: { cx: S.bx * 16 + 16 }, ore: { cx: S.ox * 16 + 8 } };
  const out = { chestGold: 0, chestWood: 0, ore: 0, other: 0 };
  for (const s of log.spawns) {
    const dxs = [
      ['chestGold', Math.abs(s.x - zones.chestGold.cx)],
      ['chestWood', Math.abs(s.x - zones.chestWood.cx)],
      ['ore', Math.abs(s.x - zones.ore.cx)],
    ].sort((a, b) => a[1] - b[1]);
    if (dxs[0][1] <= 24) out[dxs[0][0]]++;
    else out.other++;
  }
  return out;
});
console.log('SAMPLES', JSON.stringify(samples));
console.log('ATTRIBUTION', JSON.stringify(attribution));

const fs = await import('node:fs');
fs.mkdirSync(OUT, { recursive: true });
for (let i = 0; i < 8; i++) {
  await page.screenshot({ path: `${OUT}/frame-${i}.png` });
  await new Promise((r) => setTimeout(r, 300));
}
const active43 = await page.evaluate(() => {
  const g = window.__swGame;
  const live = [];
  for (const d of g.vanillaDust.pool) if (d.active && d.type === 43) live.push({ x: Math.round(d.x), y: Math.round(d.y), scale: d.scale, alpha: d.alpha });
  return live;
});
console.log('ACTIVE43', JSON.stringify(active43));
console.log('ERRORS', JSON.stringify(errors.slice(0, 3)));
await browser.close();
