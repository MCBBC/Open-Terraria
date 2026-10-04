// ★光照 transferable 遗留池化·定谳/验收探针（2026-10-04）。
// 三债量化（transferable 刀收官报告登记债 1/2/3）:
//   债1 信封结构克隆（per/buffs number[][] + sky/flicker 标量）——send p50 分解
//       + 克隆臂 vs 扁平臂（Float64Array）微基准（真实 buildEngineSnapshot 载荷）。
//   债2 delta meta/data slice 分配——main 堆采样（slice 栈）+ GC 观测 + 池账计数器。
//   债3 R/G/B 结果数组（worker 每帧 ~75KB transfer 后弃）——worker 堆采样
//       （processBlurAndPresent 栈）+ GC 观测 + 池账计数器。
// PHASE=timing（默认）| hash | all
//   timing: send 计时分桶（full/delta）+ 克隆/扁平微基准 + main GC 观测 + main 堆采样
//           + worker 堆采样（CDP HeapProfiler）。判定债1收益/债2/3 池化前基线。
//   hash:   位级对拍序列——钉 Math.random（installPinnedRandom）+ 钉 hourly +
//           冻结日钟 + 干燥无笼区域 + 下坠脚本,逐 rAF 采 (posted,results,公共面 hash)
//           settled 样本。PRE/POST 两跑同 key 比对=池化零行为漂移判据。
// 用法: SW_ORIGIN=http://localhost:5219 node tools/run-diag.mjs --timeout=280000 \
//         scripts/_lw-pool-verdict-probe.mjs [phase] [tag]
import { launchBrowser, openPage, gotoApp, cleanStorage, waitForBridge, ackWelcome, carryQuery, createGame,
  nextFrame, installPinnedRandom, godMode, __clockFreezeInPage } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const PHASE = process.env.PROBE_PHASE || 'timing';
const TAG = process.env.PROBE_TAG || 'run';
const QUERY = process.env.PROBE_QUERY || '';   // 附加 URL 参数（如 lightworker=0 降级链验证）
const SEED = '05162020';

console.error(`[probe] origin=${ORIGIN} phase=${PHASE} tag=${TAG}`);
const browser = await launchBrowser({});
const page = await openPage(browser, {});
installPinnedRandom(page, 20260925);
const warns = [];
page.on('console', (m) => {
  const t = m.text?.() ?? '';
  if (m.type?.() === 'error') warns.push(t.slice(0, 160));
});
page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 160)));
console.error('[probe] goto...');
await page.goto(`${ORIGIN}/?pbust=${Date.now()}${QUERY ? '&' + QUERY : ''}`, { waitUntil: 'domcontentloaded' });
// ★本机 5219 冷实例定谳:clean 前多一次 gotoApp（首启 SW 注册/缓存写入）会让
// reload 后 bridge 永不到场（对照实验 /tmp/lw-diag4 全绿）——boot 序严格取
// diag4 同款:goto→clean→reload→bridge→ack（lib bootstrap() 多一次 gotoApp,挂起）。
// ★BJ95 口径:reload 透传入口查询串（?lightworker=0 等旗否则被洗掉=静默失明）。
const carried = carryQuery(page.url?.() ?? '');
await cleanStorage(page, { welcomeAck: true }).catch(() => null);
let bridged = false;
for (let attempt = 0; attempt < 3 && !bridged; attempt++) {
  if (!(await gotoApp(page, ORIGIN, { tries: 40, extraQuery: carried }))) { console.log('bootstrap FAIL: reload'); process.exit(1); }
  console.error(`[probe] waitForBridge#${attempt}...`);
  bridged = await waitForBridge(page, { timeout: 60_000 });
}
if (!bridged) { console.log('bootstrap FAIL: bridge', JSON.stringify(warns.slice(0, 10))); process.exit(1); }
await ackWelcome(page, true);
console.error('[probe] createGame...');
const gen = await createGame(page, { mode: 'direct', seed: SEED, size: 'small' });
console.error('[probe] createGame=', gen.ok, gen.why ?? '');
if (!gen.ok) { console.log('createGame FAIL:', gen.why); process.exit(1); }
console.error('[probe] game ready');

