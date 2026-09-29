// ★wbake=1 传送丢渲染/部分图块永久色块 探针（2026-09-28 占位对账本缺口修复刃）。
// 病灶族：
//  · 用户实报：传送后丢渲染 1-2s 才刷出（worker 波次 7-26ms/块×视口串行,C4 验收数据）;
//  · 用户实报：丛林基地部分区块回退暗棕色块不渲染贴图（透明占位对永挂/worker 缺表
//    平涂——缺口A1 error 回包键域错位+A2 占位对 requeue 跳过,修复刃 tests/
//    wbake-placeholder-requeue.test.ts）。
// 量面（每臂 ?wbake=0 / ?wbake=1（混合路由修后缺省）/ ?wbake=1&bglshim=0）：
//  · 传送覆盖曲线：逐帧 视口 chunk 总数/占位数/透明页区数（页画布 2D 真值抽点）
//  · worker 波次：回包 ms 分布（min/avg/p95/max）+missing 表样本（首传波）
//  · settle 终态审计：视口内 chunk 页画布 cell 区五点采样 → transparent/flat/ok
//    三态;残留 placeholder/workerAwaiting/pending/dirtyQueue 账面
//  · 截图：每次传送后 1.2s 内 ~120ms/张（视觉证据）
// 运行：
//  SW_ORIGIN=http://localhost:5256 node tools/run-diag.mjs --timeout=900000 \
//    scripts/_wbake-teleport-miss.mjs [--out /tmp/wbake-tp/run-x] [--arms 1,0,s0] \
//    [--seed 05162020] [--settle 4000]
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { bootstrap, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { sizeDims } from '../tools/probe/lib/env.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5256';
const argOf = (k, dflt) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const OUT = argOf('--out', `/tmp/wbake-tp/run-${Date.now()}`);
const ARMS = (argOf('--arms', '1,0,s0') || '1,0,s0').split(',');
const SEED = argOf('--seed', '05162020');
const WSIZE = argOf('--size', 'small');
const SETTLE = Number(argOf('--settle', '4000')) || 4000;
const QUERY = { '1': '?wbake=1', '0': '?wbake=0', 's0': '?wbake=1&bglshim=0' };

// ---- 页内仪器（一次性挂;传送段计数器可重置）----
const INSTALL = () => {
  window.__tpSess = { segs: [], cur: null, worker: { n: 0, msMin: 1e9, msSum: 0, msMax: 0, missingSamples: [], errors: 0 }, mainBake: 0, entry: null };
  const newSeg = (name) => {
    const s = { name, t0: performance.now(), frames: [], samples: [], done: false };
    window.__tpSess.segs.push(s);
    window.__tpSess.cur = s;
    return s;
  };
  window.__tpNewSeg = newSeg;

  // 视口 chunk 集合 + 页画布真值五点采样（2D truth;GL 由 I4 自愈,不读回）
  const CS = 256;
  const viewChunks = (g) => {
    const cam = g.camera, z = cam.zoom || 1;
    const x0 = Math.floor((cam.x - cam.viewW / 2 / z) / CS), x1 = Math.floor((cam.x + cam.viewW / 2 / z) / CS);
    const y0 = Math.floor((cam.y - cam.viewH / 2 / z) / CS), y1 = Math.floor((cam.y + cam.viewH / 2 / z) / CS);
    const out = [];
    for (let cy = y0 - 1; cy <= y1 + 1; cy++) for (let cx = x0 - 1; cx <= x1 + 1; cx++) out.push([cx, cy]);
    return out;
  };
  const CELL5 = [[8, 8], [232, 8], [8, 232], [232, 232], [120, 120]];
  const samplePair = (pair) => {
    if (!pair || pair.cell < 0) return 'nopair';
    try {
      const tctx = pair.tile.getContext('2d');
      const wctx = pair.wall.getContext('2d');
      let tileTransparent = 0, tileOpaque = 0; const flatColors = new Set();
      for (const [ox, oy] of CELL5) {
        const d = tctx.getImageData(pair.sx + ox, pair.sy + oy, 16, 16).data;
        let a0 = 0, a255 = 0;
        for (let i = 3; i < d.length; i += 4) { if (d[i] === 0) a0++; else if (d[i] === 255) a255++; }
        if (a0 === 256) tileTransparent++;
        if (a255 === 256) tileOpaque++;
        const w = wctx.getImageData(pair.sx + ox, pair.sy + oy, 16, 16).data;
        flatColors.add(`${w[0]},${w[1]},${w[2]}`);
      }
      if (tileTransparent === CELL5.length && flatColors.size <= 2) return 'transparent';
      if (tileOpaque >= 4 && flatColors.size <= 2) return 'flat';   // 平涂色块嫌疑（缺表回退）
      return 'ok';
    } catch { return 'err'; }
  };
  window.__tpSample = (deep) => {
    const g = window.__swGame;
    const S = window.__tpSess.cur;
    if (!g?.world || !S) return null;
    const cc = g.chunks;
    const keys = viewChunks(g);
    const row = { t: Math.round(performance.now() - S.t0), tot: keys.length, ph: 0, transparent: 0, flat: 0, ok: 0, nopair: 0 };
    const bad = [];
    for (const [cx, cy] of keys) {
      const k = ((cx & 0xffff) | ((cy & 0xffff) << 16));
      const pair = cc.chunks.get(k);
      if (!pair) { row.nopair++; if (deep) bad.push({ cx, cy, st: 'nopair' }); continue; }
      if (pair.placeholder) row.ph++;
      if (deep) {
        const st = samplePair(pair);
        if (st === 'transparent' || st === 'flat') { row[st]++; bad.push({ cx, cy, st, cell: pair.cell, ph: !!pair.placeholder }); }
        else if (st === 'ok') row.ok++;
      }
    }
    row.accounts = deep ? {
      placeholder: [...cc.workerAwaiting].length, dirty: cc.dirtyQueue.length,
      chunks: cc.chunks.size,
    } : undefined;
    if (deep) row.bad = bad.slice(0, 24);
    return row;
  };

  // 逐帧采样器（浅采样每帧;深采样每 6 帧——getImageData 开销面;帧界结算 bake 耗时）
  window.__tpStartSampler = () => {
    const raf = () => {
      const S = window.__tpSess.cur;
      const g = window.__swGame;
      if (S && !S.done && g?.world) {
        const deep = S.frames.length % 6 === 0;
        const row = window.__tpSample(deep);
        if (row) {
          row.bakeMs = Math.round((window.__tpBakeAcc || 0) * 10) / 10;
          window.__tpBakeAcc = 0;
          S.frames.push(row);
        }
        const now = performance.now() - S.t0;
        if (now > (window.__tpSess.segMs || 4500)) S.done = true;
      }
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  };
  window.__tpStartSampler();

  // ChunkCache 烘焙计数 + 单帧 bake 耗时聚合（帧内预算判别器:巨帧 376ms→≤预算+单块）
  import('/src/render/ChunkCache.ts').then((m) => {
    const proto = m.ChunkCache.prototype;
    if (proto.__tpPatched) return;
    proto.__tpPatched = true;
    window.__tpBakeAcc = 0;
    const origBake = proto.bakeChunkInto;
    proto.bakeChunkInto = function (cx, cy, ...a) {
      const t0 = performance.now();
      const r = origBake.apply(this, [cx, cy, ...a]);
      window.__tpSess.mainBake++;
      window.__tpBakeAcc += performance.now() - t0;
      return r;
    };
  });
  // BakeClient：worker 回包 ms/missing/error 计数
  import('/src/workers/BakeClient.ts').then((m) => {
    const proto = m.BakeClient.prototype;
    if (proto.__tpPatched) return;
    proto.__tpPatched = true;
    const orig = proto.onMessage;
    proto.onMessage = function (res) {
      const S = window.__tpSess;
      if (res && res.type === 'baked') {
        S.worker.n++; S.worker.msSum += res.ms;
        S.worker.msMin = Math.min(S.worker.msMin, res.ms);
        S.worker.msMax = Math.max(S.worker.msMax, res.ms);
        if (S.cur) {
          const t = Math.round(performance.now() - S.cur.t0);
          if (res.missing?.length && S.cur.workerMissing === undefined) {
            S.cur.workerMissing = { at: t, files: res.missing.slice(0, 6) };
          }
          (S.cur.ms ||= []).push(Math.round(res.ms * 10) / 10);
        }
      }
      if (res && res.type === 'error') S.worker.errors++;
      return orig.apply(this, [res]);
    };
  });
  // 传送原语：玩家瞬移+相机硬 snap（绕 0.15 ease——裸测烘焙链,无黑幕干扰）
  window.__tpTeleport = (tx, ty) => {
    const g = window.__swGame;
    g.player.x = tx * 16; g.player.y = ty * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    return { x: g.player.x, y: g.player.y };
  };
  // 丛林定位：wall 67（jungle）密度最高 48×48 窗
  window.__tpFindJungle = () => {
    const g = window.__swGame;
    const st = g.world.store;
    const col = new Int32Array(st.w);
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      const w = st.wall[st.idx(x, y)];
      if (w === 67 || w === 64) col[x]++;
    }
    let bx = 0, bv = -1;
    for (let x = 0; x + 32 < st.w; x++) {
      let s = 0; for (let i = 0; i < 32; i++) s += col[x + i];
      if (s > bv) { bv = s; bx = x; }
    }
    let surface = 40;
    for (let y = 0; y < st.h - 1; y++) if (st.isSolid(bx + 8, y)) { surface = y; break; }
    return { x: bx + 8, y: surface, density: bv };
  };
};

const waitStable = undefined; void waitStable;   // (节流占位:稳态用固定 settle 窗)

async function shots(page, dir, tag, durMs) {
  const fs = await import('node:fs');
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < durMs) {
    try { await page.screenshot({ path: `${dir}/${tag}_${String(n).padStart(2, '0')}.png` }); } catch { /* 竞态 */ }
    n++;
    await new Promise((r) => setTimeout(r, 120));
  }
  return n;
}

