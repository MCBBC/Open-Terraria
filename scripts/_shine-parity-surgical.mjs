// ★奇偶序依赖定谳·外科面——冻结装载+预热+逐格 byte-sum,两跑对拍定位差异格。
// 基于 _shine-stability-probe.mjs 的冻结装载纪律；新增：
//   · 目标 chunk 的 mul/add 画布逐格(16×16) byte-sum + store 五元组
//   · 256 行 rowSums（快速定位差异行）
//   · 池/memo 统计（shineStats + poolDepth）
//   · digest 两取（对拍纪律:第二取）
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const WORLD_JSON = process.env.SW_WORLD_JSON || '/Users/vinlic/Downloads/map-天真的钴最高点 (4).json';
const OUT = '/tmp/shine-debt';
const TAG = process.env.SW_TAG || 'sg';
mkdirSync(OUT, { recursive: true });
const worldText = readFileSync(WORLD_JSON, 'utf8');

const browser = await launchBrowser({ headed: true, viewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const errs = [];
try {
  const page = await openPage(browser, { errors: errs, maxErrors: 40 });
  installPinnedRandom(page, 118606602);
  // ★SW_LATE_FREEZE_MS(缺省 9000):装载后先跑真 tick(让 wbake 低优排空/晚到表
  //   重烘链真实收敛——flushDirty 挂在 fixedUpdate,装载即冻结会饿死低优 wbake=
  //   伪影),再冻结仿真取 digest。0=旧装载即冻结纪律。
  const LATE_FREEZE_MS = Number(process.env.SW_LATE_FREEZE_MS ?? '9000');
  if (LATE_FREEZE_MS === 0) {
    await page.evaluateOnNewDocument(() => {
      let frozen = null;
      Object.defineProperty(window, '__swGame', {
        configurable: true,
        get() { return frozen; },
        set(v) { frozen = v; try { v.__simFrozen = true; v.fixedUpdate = () => {}; } catch { /* */ } },
      });
    });
  }
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) process.exit(1);
  await front(page);
  await page.evaluate((text) => { void window.__swFlow.loadJson(text); }, worldText);
  const okGame = await waitForGame(page, { timeout: 240_000, log: (m) => console.log('  ' + m) });
  if (!okGame) process.exit(1);

  await page.evaluate(async () => {
    const g = window.__swGame;
    g.player.debugGod = true;
    g.player.x = 1592 * 16 + 8;
    g.player.y = 744 * 16;
    g.player.vx = 0; g.player.vy = 0;
    if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
  });
  // ★延迟冻结:先真跑 LATE_FREEZE_MS 再钉住仿真
  if (LATE_FREEZE_MS > 0) {
    await page.evaluate((ms) => new Promise((res) => setTimeout(res, ms)), LATE_FREEZE_MS);
    await page.evaluate(() => {
      const g = window.__swGame;
      g.__simFrozen = true;
      g.fixedUpdate = () => {};
    });
  }
  // atlas 静止门（同 stability 探针:10s 不变）
  await page.evaluate(() => new Promise((res) => {
    const g = window.__swGame;
    let last = -1, stable = 0;
    const iv = setInterval(() => {
      const sz = g.renderer.atlas.vimages.size;
      if (sz === last) { stable++; if (stable >= 20) { clearInterval(iv); res(null); } }
      else { stable = 0; last = sz; }
    }, 500);
  }));
  await page.evaluate(() => new Promise((res) => {
    let k = 0;
    function tick() { if (++k >= 120) { res(null); return; } requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  const targets = process.env.SW_CHUNKS ? JSON.parse(process.env.SW_CHUNKS) : [[98, 44], [97, 44]];
  const dumpList = (process.env.SW_DUMP_CHUNKS || '').split(';').filter(Boolean);
  const out = await page.evaluate(async (TARGETS, DUMP_LIST) => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    // 晚到重烘排干
    await new Promise((res) => {
      let lastB = -1, stable = 0;
      const iv = setInterval(() => {
        const s2 = m.shineStats;
        if (s2.pending === 0 && s2.bakes === lastB) { stable++; if (stable >= 4) { clearInterval(iv); res(null); } }
        else { stable = 0; lastB = s2.bakes; }
      }, 500);
    });
    const bx = Math.floor(g.camera.x / 256), by = Math.floor(g.camera.y / 256);
    // digest 两取（第二取为准）
    const d1 = m.shineDebugChunkDigests(g.chunks, bx - 2, bx + 2, by - 2, by + 2);
    const d2 = m.shineDebugChunkDigests(g.chunks, bx - 2, bx + 2, by - 2, by + 2);
    const st = g.world.store;
    const DUMP = new Set(DUMP_LIST);
    const chunks = {};
    for (const [scx, scy] of TARGETS) {
      const pair = g.chunks.get(scx, scy);
      const slots = m.shineDebugSlotsForTest(pair);
      const cells = []; const rowSums = []; const rowSumsAdd = [];
      let fullRgba = null;
      if (slots && slots[0]) {
        const cvs = [slots[0].e.mul, slots[0].e.add];
        for (let ci = 0; ci < cvs.length; ci++) {
          const cv = cvs[ci];
          if (ci === 1) { if (!cv) { rowSumsAdd.push(-1); continue; } }
          const d = cv.getContext('2d').getImageData(0, 0, 256, 256).data;
          if (ci === 1) { rowSumsAdd.length = 0; }
          for (let ry = 0; ry < 256; ry++) {
            let s2 = 0;
            for (let rx = 0; rx < 256; rx++) { const o = (ry * 256 + rx) * 4; s2 += d[o] + d[o + 1] + d[o + 2] + d[o + 3]; }
            (ci === 0 ? rowSums : rowSumsAdd).push(s2);
          }
        }
        const mulD = slots[0].e.mul
          ? slots[0].e.mul.getContext('2d').getImageData(0, 0, 256, 256).data : null;
        if (mulD) {
          for (let ty = 0; ty < 16; ty++) {
            for (let tx = 0; tx < 16; tx++) {
              let s2 = 0;
              for (let py = 0; py < 16; py++) {
                for (let px = 0; px < 16; px++) {
                  const o = ((ty * 16 + py) * 256 + tx * 16 + px) * 4;
                  s2 += mulD[o] + mulD[o + 1] + mulD[o + 2] + mulD[o + 3];
                }
              }
              const i = st.idx(scx * 16 + tx, scy * 16 + ty);
              cells.push([s2, st.type[i], st.frameX[i], st.frameY[i], st.paint[i], st.half[i], st.slope[i], st.wire[i], st.coat[i]]);
            }
          }
        }
      }
      if (DUMP.has(scx + ',' + scy) && slots && slots[0] && slots[0].e.mul) {
        const fd = slots[0].e.mul.getContext('2d').getImageData(0, 0, 256, 256).data;
        fullRgba = Array.from(fd);
      }
      chunks[scx + ',' + scy] = {
        slotsLen: slots ? slots.length : -1,
        q: slots && slots[0] ? slots[0].q : -1,
        cells, rowSums, rowSumsAdd, fullRgba,
      };
    }
    const s = m.shineStats;
    // ★定谳面:差异 chunk 的 memo/fp/图集状态
    const cc = await import('/src/render/ChunkCache.ts');
    const diag = {};
    for (const [scx, scy] of TARGETS) {
      const pair = g.chunks.get(scx, scy);
      const key = cc.ChunkCache.key(scx, scy);
      const memo = m.shineDebugMemoPeekForTest(key);
      const slots = m.shineDebugSlotsForTest(pair);
      const fpNow = m.shineChunkFingerprintCached(g.world, g.renderer.atlas, pair, scx, scy, 0);
      diag[scx + ',' + scy] = {
        memoLen: memo ? memo.length : -1,
        memo: memo ? memo.map((x) => ({ q: x.q, fp: x.fp, hasMul: !!x.e.mul })) : null,
        memoFpEqFpNow: memo ? memo.map((x) => x.fp === fpNow) : null,
        slotFpNA: true,
        fpNow,
        atlasHas178: g.renderer.atlas.vimages.has('vanilla/Tiles_178.png'),
        atlasSize: g.renderer.atlas.vimages.size,
        pairId: pair ? (pair.cell ?? -1) : -1,
        slotsObj: slots ? slots.map((x) => ({ q: x.q, hasMul: !!x.e.mul, done: m.shineEntryComplete(x.e) })) : null,
      };
    }
    return { d1, d2, chunks, diag, poolDepth: m.shinePoolDepthForTest(),
      stats: { bakes: s.bakes, memoHits: s.memoHits, memoMisses: s.memoMisses, poolHits: s.poolHits, poolReturns: s.poolReturns } };
  }, targets, dumpList);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out));
  console.log('digest2 sums:', out.d2.map((d) => d.sum).join(','));
  console.log('poolDepth:', out.poolDepth, 'stats:', JSON.stringify(out.stats));
} finally {
  await browser.close().catch(() => {});
}
