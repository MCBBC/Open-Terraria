#!/usr/bin/env node
// IIII250 探针:equipStats 缓存全消费面对齐 前后对账仪。
//   ① CPU 采样(Profiler.setSamplingInterval=100µs)下跑「雨+行走+攻击」20s 场景,
//      提取 equipStats 家族(equipStatsKey / get equipStats / computeEquipStats)
//      self-time 与 top-N——对账目标:after 家族 self-time ≈0。
//   ② Performance.getMetrics before/after 场景差(Nodes/JSHeapUsedSize/JSEventListeners/
//      Documents)——CppGC/DOM 垃圾源定谳(每帧文本/UI 重建嫌疑)。
//   ③ getter 微基准:200k 次缓存命中路径访问(p.equipStats.def)——键重建单价的
//      直接测量,跨构建可比(生产 dev 皆可)。
//   ④ 访问/重算计数器:实例级 own-property getter 覆盖,统计场景内 equipStats
//      访问总数与重算次数(对象身份变化)——缓存纪律语义守恒证据。
// 用法:
//   node tools/probe.mjs run scripts/_iii250-equip-perf.mjs --vite=5300 --tag=after --out=/tmp/iii250-out/after
//   SW_ORIGIN=http://localhost:4173 node tools/probe.mjs run scripts/_iii250-equip-perf.mjs --vite=off --tag=before --out=/tmp/iii250-out/before
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode } from '../tools/probe/lib/game.mjs';
import { setWeather } from '../tools/probe/lib/perf-scenarios.mjs';

function argVal(name, dflt = null) {
  const i = process.argv.indexOf(name);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const j = process.argv.findIndex((a) => a.startsWith(name + '='));
  return j !== -1 ? process.argv[j].slice(name.length + 1) : dflt;
}
const TAG = argVal('--tag', 'run');
const OUT = argVal('--out', '/tmp/iii250-out/' + TAG);
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5300';
const SCEN_MS = Number(argVal('--scen-ms', '20000'));
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log('[iii250]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** CDP:Profiler + Performance.getMetrics 包裹任意场景执行 */
async function profiledScenario(page, runFn) {
  const client = await page.target().createCDPSession();
  await client.send('Performance.enable');
  const m0 = (await client.send('Performance.getMetrics')).metrics;
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 100 });
  await client.send('Profiler.start');
  const extra = await runFn();
  const { profile } = await client.send('Profiler.stop');
  const m1 = (await client.send('Performance.getMetrics')).metrics;
  await client.detach().catch(() => {});
  return { profile, m0, m1, extra };
}

/** profile → 每 functionName 的 sample 计数与 self-time(中位 delta 加权) */
function analyzeProfile(profile) {
  const nodesById = new Map();
  for (const n of profile.nodes) nodesById.set(n.id, n);
  const parentOf = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id);
  const fnOf = (id) => nodesById.get(id)?.callFrame?.functionName || '(unknown)';
  const cnt = new Map();
  for (const s of profile.samples) cnt.set(s, (cnt.get(s) || 0) + 1);
  const ds = profile.timeDeltas.filter((d) => d > 0).sort((a, b) => a - b);
  const med = ds.length ? ds[ds.length >> 1] : 1000;
  const byFn = new Map();
  for (const [id, c] of cnt) {
    const f = fnOf(id);
    byFn.set(f, (byFn.get(f) || 0) + c);
  }
  const total = profile.samples.length;
  const selfMs = (c) => (c * med) / 1000;
  // caller attribution for get equipStats
  const callers = new Map();
  for (const [id, c] of cnt) {
    if (fnOf(id) !== 'get equipStats') continue;
    let cur = id, guard = 0;
    while (guard++ < 200) {
      cur = parentOf.get(cur);
      if (cur === undefined) break;
      const pf = fnOf(cur);
      if (pf === 'get equipStats' || pf === 'equipStatsKey' || pf === 'computeEquipStats') continue;
      callers.set(pf, (callers.get(pf) || 0) + c);
      break;
    }
  }
  const famRe = /equipStats/;
  const fam = {};
  for (const [f, c] of byFn) if (famRe.test(f)) fam[f] = { samples: c, selfMs: +selfMs(c).toFixed(1) };
  const famSamples = Object.values(fam).reduce((a, x) => a + x.samples, 0);
  const top = [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 18)
    .map(([f, c]) => ({ fn: f, samples: c, selfMs: +selfMs(c).toFixed(1) }));
  return {
    totalSamples: total,
    medianDeltaUs: med,
    wallMs: +((profile.endTime - profile.startTime) / 1000).toFixed(0),
    family: fam,
    familySharePct: +((famSamples / total) * 100).toFixed(3),
    familySelfMs: +selfMs(famSamples).toFixed(1),
    callersOfGetter: [...callers].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([f, c]) => ({ fn: f, samples: c, selfMs: +selfMs(c).toFixed(1) })),
    top,
  };
}

const METRICS_OF = ['Nodes', 'Documents', 'JSEventListeners', 'JSHeapUsedSize', 'JSHeapTotalSize', 'Frames', 'LayoutCount', 'RecalcStyleCount'];
function metricDelta(m0, m1) {
  const a = new Map(m0.map((x) => [x.name, x.value]));
  const b = new Map(m1.map((x) => [x.name, x.value]));
  const out = {};
  for (const k of METRICS_OF) out[k] = { before: a.get(k) ?? null, after: b.get(k) ?? null, delta: (b.get(k) ?? 0) - (a.get(k) ?? 0) };
  return out;
}