async function runArm(arm) {
  const fs = await import('node:fs');
  const browser = await launchBrowser({});
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 200)));
  await bootstrap(page, ORIGIN);
  if (!(await gotoApp(page, ORIGIN, { extraQuery: QUERY[arm], tries: 30 }))) {
    await browser.close();
    return { arm, error: 'goto failed' };
  }
  await waitForBridge(page);
  await page.evaluate(INSTALL);
  const [W, H] = sizeDims(WSIZE);
  await page.evaluate(({ seed, w, h }) => { void window.__swFlow.newWorld(seed, w, h); }, { seed: SEED, w: W, h: H });
  await page.waitForFunction('window.__swGame?.world && window.__swGame?.player', { timeout: 240000, polling: 500 });
  await new Promise((r) => setTimeout(r, SETTLE));   // 入场波排空=稳态

  const dir = `${OUT}/arm-${arm}`;
  const segs = [];

  // 段0：出生点稳态基线（应全 ok）
  await page.evaluate(() => { window.__tpNewSeg('baseline-spawn'); window.__tpSess.segMs = 1200; });
  await new Promise((r) => setTimeout(r, 1600));
  const base = await page.evaluate(() => ({ row: window.__tpSample(true), mainBake: window.__tpSess.mainBake }));
  segs.push({ name: 'baseline-spawn', ...base });

  // 段1：传送丛林
  const jungle = await page.evaluate(() => window.__tpFindJungle());
  const shotP1 = shots(page, `${dir}/t1-jungle`, 'j', 1400);
  await page.evaluate(({ tx, ty }) => {
    window.__tpNewSeg('teleport-jungle'); window.__tpSess.segMs = 4500;
    window.__tpTeleport(tx, ty - 4);
  }, { tx: jungle.x, ty: jungle.y });
  await new Promise((r) => setTimeout(r, 4800));
  const t1 = await page.evaluate(() => window.__tpSess.segs.find((s) => s.name === 'teleport-jungle'));
  const shotN1 = await shotP1;
  segs.push({ name: 't1-jungle', jungle, frames: t1.frames.filter((f, i) => i < 4 || f.ph !== t1.frames[i - 1]?.ph || f.transparent !== t1.frames[i - 1]?.transparent || f.flat !== t1.frames[i - 1]?.flat).slice(0, 30), deep: t1.frames.filter((f) => f.bad), workerMissing: t1.workerMissing, ms: t1.ms, bakeSeries: t1.frames.map((f) => f.bakeMs ?? 0) });

  // 段2：传送回出生点（反向全换视口）
  const shotP2 = shots(page, `${dir}/t2-return`, 'r', 1400);
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__tpNewSeg('teleport-return'); window.__tpSess.segMs = 4500;
    window.__tpTeleport(Math.round(g.world.w / 2), 0);
    // 出生点 y：地表
    const st = g.world.store;
    const sx = Math.round(g.world.w / 2);
    let sy = 40;
    for (let y = 0; y < st.h - 1; y++) if (st.isSolid(sx, y)) { sy = y; break; }
    window.__tpTeleport(sx, sy - 4);
  });
  await new Promise((r) => setTimeout(r, 4800));
  const t2 = await page.evaluate(() => window.__tpSess.segs.find((s) => s.name === 'teleport-return'));
  const shotN2 = await shotP2;
  segs.push({ name: 't2-return', frames: t2.frames.filter((f, i) => i < 4 || f.ph !== t2.frames[i - 1]?.ph || f.transparent !== t2.frames[i - 1]?.transparent || f.flat !== t2.frames[i - 1]?.flat).slice(0, 30), deep: t2.frames.filter((f) => f.bad), workerMissing: t2.workerMissing, ms: t2.ms, bakeSeries: t2.frames.map((f) => f.bakeMs ?? 0) });

  const worker = await page.evaluate(() => ({
    ...window.__tpSess.worker,
    msAvg: window.__tpSess.worker.n ? Math.round(window.__tpSess.worker.msSum / window.__tpSess.worker.n * 10) / 10 : 0,
    flags: { wbake: window.__swBakeFlags?.enabled, client: !!window.__swGame?.chunks?.bakeClient },
  }));
  const shotsN = shotN1 + shotN2;
  await browser.close();
  fs.writeFileSync(`${dir}/segs.json`, JSON.stringify(segs, null, 1));
  return { arm, worker, segs: segs.map((s) => ({ name: s.name, row: s.row, mainBake: s.mainBake, deepBad: s.deep?.length, workerMissing: s.workerMissing })), pageErrors: pageErrors.slice(0, 3), dir, shotsN };
}

