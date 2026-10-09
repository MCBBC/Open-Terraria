// ★BJ584 探针（v5）：血条镜像判定——窗口限死条框 36px 内,逐帧量填充左沿。
// 镜像发作判据:填充左沿 relL > 6（原版填充恒贴左沿,帽/量化容差 ≤3px）。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=500000 scripts/_bj584-hb-mirror-probe.mjs
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
    document.querySelectorAll('canvas').forEach((c) => {
      if (c.width >= 1000 && c.getContext('2d')) cv = c;
    });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const dpr = window.devicePixelRatio || 1;
    const HB_ADD = { 24: 0, 59: 0, 60: 10, 62: 14 };
    const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
    const out = {};
    for (const id of VIDS) {
      const e = mod.Enemy.fromVanilla(id, p.cx + 60, surf * 16 - 30);
      if (!e) { out[id] = { err: 'spawn fail' }; continue; }
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
        // 每列:F=有亮绿 B=全暗
        const colF = new Array(W).fill(false);
        for (let px = 0; px < W; px++) {
          for (let py = 0; py < Math.round(7 * z); py++) {
            const i = (py * W + px) * 4;
            const r8 = d[i], g8 = d[i + 1], b8 = d[i + 2];
            if (g8 > 70 && g8 > r8 + 18 && g8 > b8 + 18) { colF[px] = true; break; }
          }
        }
        let fl = -1, fr = -1;
        for (let px = 0; px < W; px++) if (colF[px]) { if (fl < 0) fl = px; fr = px; }
        const expFill = Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp)));
        rows.push({ f, facing: e.facing, hp: e.hp, fl, fr, expFill, W });
      }
      out[id] = rows;
      e.dead = true;
      for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
    }
    return out;
  }, [24, 59, 60, 62]);

  for (const [id, rows] of Object.entries(result)) {
    if (!Array.isArray(rows)) { console.log(id, JSON.stringify(rows)); continue; }
    let flips = 0, mirrorFrames = 0, prevF = null, noBar = 0;
    const seq = [];
    for (const r of rows) {
      if (r.facing !== prevF) { if (prevF !== null) flips++; prevF = r.facing; }
      if (r.fl < 0) { noBar++; seq.push('?'); continue; }
      // 镜像发作:填充左沿离条框左沿 >6px（原版恒 ≤3px:cap 2px+取整 1px）
      if (r.fl > 6) { mirrorFrames++; seq.push('M'); }
      else seq.push('.');
    }
    console.log(`vid ${id}: facingFlips=${flips} mirrorFrames=${mirrorFrames} noBarFrames=${noBar}/240`);
    console.log('  ' + seq.join('').replace(/(.{80})/g, '$1\n  '));
    const bad = rows.find((r) => r.fl > 6);
    if (bad) console.log('  first mirror frame:', JSON.stringify(bad));
  }
} finally {
  await browser.close();
}
