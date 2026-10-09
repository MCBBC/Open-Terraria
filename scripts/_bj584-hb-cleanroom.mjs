// ★BJ584 探针 9（净室）：火妖（caster,站桩 vx≈0）+ 玩家左右横跳 → facing 翻转，
// 血条逐帧量填充左沿（读回滞后≈0）。镜像发作判据 relL>6。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj584-hb-cleanroom.mjs
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
    const mod = await import('/src/entities/Enemy.ts');
    const p = g.player;
    const ptx = Math.floor(p.cx / 16);
    let surf = 0;
    for (let y = 1; y < g.world.store.h; y++) { if (g.world.store.isSolid(ptx, y)) { surf = y; break; } }
    let cv = null;
    document.querySelectorAll('canvas').forEach((c) => { if (c.width >= 1000 && c.getContext('2d')) cv = c; });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
    // 火妖站桩：玩家右侧 80px（平地）
    const e = mod.Enemy.fromVanilla(24, p.cx + 80, surf * 16 - 46);
    g.entities.add(e, 'enemies');
    e.hurt(20, 0, 0, g);
    e.ai0 = 1;   // 重置传送计时（650 才传送,实验窗 <600 帧安全）
    await nextFrame();
    const rows = [];
    let side = 1;
    for (let f = 0; f < 480; f++) {
      // 每 40 帧把玩家传到火妖另一侧 → TargetClosest 翻向
      if (f % 40 === 0) { side = -side; p.x = e.cx + side * 80 - p.w / 2; p.y = e.y; }
      await nextFrame();
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
      rows.push({ f, facing: e.facing, vx: Math.round(e.vx * 100) / 100, x: Math.round(e.x), hp: e.hp, fl, fr,
        expFill: Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp))) });
    }
    return rows;
  });
  let mirror = 0, flips = 0, prevF = null;
  const seq = [];
  for (const r of result) {
    if (r.facing !== prevF) { if (prevF !== null) flips++; prevF = r.facing; }
    const m = r.fl > 6;
    if (m) mirror++;
    seq.push((r.facing > 0 ? 'R' : 'L') + (r.fl < 0 ? '?' : m ? 'M' : '.'));
  }
  console.log(`facingFlips=${flips} mirrorFrames=${mirror}/480`);
  console.log(seq.join('').replace(/(.{96})/g, '$1\n'));
  const bad = result.filter((r) => r.fl > 6).slice(0, 5);
  console.log('mirror samples:', JSON.stringify(bad));
  const good = result.filter((r) => r.fl >= 0 && r.fl <= 6).slice(0, 3);
  console.log('normal samples:', JSON.stringify(good));
} finally {
  await browser.close();
}
