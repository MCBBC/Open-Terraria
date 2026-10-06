// ★奇偶序依赖定谳·时间线面——从装载起逐拍轮询差异格状态:
//   vimages.size / Tiles_178 在位 / pair 身份 / gem 16×16 区 byte-sum / memo fp
// 目标:确定 gem 缺席是「首烘早于图到且从不重烘」还是「后到事件擦除」。
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5204';
const WORLD_JSON = process.env.SW_WORLD_JSON || '/Users/vinlic/Downloads/map-天真的钴最高点 (4).json';
const OUT = '/tmp/shine-debt';
const TAG = process.env.SW_TAG || 'tl';
mkdirSync(OUT, { recursive: true });
const worldText = readFileSync(WORLD_JSON, 'utf8');

const browser = await launchBrowser({ headed: true, viewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const errs = [];
try {
  const page = await openPage(browser, { errors: errs, maxErrors: 40 });
  installPinnedRandom(page, 118606602);
  await page.evaluateOnNewDocument(() => {
    let frozen = null;
    Object.defineProperty(window, '__swGame', {
      configurable: true,
      get() { return frozen; },
      set(v) { frozen = v; try { v.__simFrozen = true; v.fixedUpdate = () => {}; } catch { /* */ } },
    });
  });
  // 时间线记录器:__swGame 出现即启动轮询（进入页面就绪前开始抓装载期事件）
  await page.evaluateOnNewDocument(() => {
    (window).__swTL = [];
    const rec = (r) => { const a = (window).__swTL; if (a.length < 40000) a.push(r); };
    let last = null;
    let lastPair = null;
    let m = null;
    const poll = async () => {
      try {
        const g = (window).__swGame;
        if (g && g.renderer && g.renderer.atlas && g.chunks && g.world) {
          if (!m) { try { m = await import('/src/render/TileShine.ts'); } catch { /* */ } }
          const cx = 97, cy = 45;
          const pair = g.chunks.get(cx, cy);
          const r = g.renderer.atlas;
          let gemSum = -1;
          let pairNew = false;
          if (pair && pair !== lastPair) { pairNew = !!lastPair; lastPair = pair; }
          if (m && pair) {
            const slots = m.shineDebugSlotsForTest(pair);
            if (slots && slots[0] && slots[0].e.mul) {
              const d = slots[0].e.mul.getContext('2d').getImageData(12 * 16, 2 * 16, 16, 16).data;
              let s2 = 0;
              for (let i = 0; i < d.length; i += 4) s2 += d[i] + d[i + 1] + d[i + 2] + d[i + 3];
              gemSum = s2;
            }
          }
          const row = {
            t: Math.round(performance.now()),
            size: r.vimages.size,
            has178: r.vimages.has('vanilla/Tiles_178.png'),
            pairNew,
            gemSum,
          };
          const k = JSON.stringify([row.size, row.has178, row.pairNew, row.gemSum]);
          if (k !== last) { rec(row); last = k; }
        }
      } catch (e) { /* */ }
      setTimeout(poll, 25);
    };
    poll();
  });
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) process.exit(1);
  await front(page);
  // ★插桩:原型级包装 ChunkCache 关键方法(模块缓存同实例,存活于世界换代)
  await page.evaluate(() => {
    (window).__swEVT = [];
    const ev = (k, extra) => {
      const a = (window).__swEVT;
      if (a.length < 20000) a.push({ t: Math.round(performance.now()), k, ...extra });
    };
    const iv = setInterval(() => {
      if (!((window).__swGame)) return;
      clearInterval(iv);
      import('/src/render/ChunkCache.ts').then((cc) => {
        const P = cc.ChunkCache.prototype;
        const wrap = (name, key) => {
          if (!P[name]) return;
          const orig = P[name];
          P[name] = function (...args) {
            try { key.call(this, args); } catch { /* */ }
            return orig.apply(this, args);
          };
        };
        wrap('onBakeAssetArrived', function (a) { ev('arrive', { file: a[0] }); });
        wrap('markDirty', function (a) { if (a[0] === 97 && a[1] === 45) ev('markDirty9745', { hasChunk: this.chunks.has((97 & 0xffff) | ((45 & 0xffff) << 16)), inSheets: !!this.chunkSheets?.get((97 & 0xffff) | ((45 & 0xffff) << 16)) }); });
        wrap('renderChunk', function (a) {
          const k = (a[0] & 0xffff) | ((a[1] & 0xffff) << 16);
          const miss = this.chunkSheets.get(k);
          if (a[0] === 97 && a[1] === 45) ev('renderChunk9745', { preMissing: miss ? [...miss] : null });
        });
        wrap('completeWorkerBake', function (a) {
          const tgt = a[0] === 97 && a[1] === 45;
          if (tgt) ev('workerBake9745', { missing: a[5] || [] });
        });
        wrap('bakeChunkInto', function (a) { if (a[0] === 97 && a[1] === 45) ev('bakeInto9745', {}); });
        wrap('get', function (a) {
          if (a[0] === 97 && a[1] === 45 && !this.__9745Seen) { this.__9745Seen = true; ev('get9745-first', {}); }
        });
        ev('proto-wrapped', {});
      });
    }, 16);
  });
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
  const out = await page.evaluate(async () => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    const cc = await import('/src/render/ChunkCache.ts');
    await new Promise((res) => {
      let lastB = -1, stable = 0;
      const iv = setInterval(() => {
        const s2 = m.shineStats;
        if (s2.pending === 0 && s2.bakes === lastB) { stable++; if (stable >= 4) { clearInterval(iv); res(null); } }
        else { stable = 0; lastB = s2.bakes; }
      }, 500);
    });
    // 终态细察
    const cx = 97, cy = 45;
    const pair = g.chunks.get(cx, cy);
    const slots = m.shineDebugSlotsForTest(pair);
    const key = cc.ChunkCache.key(cx, cy);
    const memo = m.shineDebugMemoPeekForTest(key);
    let gemSum = null, fullRgba = null;
    if (slots && slots[0] && slots[0].e.mul) {
      const d = slots[0].e.mul.getContext('2d').getImageData(0, 0, 256, 256).data;
      let s2 = 0;
      for (let py = 0; py < 16; py++) for (let px = 0; px < 16; px++) {
        const o = ((2 * 16 + py) * 256 + 12 * 16 + px) * 4;
        s2 += d[o] + d[o + 1] + d[o + 2] + d[o + 3];
      }
      gemSum = s2;
      fullRgba = Array.from(d);
    }
    const fpNow = m.shineChunkFingerprintCached(g.world, g.renderer.atlas, pair, cx, cy, 0);
    const s = m.shineStats;
    // 底图同格 byte-sum（gem 精灵本体是否在底图中）
    let baseGemSum = -1;
    if (pair && pair.tile) {
      try {
        const bc = (pair.tile.getContext ? pair.tile.getContext('2d') : null);
        if (bc) {
          const d = bc.getImageData(pair.sx + 12 * 16, pair.sy + 2 * 16, 16, 16).data;
          let s2 = 0;
          for (let i = 0; i < d.length; i += 4) s2 += d[i] + d[i + 1] + d[i + 2] + d[i + 3];
          baseGemSum = s2;
        }
      } catch { /* */ }
    }
    return {
      tl: (window).__swTL || [],
      evt: (window).__swEVT || [],
      chunkSheets9745: (() => {
        try {
          const s = g.chunks.chunkSheets;
          const k = (97 & 0xffff) | ((45 & 0xffff) << 16);
          const v = s.get(k);
          return v ? [...v] : null;
        } catch { return 'ERR'; }
      })(),
      chunkState9745: (() => {
        try {
          const k = (97 & 0xffff) | ((45 & 0xffff) << 16);
          const c = g.chunks;
          const p = c.chunks.get(k);
          let any178 = 0;
          for (const [, v] of (c.chunkSheets || new Map())) if (v.has('vanilla/Tiles_178.png')) any178++;
          const bc = c.bakeClient;
          let pendingState = null, awaiting178 = null, lowHoldPos = -1, inflightN = -1;
          if (bc) {
            const pd = bc.pending;
            pendingState = pd.has(k) ? JSON.stringify(pd.get(k)) : null;
            const a = bc.awaitingByFile?.get('vanilla/Tiles_178.png');
            awaiting178 = a ? [...a] : null;
            lowHoldPos = bc.lowHold ? bc.lowHold.findIndex((e) => e.k === k) : -2;
            inflightN = bc.inflight ? bc.inflight.size : -1;
          }
          return {
            hasPair: !!p, placeholder: p ? !!p.placeholder : null,
            inWorkerAwaiting: c.workerAwaiting ? c.workerAwaiting.has(k) : null,
            chunksSize: c.chunks.size,
            sheetsSize: c.chunkSheets ? c.chunkSheets.size : -1,
            any178, sticky: c.stickyCell ? c.stickyCell.has(k) : null,
            pendingState, awaiting178, lowHoldPos, inflightN,
            animView: c.animView ? 'set' : 'null',
          };
        } catch (e) { return 'ERR:' + e.message; }
      })(),
      final: {
        gemSum, baseGemSum, fpNow, atlasSize: g.renderer.atlas.vimages.size,
        has178: g.renderer.atlas.vimages.has('vanilla/Tiles_178.png'),
        pairId: pair ? (pair.cell ?? -1) : -1,
        memoLen: memo ? memo.length : -1,
        memoFps: memo ? memo.map((x) => x.fp) : null,
        memoFpEqNow: memo ? memo.map((x) => x.fp === fpNow) : null,
        stats: { bakes: s.bakes, memoHits: s.memoHits, memoMisses: s.memoMisses, poolHits: s.poolHits, poolReturns: s.poolReturns },
      },
    };
  });
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(out));
  console.log('final:', JSON.stringify(out.final));
  console.log('tl rows:', out.tl.length);
} finally {
  await browser.close().catch(() => {});
}