// 钉 hourly（wall-clock 单源 GameTime → 跨运行漂移源;实例自有属性遮蔽 getter=parity 同款）
// + 冻结日钟（timeOfDay 恒定 → 天空光恒定）。全部在 warmup 前装。
await page.evaluate(() => {
  const L = window.__swGame.lighting;
  const fk = L.clock;
  Object.defineProperty(fk, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
});
await page.evaluate(__clockFreezeInPage, { tod: 0.5 });
await godMode(page, true);

// 区域液体/水母笼普查（位级对拍前提:干燥+无笼 → worker 侧 Math.random 零消费）
const census = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const L = g.lighting;
  const rx = Math.max(0, L.rx - 20), ry = Math.max(0, L.ry - 20);
  const rw = Math.min(st.w, L.rx + L.rw + 20) - rx, rh = Math.min(st.h, L.ry + L.rh + 20) - ry;
  let liquid = 0, cage = 0;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const i = y * st.w + x;
      if (st.liquid[i] > 0) liquid++;
      if (st.type[i] === 316 || st.type[i] === 317 || st.type[i] === 318) cage++;
    }
  }
  return { liquid, cage, rx, ry, rw, rh };
});
console.log(`CENSUS ${JSON.stringify(census)}`);

for (let i = 0; i < 150; i++) await nextFrame(page);   // warmup → live
const live = await page.evaluate(() => {
  const s = window.__swGame.lighting._lw;
  return { results: s?.results ?? -1, posted: s?.posted ?? -1 };
});
console.error(`[probe] warmup done results=${live.results}`);

if (PHASE === 'timing' || PHASE === 'all') {
  // ---- 计时/堆采样阶段 ----
  const client = await page.createCDPSession();
  await client.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
  await client.send('Performance.enable');

  // send 计时分桶 + GC 观测（页内）
  await page.evaluate(() => {
    const link = window.__swGame.lighting._lw;
    const orig = link.send.bind(link);
    globalThis.__sendSamples = [];
    link.send = (m) => {
      const t0 = performance.now();
      orig(m);
      globalThis.__sendSamples.push({ t: performance.now() - t0, full: m.tiles.type.length > 0 });
    };
    globalThis.__gcStats = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) globalThis.__gcStats.push({ d: e.duration });
    }).observe({ type: 'gc' });
  });

  // ① 静置段（idle 5s:稳态空 delta 帧）
  for (let i = 0; i < 300; i++) await nextFrame(page);

  // ② 下坠段（上移 48 格 → 自由落体 ~1.5s:移动 delta 帧+区域平移;god 模式无视摔伤）
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.y -= 48 * 16;
    g.player.vy = 0;
    if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
  });
  for (let i = 0; i < 180; i++) await nextFrame(page);

  const sendStats = await page.evaluate(() => {
    const s = globalThis.__sendSamples;
    const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.5)] : -1;
    const p = (a, q) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length * q)] : -1;
    const idle = s.filter((v) => !v.full).map((v) => v.t);
    const full = s.filter((v) => v.full).map((v) => v.t);
    const gc = globalThis.__gcStats;
    return {
      sendIdleN: idle.length, sendIdleP50: +med(idle).toFixed(4), sendIdleP90: +p(idle, 0.9).toFixed(4),
      sendFullN: full.length, sendFullP50: +med(full).toFixed(4),
      gcN: gc.length, gcMs: +gc.reduce((a, b) => a + b.d, 0).toFixed(2),
    };
  });
  console.log(`SEND ${JSON.stringify(sendStats)}`);

  // main 堆采样（32KB 级:R/G/B 回达 75KB/帧可见;delta slice KB 级部分可见）
  const mainProf = await client.send('HeapProfiler.stopSampling');
  const mainAgg = aggregateProfile(mainProf.profile, ['slice', 'postMessage', 'buildEngineSnapshot', 'processBlurAndPresent', 'encodeDelta']);
  console.log(`MAINHEAP ${JSON.stringify(mainAgg)}`);

  // worker 堆采样（R/G/B 分配栈=processBlurAndPresent）
  const workers = page.workers();
  let workerAgg = { err: 'no-worker-targets', n: workers.length };
  for (const w of workers) {
    try {
      const url = w.url?.() ?? '';
      if (!/LightWorker/.test(url)) continue;
      const wc = w.client;
      await wc.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
      await new Promise((r) => setTimeout(r, 4000));
      const prof = await wc.send('HeapProfiler.stopSampling');
      workerAgg = aggregateProfile(prof.profile, ['processBlurAndPresent', 'decode', 'allocSliceChannels', 'exportTo']);
      workerAgg.url = url.slice(0, 80);
      break;
    } catch (e) { workerAgg = { err: String(e).slice(0, 120) }; }
  }
  console.log(`WORKERHEAP ${JSON.stringify(workerAgg)}`);

  // 信封克隆微基准（真实 buildEngineSnapshot 载荷;structuredClone=postMessage 序列化原语,
  // 免 worker 调度噪声）:克隆臂(number[][]) vs 扁平臂(Float64Array) vs 无 per/buffs 底座;
  // 另加合成 30 buff + 10 per 压力臂——战斗最坏情形量级
  const envBench = await page.evaluate(async () => {
    const WP = await import('/src/lighting/LightWorkerProtocol.ts');
    const g = window.__swGame;
    const L = g.lighting;
    const tiles = WP.sliceGeometry({ w: 0, h: 0, showInvisibleBlocks: false }, 0, 0, 0, 0);
    const cap = {
      rx: L.rx, ry: L.ry, rw: L.rw, rh: L.rh,
      world: L.world, flicker: L.clock, heldLight: L.heldLight, buffLights: L.buffLights,
      perFrame: L.perFrame, decay: null,
    };
    const real = WP.buildEngineSnapshot(cap, tiles, 0);
    const mkFlat = (msg) => {
      const perFlat = new Float64Array(msg.per.length * 5);
      msg.per.forEach((a, i) => { perFlat.set(a, i * 5); });
      const buffsFlat = new Float64Array(msg.buffs.length * 5);
      msg.buffs.forEach((a, i) => { buffsFlat.set(a, i * 5); });
      return { ...msg, per: perFlat, buffs: buffsFlat };
    };
    // 合成压力臂:30 buffs + 10 per
    const busyCap = { ...cap, buffLights: Array.from({ length: 30 }, (_, i) => ({ tx: i, ty: i, r: 0.5, g: 0.4, b: 0.3 })), perFrame: Array.from({ length: 10 }, (_, i) => ({ x: i, y: i, r: 1, g: 1, b: 1 })) };
    const busy = WP.buildEngineSnapshot(busyCap, tiles, 0);
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.5)];
    const p90 = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.9)];
    const bench = (build) => {
      const ts = [];
      for (let i = 0; i < 2000; i++) {
        const m = build();
        const t0 = performance.now();
        structuredClone(m);
        ts.push(performance.now() - t0);
      }
      ts.sort((x, y) => x - y);
      return { p50: +med(ts).toFixed(4), p90: +p90(ts).toFixed(4), mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(4) };
    };
    return {
      realN: { per: real.per.length, buffs: real.buffs.length },
      cloneReal: bench(() => ({ ...real })),
      flatReal: bench(() => mkFlat(real)),
      nonePB: bench(() => ({ ...real, per: [], buffs: [] })),
      cloneBusy: bench(() => ({ ...busy })),
      flatBusy: bench(() => mkFlat(busy)),
      flatAllocOnly: (() => { const t0 = performance.now(); for (let i = 0; i < 2000; i++) mkFlat(busy); return +((performance.now() - t0) / 2000).toFixed(4); })(),
    };
  });
  console.log(`ENVELOPE ${JSON.stringify(envBench)}`);

  // 池账/结果链计数（现状基线）
  const stats = await page.evaluate(async () => {
    const lw = await import('/src/lighting/LightWorkerLink.ts');
    return lw.lightWorkerStats();
  });
  console.log(`LWSTAT ${JSON.stringify(stats)}`);
}