const results = [];
for (const arm of ARMS) {
  console.log(`\n==== arm ${arm} (${QUERY[arm]}) ====`);
  const r = await runArm(arm);
  results.push(r);
  if (r.error) { console.log(`  ${r.error}`); continue; }
  console.log(`worker: n=${r.worker.n} avg=${r.worker.msAvg}ms min=${r.worker.msMin === 1e9 ? '—' : Math.round(r.worker.msMin)}ms max=${Math.round(r.worker.msMax)}ms errors=${r.worker.errors}`);
  for (const s of r.segs) {
    console.log(`  [${s.name}] ${s.row ? JSON.stringify(s.row.row ?? s.row) : '—'} deepBad=${s.deepBad ?? '—'} mainBake=${s.mainBake ?? '—'}${s.workerMissing ? ` missing@${s.workerMissing.at}ms: ${s.workerMissing.files.join(',')}` : ''}`);
  }
  console.log(`flags=${JSON.stringify(r.worker.flags)} pageErrors=${r.pageErrors.length} shots=${r.shotsN} → ${r.dir}`);
}
const fs = await import('node:fs');
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(results, null, 1));
console.log(`\nsummary → ${OUT}/summary.json`);
// ---- 帧内预算判别器（28fps 追加修复项）:传送段单帧 bake 最大耗时 + 覆盖完成时长 ----
let budgetOk = true;
for (const r of results) {
  if (r.error || !['1', 's0'].includes(r.arm)) continue;
  const segs = JSON.parse(fs.readFileSync(`${r.dir}/segs.json`, 'utf8'));
  for (const s of segs) {
    if (!String(s.name).startsWith('teleport')) continue;
    const bakes = (s.bakeSeries || []).filter((v) => v > 0);
    const maxBake = bakes.length ? Math.max(...bakes) : 0;
    const firstFull = (s.frames || []).find((f) => f.nopair === 0 && f.t > 0);
    const coveredMs = firstFull ? firstFull.t : -1;
    console.log(`[budget] arm=${r.arm} seg=${s.name}: 单帧bake max=${maxBake}ms  覆盖完成=${coveredMs}ms`);
    if (maxBake > 12) { console.log(`  FAIL 单帧 bake 超 12ms 预算上界`); budgetOk = false; }
    if (coveredMs > 1200) { console.log(`  FAIL 覆盖完成 >1.2s（渐进摊显著变差）`); budgetOk = false; }
  }
}
const ok = results.every((r) => !r.error && r.pageErrors.length === 0) && budgetOk;
process.exit(ok ? 0 : 1);
