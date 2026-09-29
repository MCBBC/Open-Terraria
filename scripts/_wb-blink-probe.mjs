// ★闪屏三层取证探针（2026-09-30 本机复现定谳）：地形方块瞬态消失案。
// 用户本机复现（站定）+ Windows trace 定谳（单坏帧/墙在 tile 缺/透墙签名）后续刀：
// 每采样对三层同位取证——①tile 页画布 cell（烘焙真值,I1 不变式的画布侧）②墙页画布
// cell（对照组）③最终合成画布（用户所见）；闪帧自动分层：cell α 塌=画布/烘焙侧，
// cell α 在而最终画布塌=GL 上传/页纹理/段发射侧。附加账：可见 chunk 占位对数/
// workerAwaiting/glDirtyPagesT·W 尺寸/_bglPageUploaded/bglPathStats 增量。
// 用法: SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_wb-blink-probe.mjs
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const MAP = process.env.WB_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (12).json';
const RUN_MS = Number(process.env.WB_RUN_MS ?? 90000);
const TX = Number(process.env.WB_TX ?? 3350);   // 目标 tile x(格)
const TY = Number(process.env.WB_TY ?? 460);    // 目标 tile y(格,地下)

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5207', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const res = await page.evaluate(async (mapText, tx, ty) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(400);
  if (!window.__swLoadJson) return { fail: 'no __swLoadJson' };
  await window.__swLoadJson(mapText);
  for (let i = 0; i < 300 && !(window.__swGame?.world); i++) await wait(200);
  if (!window.__swGame?.world) return { fail: 'world not ready' };
  await wait(3000);
  // 站定在目标点(地下洞穴)
  const g = window.__swGame;
  g.player.x = tx * 16 + 8 - g.player.w / 2;
  g.player.y = ty * 16 + 8;
  g.player.vx = 0; g.player.vy = 0;
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  await wait(1200);
  // 挖空玩家所在格防卡死(若嵌墙)
  return { ok: true, at: { x: g.player.x, y: g.player.y } };
}, mapText, TX, TY);
if (!res.ok) { console.log(JSON.stringify(res)); await browser.close(); process.exit(1); }
console.log('world ready', JSON.stringify(res.at));

