// ★BJ593 探针 3：钉桩黄蜂血条判别——AI 影写 no-op,位置/速度钉死,仅脚本化
//   facing(±1)×visAngle(vx*0.1) 逐拍翻转（≙ 原版 sdir/rotation 逐拍重写）,
//   血条屏位恒定 → 采样窗零漂移。fillLeft/fillRight/行极差三判据 + 异常帧宽窗 dump。
//   × {acc 缺省, ?bglshim=0, ?bgl=0} 三管线（BJ584 站桩火妖无 rotate 支=执行器
//   rotate+mirror+restore 序列盲区,本探针补盲）。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj593-hb-pinned.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode, clearEnemies, freezeClock } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
try {
  for (const variant of [
    { name: 'acc-default', q: '' },
    { name: 'bglshim0', q: '?bglshim=0' },
    { name: 'bgl0', q: '?bgl=0' },
  ]) {
    const page = await openPage(browser, {});
    await bootstrap(page, process.env.SW_ORIGIN + variant.q);
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
      // AI 影写 no-op + 物理钉死
      e.swarmerAI = () => {};
      e.noGravity = true;
      g.entities.add(e, 'enemies');
      e.hurt(Math.floor(e.maxHp / 3), 0, 0, g);
      const px0 = p.cx + 70 - e.w / 2, py0 = surf * 16 - 90;
      await nextFrame();
      const expFill = Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp)));
      const rows = [];
      const dumps = [];
      for (let f = 0; f < 720; f++) {
        const sgn = (Math.floor(f / 20) % 2 === 0) ? 1 : -1;   // 每 20 帧 facing 翻转
        e.vx = sgn * 2.6; e.vy = 0;
        e.x = px0; e.y = py0;
        e.facing = sgn;                    // ≙ AI_005 sdir=vx>0?1:-1（AI 已 no-op,直写同相）
        e.visAngle = e.vx * 0.1;           // ≙ rotation=vx*0.1
        await nextFrame();
        e.x = px0; e.y = py0; e.vx = sgn * 2.6; e.vy = 0;
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
        const spread = rowLR.length ? Math.max(...rowLR.map((v) => v[1])) - Math.min(...rowLR.map((v) => v[1])) : -1;
        const rec = { f, facing: e.facing, fillL, fillR, spread };
        rows.push(rec);
        const bad = fillL > 4 * dpr + 2 || spread > 2 * dpr + 1 || (fillR >= 0 && Math.abs(fillR - expFill) > 2 * dpr + 1);
        if (bad && dumps.length < 3) {
          const wide = ctx.getImageData(bx - 14 * z, by - 6 * z, Math.round(64 * z), Math.round(24 * z));
          const wd = wide.data, WW = wide.width, WH = wide.height;
          const grid = [];
          for (let ry = 0; ry < WH; ry++) {
            let row = '';
            for (let px = 0; px < WW; px++) {
              const i = (ry * WW + px) * 4;
              const r = wd[i], gg = wd[i + 1], b = wd[i + 2], a = wd[i + 3];
              const inBar = px >= 14 * z && px < 50 * z && ry >= 6 * z && ry < 18 * z;
              let cls;
              if (a < 40) cls = '.';
              else if (isFill(r, gg, b)) cls = '#';
              else if (b < 40 && r + gg < 100) cls = ':';
              else if (b > gg + 20 && b > r + 20) cls = 'B';
              else cls = '?';
              row += inBar ? cls : cls.toLowerCase();
            }
            grid.push(row);
          }
          dumps.push({ ...rec, expFill, grid });
        }
      }
      let mirror = 0, tilt = 0, bjump = 0, prevR = null;
      for (const r of rows) {
        if (r.fillL > 4 * dpr + 2) mirror++;
        if (r.spread > 2 * dpr + 1) tilt++;
        if (prevR !== null && r.fillR >= 0 && Math.abs(r.fillR - prevR) > 2 * dpr + 1) bjump++;
        if (r.fillR >= 0) prevR = r.fillR;
      }
      return { path: g.renderer.bglPathUsed, acc: g.renderer._accMode, dpr, expFill,
        frames: rows.length, mirror, tilt, bjump, dumps,
        tail: rows.slice(-4) };
    });
    console.log(`=== ${variant.name} ===`);
    console.log(JSON.stringify(result));
    page.close?.();
  }
} finally {
  await browser.close();
}