if (PHASE === 'degrade') {
  // ---- ?lightworker=0 降级链（逃生门语义不变:本地路径,链路零 Spawn,无 falls） ----
  for (let i = 0; i < 90; i++) await nextFrame(page);
  const deg = await page.evaluate(async () => {
    const lw = await import('/src/lighting/LightWorkerLink.ts');
    const g = window.__swGame;
    const L = g.lighting;
    const s = lw.lightWorkerStats();
    return {
      on: s.on, posted: s.posted, results: s.results, falls: s.falls, respawns: s.respawns,
      pairOk: L.rw * L.rh === L.r.length,
      skyLight: L.lightAt(Math.floor(L.rx + L.rw / 2), Math.max(0, L.ry - 10))[0],
      anyLight: (() => { let m = 0; for (let i = 0; i < L.r.length; i += 97) if (L.r[i] > m) m = L.r[i]; return m; })(),
      workerLink: L._lw === null,
    };
  });
  console.log(`DEGRADE ${JSON.stringify(deg)}`);
}

if (PHASE === 'hash' || PHASE === 'all') {
  // ---- 位级对拍序列（零重插桩:只读公共面+lwStat） ----
  // 下坠脚本:静置 2s → 上移 48 格自由落体 ~3s → 静置 2s。
  // settled 判据:results===posted（在途清零）同步快照——内容=「posted 次快照的结果」
  // 确定性函数（钉随机/钉 hourly/冻结日钟/干燥无笼区域前提下）。
  const hashes = await page.evaluate(async () => {
    const g = window.__swGame;
    const L = g.lighting;
    // ---- 干燥无笼落点搜索（位级对拍前提:worker 侧 Math.random 零消费面）----
    // 扫描玩家周围 320×160 格,找「快照窗 ±20 带」内零液体零水母笼的中心,teleport 过去。
    const st0 = g.world.store;
    const dryOK = (cx, cy) => {
      const rx = Math.max(0, cx - 110), ry = Math.max(0, cy - 95);
      const rw = Math.min(st0.w, cx + 110) - rx, rh = Math.min(st0.h, cy + 95) - ry;
      for (let y = ry; y < ry + rh; y++) {
        for (let x = rx; x < rx + rw; x++) {
          const i = y * st0.w + x;
          if (st0.liquid[i] > 0) return false;
          const t = st0.type[i];
          if (t === 316 || t === 317 || t === 318) return false;
        }
      }
      return true;
    };
    let placed = false;
    const px0 = Math.floor(g.player.cx / 16), py0 = Math.floor(g.player.cy / 16);
    for (let r = 0; r < 15 && !placed; r++) {
      for (let dx = -r; dx <= r && !placed; dx += 4) {
        for (let dy = -r; dy <= r && !placed; dy += 4) {
          const cx = px0 + dx * 4, cy = py0 + dy * 4;
          if (cx < 60 || cy < 20 || cx > st0.w - 60 || cy > st0.h - 40) continue;
          if (dryOK(cx, cy)) {
            g.player.x = cx * 16; g.player.y = (cy - 4) * 16;
            g.player.vx = 0; g.player.vy = 0;
            if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
            placed = true;
          }
        }
      }
    }
    const fnv = (h, u8) => { for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
    const hashPublic = () => {
      let h = 0x811c9dc5;
      h = fnv(h, new Uint8Array(Float64Array.of(L.rx, L.ry, L.rw, L.rh).buffer));
      h = fnv(h, L.r); h = fnv(h, L.g); h = fnv(h, L.b);
      return h;
    };
    const lw = L._lw;
    // posted/results 在 lwStat 闭包——经 lightWorkerStats 读
    const W = await import('/src/lighting/LightWorkerLink.ts');
    const stat = () => W.lightWorkerStats();
    const samples = [];
    const settleHash = () => {
      const s = stat();
      if (s.results === s.posted && s.posted > 0) {
        const key = s.posted;
        const last = samples[samples.length - 1];
        if (!last || last.k !== key) samples.push({ k: key, h: hashPublic(), lag: s.lagMs });
      }
    };
    const pumpN = async (n) => { for (let i = 0; i < n; i++) { await new Promise((r) => requestAnimationFrame(r)); settleHash(); } };
    const waitSettle = async (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { await new Promise((r) => setTimeout(r, 4)); settleHash(); } };
    await waitSettle(500);
    await pumpN(60);                       // 静置段 1
    await waitSettle(300);
    g.player.y -= 48 * 16; g.player.vy = 0;  // 自由落体段
    if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    await pumpN(200);
    await waitSettle(300);
    await pumpN(60);                       // 静置段 2
    await waitSettle(300);
    const fin = stat();
    let liquid = 0, cage = 0;
    const st = g.world.store;
    for (let y = Math.max(0, L.ry - 4); y < Math.min(st.h, L.ry + L.rh + 4); y++)
      for (let x = Math.max(0, L.rx - 4); x < Math.min(st.w, L.rx + L.rw + 4); x++) {
        const i = y * st.w + x;
        if (st.liquid[i] > 0) liquid++;
        const t = st.type[i];
        if (t === 316 || t === 317 || t === 318) cage++;
      }
    return { samples, finalStat: fin, liquid, cage, placed, god: g.player.debugGod === true };
  });
  console.log(`HASH ${JSON.stringify({ tag: TAG, n: hashes.samples.length, liquid: hashes.liquid, cage: hashes.cage, placed: hashes.placed, finalStat: hashes.finalStat, samples: hashes.samples })}`);
}

console.log(`WARNS ${JSON.stringify(warns.slice(0, 12))}`);
await browser.close();
process.exit(0);

// ---- 堆采样树聚合（selfSize 按函数名过滤聚合） ----
function aggregateProfile(profile, keywords) {
  let total = 0;
  const byFn = new Map();
  const walk = (node) => {
    total += node.selfSize ?? 0;
    if (node.selfSize > 0 && node.callFrame?.functionName) {
      const fn = node.callFrame.functionName;
      for (const k of keywords) {
        if (fn.includes(k)) { byFn.set(fn, (byFn.get(fn) ?? 0) + node.selfSize); break; }
      }
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(profile.head);
  const entries = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([fn, b]) => `${fn}=${(b / 1048576).toFixed(2)}MB`);
  return { totalMB: +(total / 1048576).toFixed(2), hit: entries };
}
