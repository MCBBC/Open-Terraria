// ★BJ584 探针 13：三型钉位净室——史莱姆/地狱蝠/恶魔钉死位置，玩家左右横跳翻向，
// 血条逐帧量填充左沿（钉位=零滞后）。判据 relL>6 = 镜像发作。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj584-hb-pinned.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode, clearEnemies, freezeClock } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, {});
  await bootstrap(page, process.env.SW_ORIGIN);
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
    document.querySelectorAll('canvas').forEach((c) => { if (c.width >= 1000 && c.getContext('2d')) cv = c; });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const HB_ADD = { 59: 0, 60: 10, 62: 14 };
    const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
    const out = {};
    for (const id of VIDS) {
      const PINX = p.cx + 80, PINY = surf * 16 - (id === 62 ? 60 : 30);
      const e = mod.Enemy.fromVanilla(id, PINX, PINY);
      if (!e) { out[id] = { err: 'spawn fail' }; continue; }
      g.entities.add(e, 'enemies');
      e.hurt(Math.floor(e.maxHp / 3), 0, 0, g);
      e.ai0 = 1;
      await nextFrame();
      const rows = [];
      let side = 1;
      for (let f = 0; f < 360; f++) {
        // 钉位（渲染前每帧执行;AI 位移归零）
        e.x = PINX - e.w / 2; e.y = PINY - e.h / 2; e.vx = 0; e.vy = 0;
        if (f % 40 === 0) { side = -side; p.x = PINX + side * 90 - p.w / 2; p.y = PINY - 20; }
        await nextFrame();
        const cam = g.camera;
        const barLeftPx = Math.round(640 + (PINX - 18 - cam.x));
        const barMidY = Math.round(400 + (PINY + e.h / 2 + 10 + (HB_ADD[id] ?? 0) + 6 - cam.y));
        const img = ctx.getImageData(barLeftPx, barMidY, 36, 1);
        const d = img.data;
        let fl = -1, fr = -1;
        for (let px = 0; px < 36; px++) {
          const i = px * 4;
          if (d[i + 1] > 70 && d[i + 1] > d[i] + 18 && d[i + 1] > d[i + 2] + 18) { if (fl < 0) fl = px; fr = px; }
        }
        rows.push({ f, facing: e.facing, fl, fr, expFill: Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp))) });
      }
      out[id] = rows;
      e.dead = true;
      for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
    }
    return out;
  }, [59, 60, 62]);

  for (const [id, rows] of Object.entries(result)) {
    if (!Array.isArray(rows)) { console.log(id, JSON.stringify(rows)); continue; }
    let mirror = 0, flips = 0, prevF = null, noBar = 0;
    const seq = [];
    for (const r of rows) {
      if (r.facing !== prevF) { if (prevF !== null) flips++; prevF = r.facing; }
      if (r.fl < 0) { noBar++; seq.push('?'); continue; }
      const m = r.fl > 6;
      if (m) mirror++;
      seq.push((r.facing > 0 ? 'R' : 'L') + (m ? 'M' : '.'));
    }
    console.log(`vid ${id}: facingFlips=${flips} mirrorFrames=${mirror}/360 noBar=${noBar}`);
    console.log('  ' + seq.join('').replace(/(.{90})/g, '$1\n  '));
    const bad = rows.filter((r) => r.fl > 6).slice(0, 3);
    if (bad.length) console.log('  mirror:', JSON.stringify(bad));
    const ok = rows.find((r) => r.fl >= 0);
    if (ok) console.log('  normal sample:', JSON.stringify(ok));
  }
} finally {
  await browser.close();
}
