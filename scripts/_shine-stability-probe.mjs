// ★digest 通道稳定性判别探针——装载即冻结+预热+digest(零挖掘),两跑对拍。
// 【用途】隔离「烘焙产物逐位复现」的环境输入:若零挖掘两跑 digest 不等,差异来自
//   装载期环境(atlas 晚到/帧计数依赖),与挖掘/池化/carry 无关。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, waitForBridge, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5214';
const WORLD_JSON = process.env.SW_WORLD_JSON || needInput(join(DOWNLOADS, 'map-天真的钴最高点 (4).json'));
const OUT = '/tmp/shine-debt';
const TAG = process.env.SW_TAG || 'stab';
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
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) process.exit(1);
  await front(page);
  await page.evaluate((text) => { void window.__swFlow.loadJson(text); }, worldText);
  const okGame = await waitForGame(page, { timeout: 240_000, log: (m) => console.log('  ' + m) });
  if (!okGame) process.exit(1);

  // 钉位到腐化带 + 预热 120 帧
  const setup = await page.evaluate(async () => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    g.player.debugGod = true;
    g.player.x = 1592 * 16 + 8;
    g.player.y = 744 * 16;
    g.player.vx = 0; g.player.vy = 0;
    if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    const tdefs = (await import('/src/data/tiles.ts')).TILE_DEFS;
    // 盒内动画格普查(TILE_ANIM_RATE 成员)——帧计数依赖候选
    const anim = await import('/src/render/TileAnim.ts');
    const st = g.world.store;
    const found = {};
    for (let y = 720; y < 768; y++) {
      for (let x = 1568; x < 1648; x++) {
        if (!st.hasTile(x, y)) continue;
        const sh = tdefs[st.type[st.idx(x, y)]]?.vanilla?.sheet;
        if (sh != null && anim.isDynamicAnimSheet(sh)) found[sh] = (found[sh] ?? 0) + 1;
      }
    }
    return { animCells: found, tick: anim.tileAnim.tick };
  });
  console.log('setup:', JSON.stringify(setup));
  // ★atlas 静止门:vimages.size 连续 3s 不变 = 装载完成(fps 含装载代际,digest 必须在
  //   静止后取——否则测到的是「装载中」的合法瞬态,不是产品不稳定性)
  await page.evaluate(() => new Promise((res) => {
    const g = window.__swGame;
    let last = -1, stable = 0;
    const iv = setInterval(() => {
      const sz = g.renderer.atlas.vimages.size;
      if (sz === last) { stable++; if (stable >= 20) { clearInterval(iv); res(null); } }   // 10s 静止
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
    // 晚到重烘排干:pending==0 且 bakes 连续 2s 不涨
    await new Promise((res) => {
      let lastB = -1, stable = 0;
      const iv = setInterval(() => {
        const s2 = m.shineStats;
        if (s2.pending === 0 && s2.bakes === lastB) { stable++; if (stable >= 4) { clearInterval(iv); res(null); } }
        else { stable = 0; lastB = s2.bakes; }
      }, 500);
    });
    const anim = await import('/src/render/TileAnim.ts');
    // 相机 chunk ±2 环(与 _shine-debt-ab 盒同域)
    const bx = Math.floor(g.camera.x / 256), by = Math.floor(g.camera.y / 256);
    const digests = m.shineDebugChunkDigests(g.chunks, bx - 2, bx + 2, by - 2, by + 2);
    // 内容指纹快照(盒内容是否跨跑恒等)
    const fps = [];
    for (let cy = by - 2; cy <= by + 2; cy++) {
      for (let cx = bx - 2; cx <= bx + 2; cx++) {
        fps.push(m.shineFpPrefix(g.world, g.renderer.atlas, cx, cy, 16, 0, 0));
      }
    }
    // ★digest 解剖面:25 chunk 逐画布拆解(mul sum/add sum/身份/slotsLen),跑两遍
    const anatomy = [];
    const anatomyPass = (tag) => {
      const rows2 = [];
      for (let cy = by - 2; cy <= by + 2; cy++) {
        for (let cx = bx - 2; cx <= bx + 2; cx++) {
          const pair = g.chunks.get(cx, cy);
          const slots = m.shineDebugSlotsForTest(pair);
          if (!slots) { rows2.push({ cx, cy, tag, empty: true }); continue; }
          for (const s of slots) {
            const e = s.e;
            const same = e.mul !== undefined && e.mul === e.add;
            const sumOf = (c) => {
              if (!c) return -1;
              const d = c.getContext('2d').getImageData(0, 0, 256, 256).data;
              let t = 0; for (let i = 0; i < d.length; i++) t += d[i];
              return t;
            };
            rows2.push({ cx, cy, tag, q: s.q, slotsLen: slots.length, mulSum: sumOf(e.mul),
              addSum: e.add ? sumOf(e.add) : -1, sameMulAdd: same, done: e._resumeRow === undefined });
          }
        }
      }
      return rows2;
    };
    anatomy.push(anatomyPass('p1'));
    // 中间隔一次官方 digest(其 chunks.get 副作用受检)
    const midDigest = m.shineDebugChunkDigests(g.chunks, bx - 2, bx + 2, by - 2, by + 2);
    anatomy.push(anatomyPass('p2'));
    // ★外科面:两个差异 chunk 的逐格(16×16 tile)印迹 byte-sum + store 内容快照
    const surgical = {};
    for (const [scx, scy] of [[97, 44], [98, 44]]) {
      const slotsKey = scx + ',' + scy;
      // 经 shineDebugChunkDigests 拿不到画布本体——直接走内部不便;改从
      // shineCache 经 chunk pair 取 entry 画布读格芯
      const st = g.world.store;
      const pair = g.chunks.get(scx, scy);
      const cache = await import('/src/render/TileShine.ts');
      const slots = cache.shineDebugSlotsForTest(pair);
      const cells = [];
      if (slots && slots[0]) {
        const cv = slots[0].e.mul;
        if (cv) {
          const d = cv.getContext('2d').getImageData(0, 0, 256, 256).data;
          for (let ty = 0; ty < 16; ty++) {
            for (let tx = 0; tx < 16; tx++) {
              let s2 = 0;
              for (let py = 0; py < 16; py++) {
                for (let px = 0; px < 16; px++) {
                  const o = ((ty * 16 + py) * 256 + tx * 16 + px) * 4;
                  s2 += d[o] + d[o + 1] + d[o + 2] + d[o + 3];
                }
              }
              const i = st.idx(scx * 16 + tx, scy * 16 + ty);
              cells.push([s2, st.type[i], st.frameX[i], st.frameY[i], st.paint[i], st.half[i], st.slope[i], st.wire[i], st.coat[i]]);
            }
          }
        }
      }
      // 全画布 256 行 byte-sum（溢出带定位面）+ add 层同读
      const rowSums = [], rowSumsAdd = [];
      if (slots && slots[0]) {
        for (const cv of [slots[0].e.mul, slots[0].e.add]) {
          const tgt = cv === slots[0].e.mul ? rowSums : rowSumsAdd;
          if (!cv) { tgt.push(-1); continue; }
          const d = cv.getContext('2d').getImageData(0, 0, 256, 256).data;
          for (let ry = 0; ry < 256; ry++) {
            let s2 = 0;
            for (let rx = 0; rx < 256; rx++) {
              const o = (ry * 256 + rx) * 4;
              s2 += d[o] + d[o + 1] + d[o + 2] + d[o + 3];
            }
            tgt.push(s2);
          }
        }
      }
      // 对账:同一 evaluate 内重算 slots[0] 全画布 sum + pair 身份,与 digest 行对拍
      let localSum = null, slotsLen = slots ? slots.length : -1, pairTag = pair ? pair.cell : null;
      if (slots && slots[0] && slots[0].e.mul) {
        const d = slots[0].e.mul.getContext('2d').getImageData(0, 0, 256, 256).data;
        localSum = 0;
        for (let i = 0; i < d.length; i++) localSum += d[i];
      }
      // 微实验:同 evaluate 内 fresh digest(单 chunk) vs 直读;pair 身份一致性
      const pairAgain = g.chunks.get(scx, scy);
      const fresh = m.shineDebugChunkDigests(g.chunks, scx, scx, scy, scy);
      surgical[slotsKey] = { hasEntry: !!(slots && slots[0]), hasMul: !!(slots && slots[0] && slots[0].e.mul),
        cells, rowSums, rowSumsAdd, localSum, slotsLen, pairTag,
        pairSameAsReGet: pairAgain === pair, freshRow: fresh[0] };
    }
    return { digests, midDigest, anatomy, fps, tick: anim.tileAnim.tick, frames: m.shineStats.frames, surgical };
  });
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ setup, ...out }));
  console.log('digest rows:', out.digests.length, 'tick:', out.tick, 'frames:', out.frames);
  console.log('digest sums:', out.digests.map((d) => d.sum).join(','));
} finally {
  await browser.close().catch(() => {});
}
