// ★BJ593 探针 0：血条矩形像素标定——黄蜂受损档 1/3 hp,条框 36×12 周边一圈 dump。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj593-hb-cal.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode, clearEnemies, freezeClock } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, {});
  await bootstrap(page, process.env.SW_ORIGIN);
  await createGame(page, { mode: 'direct', seed: 'bj593', size: 'small' });
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
    const dpr = window.devicePixelRatio || 1;
    const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))));
    const e = mod.Enemy.fromVanilla(176, p.cx + 70, surf * 16 - 90);
    g.entities.add(e, 'enemies');
    e.hurt(Math.floor(e.maxHp / 3), 0, 0, g);
    e.vx = 2.6; e.vy = 0;
    await nextFrame(); await nextFrame();
    const cam = g.camera;
    const z = cam.zoom * dpr;
    // 钉住敌人：本帧前写死位置（nextFrame 后立即读,敌可能已动 1-2px,标定容差够）
    e.x = p.cx + 70 - e.w / 2; e.y = surf * 16 - 90;
    await nextFrame();
    const bx = Math.round((640 * dpr) + (e.cx - 24 - cam.x) * z);
    const by = Math.round((400 * dpr) + (e.y + e.h + 10 - 6 - cam.y) * z);
    const W = Math.round(48 * z), H = Math.round(24 * z);
    const img = ctx.getImageData(bx, by, W, H);
    const d = img.data;
    const lines = [];
    for (let ry = 0; ry < H; ry++) {
      let row = '';
      for (let px = 0; px < W; px++) {
        const i = (ry * W + px) * 4;
        const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
        // 血条框世界 36×12 起 (6,6)（窗起点=cx-24, 条=cx-18; 窗起点=条顶-6,条=+10）
        const inBar = px >= 6 * z && px < 42 * z && ry >= 6 * z && ry < 18 * z;
        const cls = a < 40 ? '.' : (b > r + 20 && b > gg + 20 ? 'B' : (Math.abs(r - gg) < 16 && Math.abs(gg - b) < 16 ? (gg > 150 ? 'w' : 'g') : (r > gg + 20 ? 'r' : (gg >= r ? 'G' : 'y'))));
        row += inBar ? cls : cls.toLowerCase();
      }
      lines.push(row);
    }
    return { barRect: { x: e.cx - 18, y: e.y + e.h + 10 }, hp: e.hp, maxHp: e.maxHp, fill: Math.floor(36 * e.hp / e.maxHp), dpr, z, path: g.renderer.bglPathUsed, grid: lines };
  });
  console.log(JSON.stringify(result, null, 1));
} finally {
  await browser.close();
}
