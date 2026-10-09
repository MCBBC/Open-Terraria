// ★BJ593 探针 5（判别面）：大型敌怪压条场景（≙ 用户蜂群重叠/后绘实体盖条）——
//   僵尸 3 钉在苔藓黄蜂 176 血条矩形上（y 序更大=后绘）。修前=僵尸精灵盖条
//   （fillL=-1/断片）;修后=血条 pass 恒最上（原版 Interface_14 语义）→ 填充完整。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj593-hb-occluder.mjs
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
    const isFill = (r, gg, b) => b < 40 && r + gg > 180;
    const e = mod.Enemy.fromVanilla(176, p.cx + 70, surf * 16 - 90);
    e.swarmerAI = () => {};
    e.noGravity = true;
    g.entities.add(e, 'enemies');
    e.hurt(Math.floor(e.maxHp / 3), 0, 0, g);
    const px0 = p.cx + 70 - e.w / 2, py0 = surf * 16 - 90;
    // 大型压条怪：僵尸 3（盒大）钉在血条矩形上（y 中心比黄蜂大 → y 序后绘）
    const zomb = mod.Enemy.fromVanilla(3, px0 + 18, py0 + e.h + 4);
    if (!zomb) return { err: 'zombie spawn fail' };
    zomb.ai0 = 0;
    g.entities.add(zomb, 'enemies');
    await nextFrame();
    const expFill = Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp)));
    const zx0 = px0 + 18 - zomb.w / 2, zy0 = py0 + e.h + 4 - zomb.h / 2;
    const rows = [];
    let grid = null;
    for (let f = 0; f < 240; f++) {
      e.x = px0; e.y = py0; e.vx = 0; e.vy = 0;
      zomb.x = zx0; zomb.y = zy0; zomb.vx = 0; zomb.vy = 0;
      await nextFrame();
      e.x = px0; e.y = py0;
      zomb.x = zx0; zomb.y = zy0;
      const cam = g.camera;
      const z = cam.zoom * dpr;
      const bx = Math.round((640 * dpr) + (e.cx - 18 - cam.x) * z);
      const by = Math.round((400 * dpr) + (e.y + e.h + 10 - cam.y) * z);
      const img = ctx.getImageData(bx, by, Math.round(36 * z), Math.round(12 * z));
      const d = img.data;
      const W = img.width, H = img.height;
      const rowLR = [];
      for (let ry = 1; ry < H - 1; ry++) {
        let l = -1, rr = -1, cnt = 0;
        for (let px = 0; px < W; px++) {
          const i = (ry * W + px) * 4;
          if (isFill(d[i], d[i + 1], d[i + 2])) { cnt++; if (l < 0) l = px; rr = px; }
        }
        if (cnt >= 6) rowLR.push([l, rr]);
      }
      const med = (arr, k) => arr.length ? arr.map((v) => v[k]).sort((a, b) => a - b)[Math.floor(arr.length / 2)] : -1;
      const fillL = med(rowLR, 0), fillR = med(rowLR, 1);
      rows.push({ f, fillL, fillR });
      if (f === 120) {
        const wide = ctx.getImageData(bx - 8 * z, by - 4 * z, Math.round(52 * z), Math.round(20 * z));
        const wd = wide.data, WW = wide.width, WH = wide.height;
        const gridRows = [];
        for (let ry = 0; ry < WH; ry++) {
          let row = '';
          for (let px = 0; px < WW; px++) {
            const i = (ry * WW + px) * 4;
            const r = wd[i], gg = wd[i + 1], b = wd[i + 2], a = wd[i + 3];
            const inBar = px >= 8 * z && px < 44 * z && ry >= 4 * z && ry < 16 * z;
            let cls;
            if (a < 40) cls = '.';
            else if (isFill(r, gg, b)) cls = '#';
            else if (b < 40 && r + gg < 100) cls = ':';
            else cls = '?';
            row += inBar ? cls : cls.toLowerCase();
          }
          gridRows.push(row);
        }
        grid = gridRows;
      }
    }
    const ok = rows.filter((r) => r.fillL >= 0 && r.fillL <= 4 * dpr + 2 && Math.abs(r.fillR - expFill) <= 2 * dpr + 1).length;
    return { expFill, frames: rows.length, okFrames: ok,
      broken: rows.filter((r) => !(r.fillL >= 0 && r.fillL <= 4 * dpr + 2 && Math.abs(r.fillR - expFill) <= 2 * dpr + 1)).length,
      tail: rows.slice(-3), grid, path: g.renderer.bglPathUsed };
  });
  console.log(JSON.stringify(result, null, 1));
} finally {
  await browser.close();
}
