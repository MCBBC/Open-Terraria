// ★一次性：动态物件发丝缝复现探针 v2 —— 注入用户存档(跳过损坏的世界生成),
// 相机对准机器区,多缩放 × 双动画时刻截图 + 水平行缝能量扫描
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { mkdirSync, copyFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5207';
const SAVE_SRC = process.env.SW_SAVE ?? needInput(join(DOWNLOADS, 'Starter_World-20260831-2315.sbw.json'));
// F5 报告(含 meta.render 渲染快照)——提供时按其重建相机/视口/动画时钟
const LOG_SRC = process.env.SW_LOG ?? '';
let renderMeta = null;
if (LOG_SRC) {
  const { readFileSync } = await import('node:fs');
  const j = JSON.parse(readFileSync(LOG_SRC, 'utf8'));
  renderMeta = j.meta?.render ?? null;
  console.log('RENDER_META:', JSON.stringify(renderMeta));
}
const OUT = '/tmp/seamhunt';
mkdirSync(OUT, { recursive: true });
copyFileSync(SAVE_SRC, 'public/debug-seam-save.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VP = { width: 900, height: 560, deviceScaleFactor: 1 };  // dsf2/headless 下世界层黑屏(引擎外因),统一正常渲染档
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: VP });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 160)));
await p.goto(`${ORIGIN}/?nosw${process.env.SW_FLAGS ? '&' + process.env.SW_FLAGS : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => !!window.__swFlow, { timeout: 240000 });
await p.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-seam-save.json?v=' + Date.now())).text()); });
await p.waitForFunction(() => !!window.__swGame && !!window.__swGame.world, { timeout: 240000 });
await sleep(1500);
// ★渲染态重建：相机/缩放/低清档/动画时钟逐位对齐记录值
const REPLAY = process.env.SW_REPLAY ?? 'none';  // camera 直写在 headless 下致黑屏,弃用;改玩家定点+跟随
if (renderMeta && REPLAY !== 'none') {
  const okR = await p.evaluate((rm) => {
    const g = window.__swGame;
    const out = [];
    if ('REPLAY_CAM'.includes('CAM') || true) {}
    try { g.camera.x = rm.camX; g.camera.y = rm.camY; g.camera.zoom = rm.zoom; out.push('cam'); } catch (e) { return 'cam:' + e.message; }
    out.push('low-skip');
    return out.join('+');
  }, renderMeta);
  console.log('RENDER_SET:', okR, '(' + REPLAY + ')');
}
// 关欢迎/教程弹窗
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('我已知晓'));
  if (btn) btn.click();
});
await sleep(1200);
// 玩家挪到存档里机器区（地图头 player 3197,395）
await p.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  pl.x = 51187.08 - pl.w / 2; pl.y = 6244.08 - 120.7 + 21 - pl.h; pl.vx = 0; pl.vy = 0;   // 渲染相机=玩家中心+120.7(实测),反推站位
  try { g.camera.followPlayer = false; } catch {}
  try { g.camera.x = 3199 * 16; g.camera.y = 391 * 16; } catch {}
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const hits = [];
  for (let y = 370; y <= 410; y++) for (let x = 3140; x <= 3260; x++) {
    const i = st.idx(x, y);
    const t = st.type[i];
    if (!t) continue;
    const sheet = TILE_DEFS[t]?.vanilla?.sheet;
    if (sheet === 17 || sheet === 165 || sheet === 244 || sheet === 219 || sheet === 218 || sheet === 220) hits.push([sheet, x, y]);
  }
  window.__seamHits = hits;
  window.__swTILE_DEFS_OK = true;
});
await p.evaluate(() => { window.__SEAMTRACE = []; });
if (process.env.SW_FB) {
  await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
}
await sleep(600);
// ★精确瞄准:迭代玩家位置,使渲染相机(由 trace 已知格反解) == 记录相机
const aim = async (tX, tY) => {
  for (let it = 0; it < 6; it++) {
    const cur = await p.evaluate(() => {
      const tr = (globalThis.__SEAMTRACE ?? []).slice(-300);
      globalThis.__SEAMTRACE.length = 0;
      // 用最远的已知动态格反解:任取两格 (tx,ty,dxa,yda) 解 camRX/camRY
      for (const c of tr) {
        for (const d of tr) {
          if (d === c || d.tx === c.tx || d.ty === c.ty) continue;
          const zz = 1.25, ox = Math.round((window.innerWidth) / 2), oy = Math.round(window.innerHeight / 2);
          const camRX = c.tx * 16 + (ox - c.dxa) / zz;
          const camRY = c.ty * 16 + (oy - c.yda) / zz;
          const camRX2 = d.tx * 16 + (ox - d.dxa) / zz;
          const camRY2 = d.ty * 16 + (oy - d.yda) / zz;
          if (Math.abs(camRX - camRX2) < 0.5 && Math.abs(camRY - camRY2) < 0.5) return { x: camRX, y: camRY };
        }
      }
      return null;
    }, tX, tY);
    if (!cur) { await sleep(400); continue; }
    const dx = tX - cur.x, dy = tY - cur.y;
    console.log('AIM it' + it + ' render=(' + cur.x.toFixed(1) + ',' + cur.y.toFixed(1) + ') delta=(' + dx.toFixed(1) + ',' + dy.toFixed(1) + ')');
    if (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.6) return true;
    await p.evaluate((ddx, ddy) => {
      const pl = window.__swGame.player;
      pl.x += ddx; pl.y += ddy; pl.vx = 0; pl.vy = 0;
    }, dx, dy);
    await sleep(500);
  }
  return false;
};
const aimed = await aim(renderMeta.camX, renderMeta.camY);
console.log('AIMED:', aimed);
// 诊断：暂停态/可见性/世界尺寸/chunk缓存
const diag = await p.evaluate(() => {
  const g = window.__swGame;
  return { paused: g.paused, vis: document.visibilityState,
    worldW: g.world?.w, lowW: g.renderer?._worldLowW, lowK: g.renderer?._worldLowK,
    camX: g.camera.x, camY: g.camera.y, zoom: g.camera.zoom,
    px: g.player?.x, py: g.player?.y };
});
console.log('DIAG:', JSON.stringify(diag));
// 动画时钟对齐（在截图前一刻置位,帧内容即与记录时刻同相）
if (renderMeta && (REPLAY === 'full' || REPLAY === 'cam')) {
  await p.evaluate(async (t) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = t; }, renderMeta.animTick);
}
const hits = await p.evaluate(() => window.__seamHits);
console.log('MACHINES:', JSON.stringify(hits));
const zooms = [1.25];
let zz0 = 1.27;
for (const z of zooms) {
  zz0 = z;
  const okz = await p.evaluate((zz) => {
    const g = window.__swGame;
    try { g.camera.zoom = zz; } catch { return false; }
    return g.camera.zoom === zz;
  }, z);
  await sleep(800);
  const ensureNoModal = async () => {
    await p.bringToFront();
    for (let i = 0; i < 10; i++) {
      const gone = await p.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('我已知晓'));
        if (b) { b.click(); return false; }
        return !document.querySelector('.sw-modal, .modal, [class*=overlay]');
      });
      if (gone) return;
      await sleep(300);
    }
  };
  await ensureNoModal();
  for (const tag of ['a', 'b', 'c', 'd']) {
    await ensureNoModal();
    if (tag === 'c') await p.evaluate(() => { window.__SW_DYNSNAP_OFF = true; });
    if (tag === 'd') await p.evaluate(() => { window.__SW_DYNSNAP_OFF = false; });
    await sleep(tag === 'a' ? 50 : tag === 'c' ? 30 : 640);
    const clip = null; // 全幅截图（缝场景以相机为中心,不锚定出生点机器）
    await p.screenshot({ path: `${OUT}/z${z}-${tag}.png` });
    // ★终审:worldCanvas 缝行剖面(render cam 由 SEAMTRACE 反解)+ Wall_142 画稿行对照
    const scan = await p.evaluate(() => {
      const g = window.__swGame;
      const st = g.world.store;
      const r = g.renderer;
      const wc = r.worldCanvas;
      const cv = r.canvas ?? document.querySelector('canvas');
      // 反解 render cam:任取 SEAMTRACE 尾部两格
      const tr = (globalThis.__SEAMTRACE ?? []).slice(-400);
      let cam = null;
      const zz = g.camera.zoom, oxc = Math.round(cv.width / 2), oyc = Math.round(cv.height / 2);
      for (const c of tr) {
        for (const d2 of tr) {
          if (d2 === c || d2.tx === c.tx || d2.ty === c.ty) continue;
          const rx = c.tx * 16 + (oxc - c.dxa) / zz;
          const ry = c.ty * 16 + (oyc - c.yda) / zz;
          const rx2 = d2.tx * 16 + (oxc - d2.dxa) / zz;
          const ry2 = d2.ty * 16 + (oyc - d2.yda) / zz;
          if (Math.abs(rx - rx2) < 0.5 && Math.abs(ry - ry2) < 0.5) { cam = { x: rx, y: ry }; break; }
        }
        if (cam) break;
      }
      if (!cam) return { err: 'cam unsolved' };
      const c2 = document.createElement('canvas');
      c2.width = wc.width; c2.height = wc.height;
      const cx2 = c2.getContext('2d');
      cx2.drawImage(wc, 0, 0);
      const dd = cx2.getImageData(0, 0, wc.width, wc.height).data;
      const W2 = wc.width;
      const lum = (x, y) => { const i = (y * W2 + x) * 4; return 0.299 * dd[i] + 0.587 * dd[i+1] + 0.114 * dd[i+2]; };
      // 缝行 = world 6128-6136 → canvas y
      const rows = [];
      for (let wy = 6122; wy <= 6138; wy++) {
        const cy = Math.round((wy - cam.y) * zz + oyc);
        if (cy < 2 || cy >= wc.height - 2) continue;
        // 墙列段(机器透明处 x 3183-3187)与机器列段(3188-3192)分开
        const seg = (a, b) => { let s2 = 0, n = 0; for (let wx = a; wx <= b; wx++) { const cx3 = Math.round((wx - cam.x) * zz + oxc); s2 += lum(cx3, cy); n++; } return (s2 / n).toFixed(1); };
        rows.push(wy + '(t' + (wy / 16).toFixed(2) + ')[墙' + seg(3183, 3187) + '|机' + seg(3188, 3192) + '|墙' + seg(3194, 3198) + ']');
      }
      // 暗带 RGB 采样:哪一层画的看颜色特征
      const rgb = [];
      for (const wy of [6128, 6131, 6132, 6133, 6135]) {
        const cy = Math.round((wy - cam.y) * zz + oyc);
        const band = [];
        for (let wx = 3183; wx <= 3193; wx += 2) {
          const cx3 = Math.round((wx - cam.x) * zz + oxc);
          const i = (cy * W2 + cx3) * 4;
          band.push(dd[i] + ',' + dd[i+1] + ',' + dd[i+2]);
        }
        rgb.push(wy + '[' + band.join(' ') + ']');
      }
      return { cam, rows, rgb };
    });
    console.log(`z${z}-${tag} FINAL=${JSON.stringify(scan)}`);
    console.log(`z${z}-${tag} furnCol=${JSON.stringify(scan.furnCol)} seamRowColors=${JSON.stringify(scan.seamRow)}`);
  }
}
// 落盘全部放大裁剪
const crops = await p.evaluate(() => window.__seamCrops ?? {});
for (const [k, v] of Object.entries(crops)) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${OUT}/crop-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
}
console.log('CROPS:', Object.keys(crops).join(','));
// ★墙页联合行验尸:chunk(199,23)底缘 vs chunk(199,24)顶缘 在墙页上的连续性
const walljoint = await p.evaluate(() => {
  const g = window.__swGame;
  const key = (cx, cy) => (cx & 0xffff) | ((cy & 0xffff) << 16);
  const p23 = g.chunks.chunks.get(key(199, 23));
  const p24 = g.chunks.chunks.get(key(199, 24));
  if (!p23 || !p24) return 'cells missing: ' + JSON.stringify([!!p23, !!p24]);
  const grab = (cv, sx, sy) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d'); x.drawImage(cv, sx, sy, 256, 256, 0, 0, 256, 256);
    return { d: x.getImageData(0, 0, 256, 256).data, c };
  };
  const a = grab(p23.wall, p23.sx, p23.sy);   // chunk23 墙 cell(底行 = 页 y+255)
  const b = grab(p24.wall, p24.sx, p24.sy);   // chunk24 墙 cell(顶行 = 页 y+0)
  const lum = (d, x, y) => { const i = (y * 256 + x) * 4; return 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]; };
  const out = [];
  // 跨联合的平均亮度剖面:chunk23 的 252..255 行 + chunk24 的 0..3 行
  for (let r = 0; r < 8; r++) {
    let s = 0, n = 0;
    for (let x = 8; x < 248; x++) {
      const v = r < 4 ? lum(a.d, x, 252 + r) : lum(b.d, x, r - 4);
      s += v; n++;
    }
    const tag = r < 4 ? `c23行${252 + r}` : `c24行${r - 4}`;
    out.push(tag + '=' + (s / n).toFixed(1));
  }
  // 逐 x 找联合处跳变>30 的列(连续墙面不应有)
  const jumps = [];
  for (let x = 8; x < 248; x++) {
    const up = lum(a.d, x, 255), dn = lum(b.d, x, 0);
    if (Math.abs(up - dn) > 30) jumps.push(x + ':' + up.toFixed(0) + '/' + dn.toFixed(0));
  }
  out.push('jumpCols=' + (jumps.length ? jumps.slice(0, 10).join(' ') : '无'));
  // 同时导出联合处 1:1 拼接图(上格末4行+下格首4行 ×256宽,放大4x)
  const mc = document.createElement('canvas');
  mc.width = 256 * 2; mc.height = 8 * 4;
  const mx = mc.getContext('2d');
  mx.imageSmoothingEnabled = false;
  mx.drawImage(a.c, 0, 252, 256, 4, 0, 0, 512, 16);
  mx.drawImage(b.c, 0, 0, 256, 4, 0, 16, 512, 16);
  window.__wallJoint = mc.toDataURL('image/png');
  return { rows: out, pngLen: window.__wallJoint.length };
});
console.log('WALLJOINT:', JSON.stringify(walljoint).slice(0, 600));
// ★光照层归因:同一设备行在 worldCanvas(乘光前) vs 主画布(乘光后) 的亮度差
const lightDiff = await p.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const main = r.canvas ?? document.querySelector('canvas');
  const wc = r.worldCanvas;
  if (!wc) return 'no worldCanvas';
  const c1 = document.createElement('canvas'); c1.width = main.width; c1.height = main.height;
  const x1 = c1.getContext('2d'); x1.drawImage(main, 0, 0);
  const c2 = document.createElement('canvas'); c2.width = wc.width; c2.height = wc.height;
  const x2 = c2.getContext('2d'); x2.drawImage(wc, 0, 0);
  const d1 = x1.getImageData(0, 0, main.width, main.height).data;
  const d2 = x2.getImageData(0, 0, wc.width, wc.height).data;
  const W1 = main.width, W2 = wc.width;
  const lum1 = (x, y) => { const i = (y * W1 + x) * 4; return 0.299 * d1[i] + 0.587 * d1[i+1] + 0.114 * d1[i+2]; };
  const lum2 = (x, y) => { const i = (y * W2 + x) * 4; return 0.299 * d2[i] + 0.587 * d2[i+1] + 0.114 * d2[i+2]; };
  const out = [];
  for (let y = 110; y <= 120; y++) {
    let s1 = 0, s2 = 0, n = 0;
    for (let x = 236; x <= 312; x++) {
      s1 += lum1(x, y);                     // 合成后
      s2 += lum2(Math.round(x * (W2 / W1)), Math.round(y * (wc.height / main.height)));  // 乘光前(低清坐标)
      n++;
    }
    out.push(y + ':post=' + (s1 / n).toFixed(1) + ' pre=' + (s2 / n).toFixed(1));
  }
  return out;
});
console.log('LIGHTDIFF:', JSON.stringify(lightDiff));
console.log('DONE');
// 数值行剖扫:机器区(世界 3188..3191 × 380..385)每设备行与上一行的平均|Δ|,
// 输出异常行;并把机器区放大图导出 dataURL 供目检
const report = await p.evaluate((zz) => {
  const g = window.__swGame;
  const cv = g.renderer?.canvas ?? document.querySelector('canvas');
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const cx2 = c2.getContext('2d');
  cx2.drawImage(cv, 0, 0);
  const d = cx2.getImageData(0, 0, cv.width, cv.height).data;
  const W = cv.width;
  const [sx0, sy0] = g.camera.worldToScreen(3188 * 16, 380 * 16);
  const [sx1, sy1] = g.camera.worldToScreen(3191 * 16, 385 * 16);
  const x0 = Math.max(2, Math.round(sx0)), x1 = Math.min(W - 3, Math.round(sx1));
  const y0 = Math.max(2, Math.round(sy0)), y1 = Math.min(cv.height - 3, Math.round(sy1));
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
  const out = [];
  for (let y = y0 + 1; y <= y1; y++) {
    let s = 0, n = 0;
    for (let x = x0; x <= x1; x++) { s += Math.abs(lum(x, y) - lum(x, y - 1)); n++; }
    out.push([y, +(s / n).toFixed(1)]);
  }
  out.sort((a, b) => b[1] - a[1]);
  // 机器区放大图(3x)
  const mc = document.createElement('canvas');
  mc.width = (x1 - x0 + 1) * 3; mc.height = (y1 - y0 + 1) * 3;
  const mcx = mc.getContext('2d');
  mcx.imageSmoothingEnabled = false;
  mcx.drawImage(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, mc.width, mc.height);
  window.__mcData = mc.toDataURL('image/png');
  return { zoom: zz, top: out.slice(0, 6), box: [x0, y0, x1, y1], data: window.__mcData.length };
}, zz0);
console.log('SCAN', JSON.stringify({ zoom: report.zoom, top: report.top, box: report.box }));
await b.close();
