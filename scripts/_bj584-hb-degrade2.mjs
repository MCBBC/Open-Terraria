// ★BJ584 探针 11：净室 × executor 级强制降级（bound.drawImage 包一刀 ensureBridged）。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj584-hb-degrade2.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode, clearEnemies, freezeClock } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, {});
  await bootstrap(page, process.env.SW_ORIGIN);
  await createGame(page, { mode: 'direct', seed: 'bj584', size: 'small' });
  await godMode(page, true);
  await clearEnemies(page);
  await freezeClock(page, { tod: 0.45 });

  const result = await page.evaluate(async () => {
    const g = window.__swGame;
    const r = g.renderer;
    const mod = await import('/src/entities/Enemy.ts');
    const p = g.player;
    const ptx = Math.floor(p.cx / 16);
    let surf = 0;
    for (let y = 1; y < g.world.store.h; y++) { if (g.world.store.isSolid(ptx, y)) { surf = y; break; } }
    let cv = null;
    document.querySelectorAll('canvas').forEach((c) => { if (c.width >= 1000 && c.getContext('2d')) cv = c; });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
    const e = mod.Enemy.fromVanilla(24, p.cx + 80, surf * 16 - 46);
    g.entities.add(e, 'enemies');
    e.hurt(20, 0, 0, g);
    e.ai0 = 1;
    await nextFrame();
    // executor 级降级注入：每 N 帧在窗口首笔 drawImage 前触发 ensureBridged
    const sh = r.bglEntShim;
    if (!sh) return { err: 'no shim' };
    const orig = sh.bound.drawImage;
    let armedEvery = 30;   // 每 30 帧降级一帧
    let countdown = 10;
    sh.bound.drawImage = function (...a) {
      if (countdown-- <= 0 && armedEvery > 0) {
        countdown = armedEvery;
        try {
          sh.noteDegradeTrigger('inj:bj584');
          sh.ensureBridged();
        } catch (err) { /* ignore */ }
      }
      return orig.apply(this, a);
    };
    const rows = [];
    let side = 1, degradeFrames = 0;
    for (let f = 0; f < 480; f++) {
      if (f % 40 === 0) { side = -side; p.x = e.cx + side * 80 - p.w / 2; p.y = e.y; }
      await nextFrame();
      const deg = String(r.bglPathUsed).includes('degraded');
      if (deg) degradeFrames++;
      const cam = g.camera;
      const barLeftPx = Math.round(640 + (e.cx - 18 - cam.x));
      const barMidY = Math.round(400 + (e.y + e.h + 10 + 0 + 6 - cam.y));
      const img = ctx.getImageData(barLeftPx, barMidY, 36, 1);
      const d = img.data;
      let fl = -1, fr = -1;
      for (let px = 0; px < 36; px++) {
        const i = px * 4;
        if (d[i + 1] > 70 && d[i + 1] > d[i] + 18 && d[i + 1] > d[i + 2] + 18) { if (fl < 0) fl = px; fr = px; }
      }
      rows.push({ f, facing: e.facing, deg, fl, fr, expFill: Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp))) });
    }
    return { rows, degradeFrames };
  });
  if (result.err) { console.log('ERR', result.err); process.exit(0); }
  console.log('degradeFrames=', result.degradeFrames);
  let mirror = 0, mirrorDeg = 0, degTotal = 0, flips = 0, prevF = null;
  const seq = [];
  for (const r of result.rows) {
    if (r.facing !== prevF) { if (prevF !== null) flips++; prevF = r.facing; }
    if (r.deg) degTotal++;
    const m = r.fl > 6;
    if (m) { mirror++; if (r.deg) mirrorDeg++; }
    seq.push((r.facing > 0 ? 'R' : 'L') + (r.deg ? 'D' : 'd') + (r.fl < 0 ? '?' : m ? 'M' : '.'));
  }
  console.log(`flips=${flips} mirror=${mirror} (inDegraded=${mirrorDeg}) degraded=${degTotal}/480`);
  console.log(seq.join('').replace(/(.{96})/g, '$1\n'));
  const bad = result.rows.filter((r) => r.fl > 6).slice(0, 6);
  console.log('mirror samples:', JSON.stringify(bad));
} finally {
  await browser.close();
}
