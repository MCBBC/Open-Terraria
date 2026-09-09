// ★IIIII227 探针①：四涂装世界渲染对齐验收（monochrome / negativeinfinity /
//   invisibleplane / xrayvision）。每世界四步（世界间整页 reload 防状态污染）：
//   A. store 普查——gen 是否按旗写漆/涂层（vanilla DoPaintEverythingGray cs:777-805 /
//      DoPaintEverythingNegative :806-815 / DoCoatEverythingEcho :895-936 /
//      DoCoatEverythingIlluminant :997-1010 边距 5 域全覆盖）
//   B. 地图三路径同格对拍——mapColor24(预览) ↔ colorFor(增量) ↔ p32(fillBand 全量)
//      （IIIII218/III223 同款三路径口径；invisibleplane 是本批预览涂层门修复的验收）
//   C. 实时渲染抽查——chunk 烘焙画布逐格 alpha/色值：echo 格 tile+wall 层透明
//      （ChunkCache :671-675 IsVisible 门）、illuminant 格 glow 叠层非空
//      （:533-560 pair.glow）、漆格与图集原色相异（tintRegion 已上漆）
//   D. 语义开关——showInvisibleBlocks=true（幽灵护目镜 4409 等价）后 colorFor 显形
//   产物 /tmp/iii227-out/paint-report.json + paint-<seed>[-underground].png。
// 运行：SW_ORIGIN=http://localhost:5283 node tools/run-diag.mjs --timeout=1800000 scripts/_iii227-paint.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const OUT = '/tmp/iii227-out';
mkdirSync(OUT, { recursive: true });
const BUST = Date.now();

const SEEDS = [
  { seed: 'monochrome', flag: 'paintEverythingGray' },
  { seed: 'negativeinfinity', flag: 'paintEverythingNegative' },
  { seed: 'invisibleplane', flag: 'coatEverythingEcho' },
  { seed: 'xrayvision', flag: 'coatEverythingIlluminant' },
];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 1800000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
await page.bringToFront();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 300)));

const report = { seeds: [], pageErrors: errs };

async function openPage() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
  await page.evaluate(() => { try { localStorage.setItem('sw-gate', '1'); } catch { /* noop */ } });
}

