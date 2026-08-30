// 锯木机烘焙确定性 + 屏幕方差 双通道取证（用户真档）。
// 通道A：包 bakeChunkInto —— 含锯木机 chunk 每次重烘时，【静态格】逐格哈希差分
//        （16×16 格清单，剔除锯木机自身 3×3 足印与动画登记格）；若静态格跨烘变化=机制A实锤。
// 通道B：屏幕级 meanAbsDiff（近锯木机 vs 远控区 × zoom1.25/2.0），全亮关。
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5214', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'no loader' };
  await window.__swLoadJson(t);
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
if (!boot.ok) { console.log(JSON.stringify(boot)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // 全图找锯木机
  const SAW = window.__swTiles['v_106_sawmill'];
  const hits = [];
  for (let y = 0; y < st.h && hits.length < 6; y++) {
    for (let x = 0; x < st.w; x++) {
      if (st.type[st.idx(x, y)] === SAW) { hits.push([x, y]); x += 64; }
    }
  }
  if (!hits.length) return { fail: 'no sawmill in world' };
  const [sx0, sy0] = hits[0];
  g.player.x = sx0 * 16 + 8 - g.player.w / 2;
  g.player.y = sy0 * 16;
  g.player.vx = 0; g.player.vy = 0;
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  const cc = g.chunks;
  const KC = cc.constructor.key.bind(cc.constructor);
  const cX = Math.floor(sx0 / 16), cY = Math.floor(sy0 / 16);
  const keyStr = `${cX},${cY}`;
  // 通道A：hook bakeChunkInto
  const proto = Object.getPrototypeOf(cc);
  const orig = proto.bakeChunkInto;
  const bakes = [];
  proto.bakeChunkInto = function (cx, cy, wallPage, tilePage, cell) {
    const pair = orig.call(this, cx, cy, wallPage, tilePage, cell);
    try {
      if (cx === cX && cy === cY && cell >= 0) {
        const ctxT = tilePage.getContext('2d');
        const d = ctxT.getImageData(pair.sx, pair.sy, 256, 256).data;
        // 逐 16px 格哈希（局部坐标，步距=裁剪宽256）
        const cells = new Array(256).fill(0);
        for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
          let h = 7;
          for (let yy = 0; yy < 16; yy += 2) for (let xx = 0; xx < 16; xx += 2) {
            const q = (((ly * 16 + yy) * 256) + lx * 16 + xx) * 4;
            h = ((h * 33) + (d[q] << 16 | d[q + 1] << 8 | d[q + 2])) | 0;
          }
          cells[ly * 16 + lx] = h;
        }
        bakes.push({ t: performance.now(), cells });
      }
    } catch (e) { bakes.push({ err: String(e).slice(0, 120) }); }
    return pair;
  };
  // 等动画驱动若干轮
  await wait(7000);
  proto.bakeChunkInto = orig;
  // 分析：以第一次烘焙为基线，统计后续每次变化的格清单；标注锯木机自身足印
  // 锯木机占 3×3：世界 tile (sx0..sx0+2, sy0..sy0+2) → chunk 内 (lx=sx0-cX*16 ..)
  const ownLx0 = sx0 - cX * 16, ownLy0 = sy0 - cY * 16;
  const isOwn = (lx, ly) => lx >= ownLx0 && lx < ownLx0 + 3 && ly >= ownLy0 && ly < ownLy0 + 3;
  const baseline = bakes.find((x) => x.cells);
  // 存类型反查 key
  const invKey = {};
  for (const [k, id] of Object.entries(window.__swTiles)) if (invKey[id] === undefined) invKey[id] = k;
  const diffsMeta = [];
  // 记录首烘完整 ImageData 以便逐格量化
  const firstData = (() => {
    // 重触发一次烘焙拿基线位图：直接再 markDirty 后同步 renderChunk
    cc.markDirty(cX, cY);
    return null;
  })();
  void firstData;
  // 方案：hook 期间保留每份 cells 数组不够——需要真实像素。改为 hook 内保存前两份全量 ImageData 副本
  const keep = [];
  proto.bakeChunkInto = function (cx, cy, wallPage, tilePage, cell) {
    const pair = orig.call(this, cx, cy, wallPage, tilePage, cell);
    try {
      if (cx === cX && cy === cY && cell >= 0 && keep.length < 2) {
        const ctxT = tilePage.getContext('2d');
        keep.push(ctxT.getImageData(pair.sx, pair.sy, 256, 256));
      }
    } catch {}
    return pair;
  };
  await wait(1400);   // 等两次烘焙(动画节拍内)
  proto.bakeChunkInto = orig;
  const cellStats = [];
  if (keep.length === 2) {
    const [A, B] = keep;
    for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
      let maxD = 0, nPix = 0;
      for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 16; xx++) {
        const q = (((ly * 16 + yy) * 256) + lx * 16 + xx) * 4;
        const d = Math.max(Math.abs(A.data[q] - B.data[q]), Math.abs(A.data[q + 1] - B.data[q + 1]), Math.abs(A.data[q + 2] - B.data[q + 2]), Math.abs(A.data[q + 3] - B.data[q + 3]));
        if (d > 0) nPix++;
        if (d > maxD) maxD = d;
      }
      if (maxD > 0) {
        const ti = st.idx(cX * 16 + lx, cY * 16 + ly);
        cellStats.push({ lx, ly, own: isOwn(lx, ly), maxD, nPix, type: invKey[st.type[ti]] ?? String(st.type[ti]) });
      }
    }
  }
  // 通道B'：屏幕差分 A/B —— 正常 churn vs 冻结动画 vs 缩放对照。
  // 设计：固定一个【静态砖】采样格(锯木机左邻)、一个远控格；每配置采 30 对相隔
  // 一帧的报告；比较 配置间 的 avg MAD。数值而非截图判读。
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((x, y) => y.width * y.height - x.width * x.height)[0];
  const scratch = document.createElement('canvas');
  const cam = g.camera;
  const w2s = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const grab = (x, y, w, h) => {
    scratch.width = w; scratch.height = h;
    const sc = scratch.getContext('2d', { willReadFrequently: true });
    sc.drawImage(cv, x, y, w, h, 0, 0, w, h);
    return sc.getImageData(0, 0, w, h).data;
  };
  const mad = (a, b) => { let s2 = 0; for (let i = 0; i < a.length; i += 4) s2 += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s2 / (a.length / 12); };
  const probeGrid = async (wTiles) => {
    // 中心=锯木机左邻砖；区域=wTiles 格宽方形
    const cx0 = (sx0 - 5) * 16 + 8, cy0 = sy0 * 16 + 8;
    const [sxr, syr] = w2s(cx0, cy0);
    const r = Math.round(8 * cam.zoom) * wTiles;
    const arr = [];
    for (let k = 0; k < 30; k++) {
      const p1 = grab(sxr - r, syr - r, r * 2, r * 2);
      await wait(80);
      arr.push(mad(p1, grab(sxr - r, syr - r, r * 2, r * 2)));
    }
    return { avg: +(arr.reduce((s3, v) => s3 + v, 0) / arr.length).toFixed(3), mx: +Math.max(...arr).toFixed(3), nz: arr.filter(v => v > 0.15).length };
  };
  const screenAB = [];
  for (const zoom of [1.25, 2.0]) {
    g.setZoom(zoom); await wait(700);
    const normal = await probeGrid(4);
    const frozenSet = new Set();
    for (const [sheet, set] of cc.animChunksBySheet) { frozenSet.add(sheet); }
    cc.animChunksBySheet.clear();       // 冻结：advanceAnim 不再标脏任何 sheet 组
    await wait(500);
    const frozen = await probeGrid(4);
    for (const sh of frozenSet) cc.animChunksBySheet.set(sh, new Set());   // 结构占位恢复不必完全一致
    screenAB.push({ zoom, normalChurn: normal, animFrozen: frozen });
  }
  g.setZoom(1.25);
  g.setZoom(1.25);
  return { saw: [sx0, sy0], bakeCount: bakes.length, errCount: bakes.filter(b=>b.err).length,
           rebakeCount: bakes.filter(b=>b.cells).length,
           keptPairs: keep.length,
           changedCellCount: cellStats.length,
           cellStatsByAmp: cellStats.sort((a, b) => b.maxD - a.maxD || b.nPix - a.nPix).slice(0, 24),
           ampHistogram: (() => { const h = {}; for (const c of cellStats) h[c.maxD] = (h[c.maxD] ?? 0) + 1; return h; })(),
           typeDistribution: (() => { const t = {}; for (const c of cellStats) t[c.type] = (t[c.type] ?? 0) + 1; return t; })(),
           screenAB };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
