// ★BJ593 探针 2：异常帧连续窗采样——判别残影双像/池别名/遮蔽三假说。
//   异常帧前后各 2 帧 + 本帧,窗 64×24（条框 36×12 + 前后余量）,记录敌 cx/cy/vx 逐帧。
//   判读:fragment 随敌同移=残影(前帧未清);fragment 定于条内=池/GL 别名;异形大块=遮蔽。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj593-hb-burst.mjs
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
    g.entities.add(e, 'enemies');
    e.hurt(Math.floor(e.maxHp / 3), 0, 0, g);
    await nextFrame();
    const expFill = Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp)));
    // 逐帧连续采样 1200 帧（一次 spawn,更长窗口提高异常命中）
    const hist = [];   // {f,cx,cy,vx,fillL,fillR,spread}
    let anomalies = [];
    for (let f = 0; f < 1200; f++) {
      if (f % 24 === 0) e.vx = (Math.floor(f / 24) % 2 === 0) ? 2.6 : -2.6;
      await nextFrame();
      const cam = g.camera;
      const z = cam.zoom * dpr;
      const bwX = e.cx - 18, bwY = e.y + e.h + 10;
      const bx = Math.round((640 * dpr) + (bwX - cam.x) * z);
      const by = Math.round((400 * dpr) + (bwY - cam.y) * z);
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
      const rec = { f, cx: Math.round(e.cx * 10) / 10, cy: Math.round(e.cy * 10) / 10,
        vx: Math.round(e.vx * 100) / 100, fillL, fillR, spread };
      hist.push(rec);
      if ((fillL > 4 * dpr + 2 || spread > 2 * dpr + 1 || (fillR >= 0 && Math.abs(fillR - expFill) > 2 * dpr + 1))) {
        anomalies.push(f);
      }
    }
    // 取前 3 个异常,各回溯前 2 帧+后 2 帧做 64×24 网格 dump（锚当帧敌位）
    const dumps = [];
    for (const af of anomalies.slice(0, 3)) {
      const rec = hist[af];
      const cam = g.camera;   // 相机可能已动——回放 dump 只能锚当帧;改:异常时即时 dump?
      // 注:hist 只存标量;网格需现场读。改为第二遍:重跑并现场 dump 异常帧窗口。
      dumps.push(rec);
    }
    // 第二遍：重 spawn 同款,现场 dump 前 4 个异常帧的 64×24 网格
    g.entities.remove?.(e) || (e.dead = true);
    await nextFrame();
    const e2 = mod.Enemy.fromVanilla(176, p.cx + 70, surf * 16 - 90);
    g.entities.add(e2, 'enemies');
    e2.hurt(Math.floor(e2.maxHp / 3), 0, 0, g);
    await nextFrame();
    const out2 = [];
    let cnt2 = 0;
    for (let f = 0; f < 1200 && cnt2 < 4; f++) {
      if (f % 24 === 0) e2.vx = (Math.floor(f / 24) % 2 === 0) ? 2.6 : -2.6;
      await nextFrame();
      const cam = g.camera;
      const z = cam.zoom * dpr;
      const bwX = e2.cx - 18, bwY = e2.y + e2.h + 10;
      const bx = Math.round((640 * dpr) + (bwX - 14 - cam.x) * z);
      const by = Math.round((400 * dpr) + (bwY - 6 - cam.y) * z);
      const img = ctx.getImageData(bx, by, Math.round(64 * z), Math.round(24 * z));
      const d = img.data;
      const W = img.width, H = img.height;
      const rowLR = [];
      // 条内判定按 64 窗:条起点 = 窗 px 14
      for (let ry = 0; ry < H; ry++) {
        let l = -1, rr = -1, cnt = 0;
        for (let px = 14 * z; px < 50 * z; px++) {
          const i = (ry * W + px) * 4;
          if (isFill(d[i], d[i + 1], d[i + 2])) { cnt++; if (l < 0) l = px; rr = px; }
        }
        if (ry >= 1 && ry <= 10 && cnt >= 6) rowLR.push([l - 14, rr - 14]);
      }
      const med = (arr, k) => arr.length ? arr.map((v) => v[k]).sort((a, b) => a - b)[Math.floor(arr.length / 2)] : -1;
      const fillL = med(rowLR, 0), fillR = med(rowLR, 1);
      const spread = rowLR.length ? Math.max(...rowLR.map((v) => v[1])) - Math.min(...rowLR.map((v) => v[1])) : -1;
      const bad = fillL > 4 * dpr + 2 || spread > 2 * dpr + 1 || (fillR >= 0 && Math.abs(fillR - 25) > 2 * dpr + 1);
      if (bad) {
        cnt2++;
        const grid = [];
        for (let ry = 0; ry < H; ry++) {
          let row = '';
          for (let px = 0; px < W; px++) {
            const i = (ry * W + px) * 4;
            const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
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
        out2.push({ f, cx: Math.round(e2.cx * 10) / 10, cy: Math.round(e2.cy * 10) / 10,
          vx: Math.round(e2.vx * 100) / 10, fillL, fillR, spread, grid });
      }
    }
    return { expFill, anomalyCount: anomalies.length, firstAnomalies: anomalies.slice(0, 12),
      firstRecs: dumps, burstDumps: out2, path: g.renderer.bglPathUsed };
  });
  console.log(JSON.stringify(result, null, 1));
} finally {
  await browser.close();
}
