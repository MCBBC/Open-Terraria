// ★BJ593 探针 4：钉桩黄蜂×深空背景——排除丛林藤/水波/环境粒子假阳。
//   背景纯天蓝色（isFill 对蓝零假阳）,异常像素=确凿覆盖物。白色类单独计数。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=590000 scripts/_bj593-hb-sky.mjs
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
    const skyX = p.cx + 70, skyY = 8 * 16;
    p.x = skyX - p.w / 2; p.y = skyY - p.h / 2; p.vy = 0;
    const e = mod.Enemy.fromVanilla(176, skyX, skyY);   // y=128 深空（玩家同层）
    e.swarmerAI = () => {};
    e.noGravity = true;
    g.entities.add(e, 'enemies');
    e.hurt(Math.floor(e.maxHp / 3), 0, 0, g);
    const px0 = skyX - e.w / 2, py0 = skyY - e.h / 2;
    await nextFrame();
    function nextFrame() { return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true)))); }
    // 注意:函数声明提升,上面 await 前先定义——重排
    const expFill = Math.max(3, Math.min(36, Math.floor((36 * e.hp) / e.maxHp)));
    let cv = null;
    document.querySelectorAll('canvas').forEach((c) => { if (c.width >= 1000 && c.getContext('2d')) cv = c; });
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const dpr = window.devicePixelRatio || 1;
    const isFill = (r, gg, b) => b < 40 && r + gg > 180;
    const isWhite = (r, gg, b) => r > 215 && gg > 215 && b > 215;
    const rows = [];
    const dumps = [];
    for (let f = 0; f < 720; f++) {
      const sgn = (Math.floor(f / 20) % 2 === 0) ? 1 : -1;
      e.vx = sgn * 2.6; e.vy = 0;
      e.x = px0; e.y = py0;
      p.x = skyX - p.w / 2; p.y = skyY - p.h / 2; p.vy = 0;
      e.facing = sgn;
      e.visAngle = e.vx * 0.1;
      await nextFrame();
      e.x = px0; e.y = py0;
      p.x = skyX - p.w / 2; p.y = skyY - p.h / 2; p.vy = 0;
      const cam = g.camera;
      const z = cam.zoom * dpr;
      const bx = Math.round((640 * dpr) + (e.cx - 18 - cam.x) * z);
      const by = Math.round((400 * dpr) + (e.y + e.h + 10 - cam.y) * z);
      const img = ctx.getImageData(bx, by, Math.round(36 * z), Math.round(12 * z));
      const d = img.data;
      const W = img.width, H = img.height;
      const rowLR = [];
      let whiteIn = 0;
      for (let ry = 1; ry < H - 1; ry++) {
        let l = -1, rr = -1, cnt = 0;
        for (let px = 0; px < W; px++) {
          const i = (ry * W + px) * 4;
          if (isFill(d[i], d[i + 1], d[i + 2])) { cnt++; if (l < 0) l = px; rr = px; }
          if (isWhite(d[i], d[i + 1], d[i + 2])) whiteIn++;
        }
        if (cnt >= 6) rowLR.push([l, rr]);
      }
      const med = (arr, k) => arr.length ? arr.map((v) => v[k]).sort((a, b) => a - b)[Math.floor(arr.length / 2)] : -1;
      const fillL = med(rowLR, 0), fillR = med(rowLR, 1);
      const spread = rowLR.length ? Math.max(...rowLR.map((v) => v[1])) - Math.min(...rowLR.map((v) => v[1])) : -1;
      rows.push({ f, facing: e.facing, fillL, fillR, spread, whiteIn });
      const bad = fillL > 4 * dpr + 2 || spread > 2 * dpr + 1 || (fillR >= 0 && Math.abs(fillR - expFill) > 2 * dpr + 1);
      if ((bad || whiteIn > 8) && dumps.length < 3) {
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
            else if (isWhite(r, gg, b)) cls = 'W';
            else if (isFill(r, gg, b)) cls = '#';
            else if (b < 40 && r + gg < 100) cls = ':';
            else cls = 'b';   // 蓝（天/水）
            row += inBar ? cls : cls.toLowerCase();
          }
          grid.push(row);
        }
        dumps.push({ f, facing: e.facing, fillL, fillR, spread, whiteIn, grid });
      }
    }
    let mirror = 0, tilt = 0, bjump = 0, whiteFrames = 0, prevR = null;
    for (const r of rows) {
      if (r.fillL > 4 * dpr + 2) mirror++;
      if (r.spread > 2 * dpr + 1) tilt++;
      if (r.whiteIn > 8) whiteFrames++;
      if (prevR !== null && r.fillR >= 0 && Math.abs(r.fillR - prevR) > 2 * dpr + 1) bjump++;
      if (r.fillR >= 0) prevR = r.fillR;
    }
    return { path: g.renderer.bglPathUsed, dpr, expFill, frames: rows.length,
      mirror, tilt, bjump, whiteFrames, dumps, tail: rows.slice(-4) };
  });
  console.log(JSON.stringify(result, null, 1));
} finally {
  await browser.close();
}