async function main() {
  const browser = await launchBrowser({ extraArgs: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  let result = { tag: TAG, origin: ORIGIN, scenMs: SCEN_MS };
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);
    await godMode(page, true);
    await setWeather(page, { rain: true });

    // ---- ③ 微基准(命中路径单价) ----
    const micro = await page.evaluate(() => {
      const p = window.__swGame.player;
      for (let i = 0; i < 2000; i++) p.equipStats;   // 预热 JIT
      const t0 = performance.now();
      let acc = 0;
      for (let i = 0; i < 200000; i++) acc += p.equipStats.def;
      const t1 = performance.now();
      // 多字段读模式(get aggro 同款:同一函数 4 次访问)
      const t2 = performance.now();
      let acc2 = 0;
      for (let i = 0; i < 50000; i++) {
        acc2 += p.equipStats.shroomiteSet ? 1 : 0;
        acc2 += p.equipStats.vortexSet ? 1 : 0;
        acc2 += p.equipStats.aggroAcc;
        acc2 += p.equipStats.aggroPiece;
      }
      const t3 = performance.now();
      return { hit200kMs: +(t1 - t0).toFixed(1), hitNsPerAccess: +(((t1 - t0) * 1e6) / 200000).toFixed(0), fourField50kMs: +(t3 - t2).toFixed(1), sanity: acc + acc2 };
    });
    result.micro = micro;
    log('micro:', JSON.stringify(micro));

    // ---- ④ 访问/重算计数器(--no-counter 时跳过,免仪器自身开销混入 family) ----
    const NOCOUNTER = process.argv.includes('--no-counter');
    if (!NOCOUNTER) await page.evaluate(() => {
      const p = window.__swGame.player;
      const proto = Object.getPrototypeOf(Object.getPrototypeOf(p) ? p : p);
      const pd = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(p), 'equipStats')
        || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(p)), 'equipStats');
      if (!pd || !pd.get) { window.__eqCounterBroken = true; return; }
      let last = null;
      window.__eqStats = { accesses: 0, recomputes: 0 };
      Object.defineProperty(p, 'equipStats', {
        configurable: true,
        get() {
          const v = pd.get.call(this);
          window.__eqStats.accesses++;
          if (v !== last) { window.__eqStats.recomputes++; last = v; }
          return v;
        },
      });
    });
    await page.evaluate(() => { if (window.__eqStats) { window.__eqStats.accesses = 0; window.__eqStats.recomputes = 0; } });

    // ---- ①+② 场景:雨中行走+攻击,20s,CPU 采样+Performance 指标 ----
    const { profile, m0, m1, extra } = await profiledScenario(page, async () => {
      const scen = page.keyboard;
      await page.mouse.move(640, 400);
      const tEnd = Date.now() + SCEN_MS;
      let dir = 1, nextAttack = Date.now() + 400;
      while (Date.now() < tEnd) {
        const now = Date.now();
        // 每 1.5s 换向(D/←→ 键位:KeyD=右,KeyA=左)
        if (dir === 1) { await scen.down('KeyD'); await scen.down('KeyW'); }
        else { await scen.down('KeyA'); await scen.up('KeyD'); }
        await sleep(1400);
        await scen.up(dir === 1 ? 'KeyD' : 'KeyA');
        if (dir === 1) await scen.up('KeyW');
        dir = -dir;
        // 攻击脉冲(左键按下 120ms → updateSwingHits/useCombatWeapon 路径)
        if (now > nextAttack) {
          await page.mouse.down();
          await sleep(120);
          await page.mouse.up();
          nextAttack = now + 500;
        }
      }
      // 收尾清键
      await scen.up('KeyD').catch(() => {}); await scen.up('KeyA').catch(() => {}); await scen.up('KeyW').catch(() => {});
      await page.mouse.up().catch(() => {});
      return page.evaluate(() => ({
        counters: window.__eqStats ?? null,
        counterBroken: !!window.__eqCounterBroken,
        raining: !!window.__swGame?.world?.weather?.raining,
        playerX: Math.round(window.__swGame?.player?.x ?? -1),
        frame: window.__swGame?.frame ?? window.__swGame?.tickCount ?? null,
      }));
    });
    result.scenarioEcho = extra;
    result.counters = extra.counters;
    result.profile = analyzeProfile(profile);
    result.metricsDelta = metricDelta(m0, m1);
    // 采样采样期间 raining 确认
    log('raining:', extra.raining, 'counters:', JSON.stringify(extra.counters));
    log('family:', JSON.stringify(result.profile.family), 'share%:', result.profile.familySharePct);
    log('metrics:', JSON.stringify(result.metricsDelta));

    writeFileSync(join(OUT, `equip-perf-${TAG}.json`), JSON.stringify(result, null, 2));
    writeFileSync(join(OUT, `profile-${TAG}.cpuprofile`), JSON.stringify(profile));
    log('written', join(OUT, `equip-perf-${TAG}.json`));
  } finally {
    await closeAllBrowsers();
  }
  const famMs = result.profile?.familySelfMs ?? -1;
  const share = result.profile?.familySharePct ?? 100;
  const microNs = result.micro?.hitNsPerAccess ?? 1e9;
  // 通过线:family share <0.6% 且命中路径 <700ns(IIIII250 目标:雨中行走路径 self-time ≈0)
  process.exit(famMs >= 0 && share < 0.6 && microNs < 700 ? 0 : 2);
}
// ★probe.mjs 子进程契约:import 必须阻塞到场景完结(顶层 await)——非 await 的
//  main().catch() 会让 import 提前 resolve,踩中子进程 500ms/10s 兜底强退刀
try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
