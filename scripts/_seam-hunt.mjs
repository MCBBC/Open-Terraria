// ★一次性：动态物件发丝缝复现探针 v2 —— 注入用户存档(跳过损坏的世界生成),
// 相机对准机器区,多缩放 × 双动画时刻截图 + 水平行缝能量扫描
import puppeteer from 'puppeteer-core';
import { mkdirSync, copyFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5207';
const SAVE_SRC = process.env.SW_SAVE ?? '/Users/vinlic/Downloads/Starter_World-20260831-2315.sbw.json';
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
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 120000 });
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
  pl.x = 51203.52 - pl.w / 2; pl.y = 6260.52 + 20 - pl.h; pl.vx = 0; pl.vy = 0;   // 站到用户相机中心处(脚在下方20px)
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
await sleep(600);
// 动画时钟对齐（在截图前一刻置位,帧内容即与记录时刻同相）
if (renderMeta && (REPLAY === 'full' || REPLAY === 'cam')) {
  await p.evaluate(async (t) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = t; }, renderMeta.animTick);
}
const hits = await p.evaluate(() => window.__seamHits);
console.log('MACHINES:', JSON.stringify(hits));
const zooms = [1, 1.1, 1.2, 1.25, 1.27, 1.35, 1.5, 2];
let zz0 = 1.27;
for (const z of zooms) {
  zz0 = z;
  const okz = await p.evaluate((zz) => {
    const g = window.__swGame;
    try { g.camera.zoom = zz; } catch { return false; }
    return g.camera.zoom === zz;
  }, z);
  await sleep(800);
  for (const tag of ['a', 'b']) {
    await sleep(tag === 'a' ? 50 : 640);
    const clip = null; // 全幅截图（缝场景以相机为中心,不锚定出生点机器）
    await p.screenshot({ path: `${OUT}/z${z}-${tag}.png` });
    // 数值行剖扫(机器跨度窗)+ 4x 放大裁剪导出
    const scan = await p.evaluate((tag2) => {
      const g = window.__swGame;
      const cv = g.renderer?.canvas ?? document.querySelector('canvas');
      const c2 = document.createElement('canvas');
      c2.width = cv.width; c2.height = cv.height;
      const cx2 = c2.getContext('2d');
      cx2.drawImage(cv, 0, 0);
      const d = cx2.getImageData(0, 0, cv.width, cv.height).data;
      const W = cv.width;
      const x0 = 130, x1 = 305;
      const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
      const out = [];
      for (let y = 80; y <= 150; y++) {
        let s2 = 0, n = 0;
        for (let x = x0; x <= x1; x++) { s2 += Math.abs(lum(x, y) - lum(x, y - 1)); n++; }
        out.push([y, +(s2 / n).toFixed(1)]);
      }
      // 机器区 4x 放大
      const mc = document.createElement('canvas');
      mc.width = (x1 - x0) * 4; mc.height = 70 * 4;
      const mcx = mc.getContext('2d');
      mcx.imageSmoothingEnabled = false;
      mcx.drawImage(cv, x0, 80, x1 - x0, 70, 0, 0, mc.width, mc.height);
      return { rows: out, png: mc.toDataURL('image/png') };
    }, tag);
    await p.evaluate((durl, z, tg) => {
      window.__seamCrops = window.__seamCrops ?? {};
      window.__seamCrops[`${z}-${tg}`] = durl;
    }, scan.png, z, tag);
    console.log(`z${z}-${tag} rows80-150=${JSON.stringify(scan.rows)}`);
  }
}
// 落盘全部放大裁剪
const crops = await p.evaluate(() => window.__seamCrops ?? {});
for (const [k, v] of Object.entries(crops)) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${OUT}/crop-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
}
console.log('CROPS:', Object.keys(crops).join(','));
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