const out = await page.evaluate(async (runMs) => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (cx, cy) => cx | (cy << 16);
  const chunks = g.chunks;
  const rdr = g.renderer;
  const cv = rdr.canvas;
  const scratch = document.createElement('canvas');
  const grab = (src, x, y, w, h) => {
    scratch.width = w; scratch.height = h;
    const sc = scratch.getContext('2d', { willReadFrequently: true });
    sc.drawImage(src, x, y, w, h, 0, 0, w, h);
    return sc.getImageData(0, 0, w, h).data;
  };
  const statsOf = (d) => {
    let a = 0, lum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { a += d[i + 3]; lum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
    return { a: a / n, lum: lum / n };
  };
  const diffOf = (d, ref) => {
    let s = 0;
    for (let i = 0; i < d.length; i += 4) {
      s += Math.abs(d[i] - ref[i]) + Math.abs(d[i + 1] - ref[i + 1]) + Math.abs(d[i + 2] - ref[i + 2]);
    }
    return s / (d.length / 4);
  };
  // 可见 chunk 环(±2)
  const visChunks = (ccx, ccy) => {
    const rows = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) rows.push([ccx + dx, ccy + dy]);
    return rows;
  };
  await wait(1500);
  // 基准:最终画布中心 crop(稳定相)
  const W = cv.width, H = cv.height;
  const refFinal = grab(cv, (W >> 1) - 80, (H >> 1) - 80, 160, 160);
  let pathStatsPrev = { ...rdr.bglPathStats };
  const samples = [];
  const episodes = [];
  const t0 = performance.now();
  let lastEp = -1e9;
  while (performance.now() - t0 < runMs) {
    const t = performance.now() - t0;
    const camX = g.camera.x, camY = g.camera.y;
    const ccx = Math.floor(camX / 256), ccy = Math.floor(camY / 256);
    // 最终画布 diff(每采样)
    const fin = grab(cv, (W >> 1) - 80, (H >> 1) - 80, 160, 160);
    const finDiff = diffOf(fin, refFinal);
    let ep = null;
    if (finDiff > 34 && t - lastEp > 120) {
      // 闪帧候选:三层同位取证
      let tileA = 0, wallA = 0, tileN = 0, wallN = 0, phN = 0, visN = 0;
      const cellSnap = [];
      for (const [cx, cy] of visChunks(ccx, ccy)) {
        const p = chunks.chunks.get(key(cx, cy));
        if (!p || p.placeholder) { if (p?.placeholder) phN++; continue; }
        visN++;
        const tp = chunks['tilePages'][Math.floor(p.cell / 16)];
        const wp = chunks['wallPages'][Math.floor(p.cell / 16)];
        if (tp) {
          const s = statsOf(grab(tp, p.sx + 112, p.sy + 112, 32, 32));
          tileA += s.a; tileN++;
          if (cellSnap.length < 4) cellSnap.push({ cx, cy, tileA: +s.a.toFixed(1), lum: +s.lum.toFixed(1) });
        }
        if (wp) { wallA += statsOf(grab(wp, p.sx + 112, p.sy + 112, 32, 32)).a; wallN++; }
      }
      const tileCellA = tileN ? tileA / tileN : -1;
      const wallCellA = wallN ? wallA / wallN : -1;
      // 画布侧判定:tile cell α 塌(可见 chunk 环均值 < 96)且墙 cell α 高
      const side = tileCellA >= 0 && tileCellA < 96 && wallCellA > 200 ? 'CANVAS'
        : tileCellA >= 0 && tileCellA < 96 ? 'CANVAS(both-low)'
        : 'GL/SEGMENT';
      ep = {
        t: +t.toFixed(0), finDiff: +finDiff.toFixed(1), side,
        tileCellA: +tileCellA.toFixed(1), wallCellA: +wallCellA.toFixed(1),
        visN, phN,
        workerAwaiting: chunks.workerAwaiting.size,
        pageCount: chunks.pageCount,
        dirtyQ: chunks.dirtyQueue.length,
        dT: chunks.glDirtyPagesT.size, dW: chunks.glDirtyPagesW.size,
        uploaded: { ...rdr['_bglPageUploaded'] },
        cellSnap,
      };
      episodes.push(ep);
      lastEp = t;
      // 稳定后刷新基准(闪过 500ms)
      const t2 = performance.now();
      while (performance.now() - t2 < 600) await wait(30);
      refFinal = grab(cv, (W >> 1) - 80, (H >> 1) - 80, 160, 160);
    }
    if (samples.length < 4000) samples.push({ t: +t.toFixed(0), d: +finDiff.toFixed(1) });
    await wait(14);
  }
  const pathDelta = {};
  for (const k of Object.keys(rdr.bglPathStats)) {
    const d = rdr.bglPathStats[k] - (pathStatsPrev[k] ?? 0);
    if (d > 0) pathDelta[k] = d;
  }
  const diffs = samples.map((s) => s.d).sort((a, b) => a - b);
  const q = (p) => diffs[Math.floor(diffs.length * p)] ?? -1;
  return {
    samples: samples.length,
    diff: { p50: q(0.5), p90: q(0.9), p99: q(0.99), max: diffs[diffs.length - 1] },
    episodes,
    pathDelta,
    final: {
      workerAwaiting: chunks.workerAwaiting.size,
      pageCount: chunks.pageCount,
      chunksMapSize: chunks.chunks.size,
      dT: chunks.glDirtyPagesT.size, dW: chunks.glDirtyPagesW.size,
      uploaded: { ...rdr['_bglPageUploaded'] },
    },
  };
}, RUN_MS);
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/wb-blink-last.png' });
await browser.close();
