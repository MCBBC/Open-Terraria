// ★BJ584 A/B：同一镜像判定探针 × {缺省, ?bglshim=0, ?bgl=0} 三管线面。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj584-hb-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode, clearEnemies, freezeClock } from '../tools/probe/lib/index.mjs';

async function runVariant(browser, query, vids = [24, 59, 60, 62]) {
  const page = await openPage(browser, {});
  await bootstrap(page, process.env.SW_ORIGIN + query);
  await createGame(page, { mode: 'direct', seed: 'bj584', size: 'small' });
  await godMode(page, true);
  await clearEnemies(page);
  await freezeClock(page, { tod: 0.45 });
  const result = await page.evaluate(async (VIDS) => {
    const g = window.__swGame;
    const mod = await import('/src/entities/Enemy.ts');
    const p = g.player;
    const ptx = Math.floor(p.cx / 16);
    let surf = 0;
    for (let y = 1; y < g.world.store.h; y++) { if (g.world.store.isSolid(ptx, y)) { surf = y; break; } }
    let cv = null;
    document.querySelectorAll('canvas').forEach((c) => {
      if (c.width >= 1000 && c.getContext('2d')) cv = c;
    });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const dpr = window.devicePixelRatio || 1;
    const HB_ADD = { 24: 0, 59: 0, 60: 10, 62: 14 };
    const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
    const out = { path: g.renderer.bglPathUsed, acc: g.renderer._accMode, per: {} };
    for (const id of VIDS) {
      const e = mod.Enemy.fromVanilla(id, p.cx + 60, surf * 16 - 30);
      if (!e) { out.per[id] = { err: 'spawn fail' }; continue; }
      g.entities.add(e, 'enemies');
      e.hurt(Math.floor(e.maxHp / 3), 0, 0, g);
      await nextFrame();
      const rows = [];
      for (let f = 0; f < 240; f++) {
        await nextFrame();
        const cam = g.camera;
        const z = cam.zoom * dpr;
        const barLeftPx = Math.round(640 * dpr + (e.cx - 18 - cam.x) * z);
        const barMidY = Math.round(400 * dpr + (e.y + e.h + 10 + (HB_ADD[id] ?? 0) + 6 - cam.y) * z);
        const W = Math.round(36 * z);
        const img = ctx.getImageData(barLeftPx, barMidY - Math.round(3 * z), W, Math.round(7 * z));
        const d = img.data;
        let fl = -1, fr = -1;
        for (let px = 0; px < W; px++) {
          for (let py = 0; py < Math.round(7 * z); py++) {
            const i = (py * W + px) * 4;
            if (d[i + 1] > 70 && d[i + 1] > d[i] + 18 && d[i + 1] > d[i + 2] + 18) { if (fl < 0) fl = px; fr = px; break; }
          }
        }
        rows.push({ facing: e.facing, fl, fr, expFill: Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp))) });
      }
      out.per[id] = rows;
      e.dead = true;
      for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
    }
    return out;
  }, vids);
  await page.close();
  // 分析
  const summary = { path: result.path, acc: result.acc };
  for (const [id, rows] of Object.entries(result.per)) {
    if (!Array.isArray(rows)) { summary[id] = rows; continue; }
    let mirror = 0, mirrorWhileL = 0, mirrorWhileR = 0, flips = 0, prevF = null, noBar = 0;
    for (const r of rows) {
      if (r.facing !== prevF) { if (prevF !== null) flips++; prevF = r.facing; }
      if (r.fl < 0) { noBar++; continue; }
      if (r.fl > 6) { mirror++; if (r.facing < 0) mirrorWhileL++; else mirrorWhileR++; }
    }
    summary[id] = `mirror=${mirror}/240 (L=${mirrorWhileL},R=${mirrorWhileR}) flips=${flips} noBar=${noBar}`;
  }
  return summary;
}

const browser = await launchBrowser({});
try {
  console.log('DEFAULT  ', JSON.stringify(await runVariant(browser, '')));
  console.log('BGLSHIM=0', JSON.stringify(await runVariant(browser, '?bglshim=0')));
  console.log('BGL=0    ', JSON.stringify(await runVariant(browser, '?bgl=0&bglshim=0')));
} finally {
  await browser.close();
}
