// 微型轨迹:血月置位后逐帧 waterStyle/wsDelay/bloodMoon 轨迹
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5233';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.evaluate(() => {
  const g = window.__swGame;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const st = g.world.store;
  const sx = g.world.shimmerX, sy = g.world.shimmerY;
  let bot = sy;
  for (let y = sy; y < sy + 120; y++) {
    let has = false;
    for (let x = sx - 60; x <= sx + 60; x++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && (st.liquidType[i] || 1) === 4) { has = true; break; }
    }
    if (has) bot = y;
  }
  let surf = sy;
  for (let y = sy - 60; y <= bot; y++) {
    const i = st.idx(sx, y);
    if (st.liquid[i] > 0 && (st.liquidType[i] || 1) === 4) { surf = y; break; }
  }
  // 无条件火把阵(液体格也放;sim 暂停)
  const torch = window.__swTiles?.['torch'] ?? 4;
  for (let y = surf - 4; y <= bot + 1; y += 4) {
    for (let x = sx - 30; x <= sx + 30; x += 10) st.setTileSilent(x, y, torch, 0, 0);
  }
  g.player.x = sx * 16; g.player.y = (surf + 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
});
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.9 });
await page.evaluate(() => window.__drive(20));
console.log('预热态:', JSON.stringify(await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return { ws: r.waterStyle, d: r.wsDelay, bm: window.__swGame.world.clock.bloodMoon, day: window.__swGame.world.clock.isDay };
})));
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = true; });
const traj = await page.evaluate(() => {
  const out = [];
  for (let f = 0; f < 70; f++) {
    window.__drive(1);
    const r = window.__swGame.renderer;
    out.push([f, r.waterStyle, r.wsDelay, window.__swGame.world.clock.bloodMoon ? 1 : 0, window.__swGame.world.clock.isDay ? 1 : 0]);
  }
  return out;
});
for (const [f, ws, d, bm, day] of traj) if (f % 3 === 0 || (f > 0 && traj[f - 1] && (traj[f - 1][1] !== ws)) || f === 69) console.log(`f${f} ws=${ws} delay=${d} bm=${bm} day=${day}`);
process.exit(0);