for (const { seed, flag } of SEEDS) {
  console.log('== world', seed);
  await openPage();
  await page.evaluate((s) => {
    void window.__swFlow.createWorldProbe({ seed: s, size: 0, name: 'iii227', difficulty: 0, evil: 0 })?.catch?.(() => {});
  }, seed);
  const t1 = Date.now();
  let ok = false;
  while (Date.now() - t1 < 420000) {
    ok = await page.evaluate(() => !!globalThis.__swGame?.world && !!globalThis.__swGame?.renderer?.minimap).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ok) { report.seeds.push({ seed, error: 'world not ready in 420s' }); continue; }
  await new Promise((r) => setTimeout(r, 2500));   // 首屏 chunk 烘焙窗

  const rep = await page.evaluate(async (bust, flagName, seedName) => {
    const { mapColor24 } = await import(`/src/render/MapColors.ts?t=${bust}`);
    const { TILE, CHUNK } = await import(`/src/core/constants.ts?t=${bust}`);
    const g = globalThis.__swGame;
    const world = g.world, st = world.store, mm = g.renderer.minimap, chunks = g.chunks;
    const w = world.w, h = world.h;
    const out = { seed: seedName, flag: flagName, flags: { ...world.seedFlags }, w, h };

    // ---- A. store 普查（全格单遍，边距 5 = vanilla 域）----
    const M = 5;
    let cells = 0, paintHit = 0, wallPaintHit = 0, wallCells = 0, coatInvB = 0, coatInvW = 0, coatFbB = 0, coatFbW = 0;
    const paintOf = flagName === 'paintEverythingGray' ? (world.seedFlags.worldIsFrozen ? 26 : 27) : 30;
    for (let y = M; y < h - M; y++) {
      const rowOff = y * w;
      for (let x = M; x < w - M; x++) {
        const i = rowOff + x;
        cells++;
        if (st.paint[i] === paintOf) paintHit++;
        if (st.wall[i] !== 0) { wallCells++; if (st.paintWall[i] === paintOf) wallPaintHit++; }
        const c = st.coat[i];
        if (c & 2) coatInvB++;
        if (c & 4) coatInvW++;
        if (c & 8) coatFbB++;
        if (c & 16) coatFbW++;
      }
    }
    out.census = {
      cells,
      paint: flagName.startsWith('paint') ? { id: paintOf, coverage: +(paintHit / cells).toFixed(6), wallCoverage: +(wallPaintHit / Math.max(1, wallCells)).toFixed(6) } : null,
      coat: flagName === 'coatEverythingEcho' ? { invBlock: +(coatInvB / cells).toFixed(6), invWall: +(coatInvW / cells).toFixed(6), fullbrightB: +(coatFbB / cells).toFixed(6) }
        : flagName === 'coatEverythingIlluminant' ? { fullbrightB: +(coatFbB / cells).toFixed(6), fullbrightW: +(coatFbW / cells).toFixed(6), invBlock: +(coatInvB / cells).toFixed(6) } : null,
    };

    // ---- B. 地图三路径对拍（涂/涂层格抽样 400 格）----
    const bgCtx = {
      groundLevel: world.groundLevel, rockLevel: world.rockLevel,
      underworld: world.lavaLine > 0 ? world.lavaLine : undefined,
      remix: !!world.seedFlags?.remix,
    };
    const rgbOfHex = (s) => s ? [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)] : [-1, -1, -1];
    const p32rgb = (i) => { const v = mm.p32[i]; return [v & 255, (v >> 8) & 255, (v >> 16) & 255]; };
    mm.redrawAll();
    const eq = (a, b) => a.length === b.length && a.every((v, k) => ((v ^ b[k]) & 255) === 0);
    const samples = [];
    let m24vsCf = 0, m24vsBand = 0, cfvsBand = 0, nS = 0;
    const want = (i) => flagName === 'coatEverythingEcho' ? (st.coat[i] & 2) !== 0
      : flagName === 'coatEverythingIlluminant' ? (st.coat[i] & 8) !== 0
      : st.paint[i] === paintOf;
    for (let k = 0; k < 4000 && nS < 400; k++) {
      const x = 40 + ((k * 761) % (w - 80));
      const y = 40 + ((k * 577) % (h - 80));
      const i = st.idx(x, y);
      if (!want(i)) continue;
      const a24 = mapColor24(st, x, y, bgCtx) & 0xffffff;
      const acf = rgbOfHex(mm.colorFor(x, y));
      const ab = p32rgb(i);
      const rgb24 = [(a24 >> 16) & 255, (a24 >> 8) & 255, a24 & 255];
      if (!eq(rgb24, acf)) m24vsCf++;
      if (!eq(rgb24, ab)) m24vsBand++;
      if (!eq(acf, ab)) cfvsBand++;
      nS++;
      if (samples.length < 8) samples.push({ x, y, m24: rgb24, colorFor: acf, band: ab });
    }
    out.mapThreePath = { samples: nS, m24vsColorFor: m24vsCf, m24vsFillBand: m24vsBand, colorForVsFillBand: cfvsBand, first: samples };

    // ---- C. 实时渲染抽查（地表附近 chunk 烘焙画布逐格读取）----
    const px0 = Math.max(M + 2, Math.floor(st.w / 2) - 64), py0 = Math.max(M + 2, Math.floor(world.groundLevel) - 8);
    const chunkProbe = [];
    for (let k = 0; k < 6000 && chunkProbe.length < 6; k++) {
      const x = px0 + ((k * 37) % 128), y = py0 + ((k * 53) % 96);
      if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)]) continue;
      const i = st.idx(x, y);
      const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
      const pair = chunks.get(cx, cy);
      const lx = x % CHUNK, ly = y % CHUNK;
      const readPx = (cv, oxx, oyy) => {
        const d = cv.getContext('2d').getImageData(oxx + lx * TILE, oyy + ly * TILE, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      };
      chunkProbe.push({
        x, y, type: st.type[i],
        coatInvis: (st.coat[i] & 2) !== 0, coatFb: (st.coat[i] & 8) !== 0, paint: st.paint[i],
        tilePx: readPx(pair.tile, pair.sx, pair.sy),
        wallPx: readPx(pair.wall, pair.sx, pair.sy),
        glowPx: pair.glow ? readPx(pair.glow, 0, 0) : null,
        hasGlow: !!pair.glow,
      });
    }
    out.chunkProbe = chunkProbe;

    // ---- D. showInvisibleBlocks 语义开关（幽灵护目镜等价门）----
    if (flagName === 'coatEverythingEcho' && chunkProbe.length > 0) {
      const { x, y } = chunkProbe[0];
      const i = st.idx(x, y);
      const before = mm.colorFor(x, y);
      const tb = mapColor24(st, x, y, bgCtx) & 0xffffff;
      st.showInvisibleBlocks = true;
      const after = mm.colorFor(x, y);
      const ta = mapColor24(st, x, y, bgCtx) & 0xffffff;
      st.showInvisibleBlocks = false;
      out.showInvisToggle = {
        colorForBefore: before, colorForAfter: after,
        m24Before: [(tb >> 16) & 255, (tb >> 8) & 255, tb & 255],
        m24After: [(ta >> 16) & 255, (ta >> 8) & 255, ta & 255],
        changed: before !== after,
      };
    }
    // 预览位图路径抽查（renderPreviewBitmap = GenWorldPreview/worker 同一函数）
    const pb = await import(`/src/workers/previewBitmap.ts?t=${bust}`);
    const bmp = pb.renderPreviewBitmap(st, 1024, bgCtx);
    const fx = Math.max(1, Math.ceil(st.w / 1024));
    out.previewBitmap = { width: bmp.width, height: bmp.height };
    const s0 = out.mapThreePath.first[0];
    if (s0) {
      const sx = Math.floor(s0.x / fx), sy = Math.floor(s0.y / fx);
      const pi = (sy * bmp.width + sx) * 4;
      const pr = [bmp.rgba[pi], bmp.rgba[pi + 1], bmp.rgba[pi + 2]];
      const m24 = mapColor24(st, sx * fx, sy * fx, bgCtx) & 0xffffff;
      out.previewSample = {
        at: [sx * fx, sy * fx], rgb: pr,
        m24: [(m24 >> 16) & 255, (m24 >> 8) & 255, m24 & 255],
        match: pr[0] === ((m24 >> 16) & 255) && pr[1] === ((m24 >> 8) & 255) && pr[2] === (m24 & 255),
      };
    }
    return out;
  }, BUST, flag, seed);

  report.seeds.push(rep);

  // 实况截图（出生点附近地面）
  try {
    await page.evaluate(() => {
      const g = globalThis.__swGame;
      const st = g.world.store;
      const gx = Math.floor(st.w / 2), gy = Math.floor(g.world.groundLevel);
      g.player.x = gx * 16; g.player.y = (gy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
      g.camera.x = g.player.x; g.camera.y = g.player.y;
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: `${OUT}/paint-${seed}.png` });
  } catch (e) { errs.push('SHOT:' + String(e).slice(0, 120)); }

  // 地下截图（rock 下 60 格全黑区；xrayvision 应非黑可见，invisibleplane 应见墙）
  try {
    await page.evaluate(() => {
      const g = globalThis.__swGame;
      const st = g.world.store;
      const gx = Math.floor(st.w / 2), gy = Math.floor(g.world.rockLevel) + 60;
      g.player.x = gx * 16; g.player.y = gy * 16; g.player.vx = 0; g.player.vy = 0;
      g.camera.x = g.player.x; g.camera.y = g.player.y;
    });
    await new Promise((r) => setTimeout(r, 1500));
    const stats = await page.evaluate(() => {
      const cv = globalThis.__swGame.renderer.canvas;
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let sum = 0, n = 0;
      for (let p = 0; p < d.length; p += 4 * 97) { sum += (d[p] + d[p + 1] + d[p + 2]) / 3; n++; }
      return { meanLum: +(sum / Math.max(1, n)).toFixed(2) };
    });
    report.seeds[report.seeds.length - 1].underground = stats;
    await page.screenshot({ path: `${OUT}/paint-${seed}-underground.png` });
  } catch (e) { errs.push('SHOT2:' + String(e).slice(0, 120)); }
}

writeFileSync(`${OUT}/paint-report.json`, JSON.stringify(report, null, 1));
console.log('report written; pageErrors =', errs.length);
await browser.close();
