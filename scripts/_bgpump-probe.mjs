// ★后台 tick 泵验收探针（2026-09-28;用户需求:后台挂机——切后台 rAF 停发=世界冻结）。
// 机制级仿真：真实后台=①rAF 停发 ②document.hidden=true ③worker/setInterval 照跑。
// 探针用「rAF 链闭闸（回调入队不执行）+ document.hidden getter 覆写」复现 ①②，
// 泵 worker 的 250ms 定时照跑=③——三条件与真实后台同构,且 rAF 停转可逆（真实后台
// 回前台 rAF 恢复=复闸放行队列）。
// 量面：
//   A 前台基线     tick≈60/s;泵 worker 装配
//   B 前台泵竞态   可见态直呼泵消息 → tick/acc/lastTime 零变化=严格无痕门
//   C 后台接管     闭闸+仿真 hidden 5s → tick 推进≈300(实时推进);acc<1tick(累计
//                  不爆发);lastTime 新鲜(单一时间权威);光照 worker posted/results
//                  对账+falls=0+live 门零出场;波场 wwActive 保持(零请求=零证据面)
//   D 回前台交接   复闸+恢复可见 → 2s 窗 tick≈120(零爆发零双计,首帧 ≤5 钳平滑)
//   E 暂停尊重     后台+paused=true → 冻结;解暂停 → 恢复
//   F 设置关       backgroundRun=off → 后台冻结(旧行为);复开 → 恢复
//   G entry freeze 后台冻结帧面  beginEntryFreeze 后台 → tick 冻结+激活数增长
//                  (泵驱动冻结帧面)+deadline 后台照常解冻 → tick 恢复
// 运行：
//   SW_ORIGIN=http://localhost:5257 node tools/run-diag.mjs --timeout=600000 \
//     scripts/_bgpump-probe.mjs [--out /tmp/bgpump/xxx] [--seed 05162020]
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { bootstrap, gotoApp, waitForBridge } from '../tools/probe/lib/boot.mjs';
import { sizeDims } from '../tools/probe/lib/env.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const argOf = (k, dflt) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const OUT = argOf('--out', `/tmp/bgpump/run-${Date.now()}`);
const SEED = argOf('--seed', '05162020');
const SOAK_MS = Number(argOf('--soak-ms', '5000'));   // C 段后台时长;--soak-ms=300000 = 5 分钟挂机 soak

// ---- 页内仪器（一次性安装）----
const INSTALL = () => {
  window.__bg = { log: [], phases: {}, errs: [] };

  // ①document.hidden 仿真（处理时刻现场读——Game.onPumpMsg 直读该 getter）
  let origHiddenDesc = null;
  window.__setHidden = (h) => {
    if (h && !origHiddenDesc) {
      origHiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    } else if (!h && origHiddenDesc) {
      delete document.hidden;   // 落回原型 getter
      origHiddenDesc = null;
    }
    return document.hidden;
  };

  // ②rAF 链闸（闭闸=回调入队不执行≈真实后台 rAF 停发;复闸=放行队列重建链）
  let origRaf = null; let rafQ = [];
  window.__rafGate = (close) => {
    if (close && !origRaf) {
      origRaf = window.requestAnimationFrame.bind(window);
      rafQ = [];
      window.requestAnimationFrame = (cb) => { rafQ.push(cb); return rafQ.length; };
    } else if (!close && origRaf) {
      const q = rafQ; const orig = origRaf;
      window.requestAnimationFrame = orig;
      origRaf = null; rafQ = [];
      q.forEach((cb) => { try { orig(cb); } catch (e) { window.__bg.errs.push(String(e)); } });
    }
    return !!origRaf;
  };

  // ③健康快照（光照 worker/波场/泵诊断面）
  window.__health = async () => {
    const g = window.__swGame;
    const lw = await import('/src/lighting/LightWorkerLink.ts');
    const le = await import('/src/lighting/LightingEngine.ts');
    const ww = await import('/src/render/WaterWaves.ts');
    const s = lw.lightWorkerStats();
    return {
      tick: g.tickCount, acc: g.acc, lastTime: g.lastTime, paused: g.paused,
      bgTicks: g.bgPumpTicks, bgActs: g.bgPumpActivations,
      pumpWorker: !!g.pumpWorker,
      light: { on: s.on, posted: s.posted, results: s.results, falls: s.falls, respawns: s.respawns ?? -1 },
      live: le.lightGateDiag.live, exitReason: le.lightGateDiag.exitReason,
      wwActive: ww.waterWaves.wwActive(),
      now: performance.now(),
    };
  };

  // ④tick 速率采样（setTimeout 驱动——rAF 闸闭时仍工作）
  window.__tickRate = (ms) => new Promise((res) => {
    const g = window.__swGame;
    const t0 = performance.now(); const k0 = g.tickCount;
    const iv = setInterval(() => {
      if (performance.now() - t0 >= ms) {
        clearInterval(iv);
        res({ ms: Math.round(performance.now() - t0), ticks: g.tickCount - k0, rate: Math.round((g.tickCount - k0) * 1000 / (performance.now() - t0)) });
      }
    }, 100);
  });

  window.__opt = async (k, v) => {
    const m = await import('/src/core/Options.ts');
    await m.options.set(k, v);
  };
  window.__err = () => {
    const ring = (window).__swErrors;
    return Array.isArray(ring) ? ring.length : -1;
  };
};

async function main() {
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser({});
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const R = { phases: {}, pageErrors: null };

  await bootstrap(page, ORIGIN);
  if (!(await gotoApp(page, ORIGIN, { extraQuery: '?lightworker=1', tries: 30 }))) {
    console.error('goto failed');
    await browser.close();
    process.exit(1);
  }
  await waitForBridge(page);
  await page.evaluate(INSTALL);
  const [W, H] = sizeDims('small');
  await page.evaluate(({ seed, w, h }) => { void window.__swFlow.newWorld(seed, w, h); }, { seed: SEED, w: W, h: H });

  // 两开关置位（缺省 backgroundRun=on;playWhenUnfocused=off→开。options.set 持久化
  // 落探针新 profile 的 IndexedDB,不污染真机档）
  await page.evaluate(() => window.__opt('backgroundRun', true));
  await page.evaluate(() => window.__opt('playWhenUnfocused', true));

  // 等世界就绪+入场冻结窗结束
  await page.waitForFunction(() => {
    const g = window.__swGame;
    return g && g.world && g.player && !g.entryFreezeActive && g.tickCount > 60 && !g.paused;
  }, { timeout: 120000 });

  // ---- A 前台基线 ----
  R.phases.A = await page.evaluate(async () => {
    const h0 = await window.__health();
    const rate = await window.__tickRate(1500);
    const h1 = await window.__health();
    return { pumpWorker: h1.pumpWorker, rate, bgTicks0: h1.bgTicks, lightOn: h1.light.on, ww: h1.wwActive, live: h1.live, exit: h1.exitReason };
  });

  // ---- B 前台泵竞态（rAF 闭闸隔离——可见态无 rAF 推进,泵消息=唯一潜在驱动）----
  R.phases.B = await page.evaluate(async () => {
    const g = window.__swGame;
    window.__rafGate(true);
    await new Promise((r) => setTimeout(r, 120));   // 放过渡帧:闭闸前已排队的 straggler 跑完再取基线
    const h0 = await window.__health();
    for (let i = 0; i < 3; i++) {
      g.pumpWorker.onmessage(new MessageEvent('message', { data: { op: 'pump', t: Date.now() } }));
      await new Promise((r) => setTimeout(r, 30));
    }
    const h1 = await window.__health();
    window.__rafGate(false);
    return {
      tickUnchanged: h0.tick === h1.tick, accUnchanged: Math.abs(h0.acc - h1.acc) < 1e-12,
      lastTimeUnchanged: h0.lastTime === h1.lastTime, actsUnchanged: h0.bgActs === h1.bgActs,
    };
  });

  // ---- C 后台接管（rAF 闭闸+仿真 hidden;泵 250ms 照跑;--soak-ms 延长=挂机 soak）----
  R.phases.C = await page.evaluate(async (soakMs) => {
    const g = window.__swGame;
    const h0 = await window.__health();
    // soak 连续性锚:世界演化前态（敌怪首只坐标/敌怪数/世界时钟）
    const worldSnap = () => ({
      clock: Math.round((g.world.clock?.timeOfDay ?? -1) * 1e6) / 1e6,
      enemyN: g.entities?.enemies?.length ?? -1,
      enemy0: g.entities?.enemies?.[0] ? [Math.round(g.entities.enemies[0].x), Math.round(g.entities.enemies[0].y), g.entities.enemies[0].hp] : null,
    });
    const world0 = worldSnap();
    window.__rafGate(true);
    window.__setHidden(true);
    const t0 = performance.now();
    const rates = [];   // soak:每 10s 一采
    while (true) {
      const step = Math.min(10000, soakMs - (performance.now() - t0));
      if (step <= 0) break;
      const k0 = g.tickCount; const s0 = performance.now();
      await new Promise((r) => setTimeout(r, step));
      rates.push(Math.round((g.tickCount - k0) * 1000 / (performance.now() - s0)));
    }
    const h1 = await window.__health();
    const dTicks = h1.tick - h0.tick;
    const ms = h1.now - t0;
    const world1 = worldSnap();
    return {
      dTicks, ms, rate: Math.round(dTicks * 1000 / ms), rates,
      soakMinRate: Math.min(...rates), soakMaxRate: Math.max(...rates),
      bgActs: h1.bgActs - h0.bgActs, bgTicks: h1.bgTicks - h0.bgTicks,
      accBounded: Math.abs(h1.acc) < 1 / 60 + 1e-9,
      lastTimeFresh: h1.now - h1.lastTime < 600,
      lightPostedD: h1.light.posted - h0.light.posted,
      lightResultsD: h1.light.results - h0.light.results,
      fallsD: h1.light.falls - h0.light.falls,
      live: h1.live, exit: h1.exitReason, ww: h1.wwActive,
      worldEvolved: world1.clock !== world0.clock || world1.enemyN !== world0.enemyN
        || (world0.enemy0 !== null && world1.enemy0 !== null && (world1.enemy0[0] !== world0.enemy0[0] || world1.enemy0[2] !== world0.enemy0[2])),
      world0, world1,
    };
  }, SOAK_MS);
  R.phases.C0 = SOAK_MS;

  // ---- D 回前台交接（复闸+恢复可见;2s 窗零爆发零双计）----
  R.phases.D = await page.evaluate(async () => {
    window.__setHidden(false);
    window.__rafGate(false);
    await new Promise((r) => setTimeout(r, 400));
    const rate = await window.__tickRate(2000);
    const g = window.__swGame;
    return { rate, acc: Math.abs(g.acc), bgActsTotal: g.bgPumpActivations };
  });

  // ---- E 暂停尊重 ----
  R.phases.E = await page.evaluate(async () => {
    const g = window.__swGame;
    window.__rafGate(true);
    window.__setHidden(true);
    await new Promise((r) => setTimeout(r, 120));   // 过渡帧放行
    const h0 = await window.__health();
    g.paused = true;   // 手动暂停语义
    await new Promise((r) => setTimeout(r, 1500));
    const h1 = await window.__health();
    g.paused = false;
    await new Promise((r) => setTimeout(r, 1500));
    const h2 = await window.__health();
    window.__rafGate(false);
    window.__setHidden(false);
    return {
      dPausedTicks: h1.tick - h0.tick, actsPaused: h1.bgActs - h0.bgActs,
      resumedTicks: h2.tick - h1.tick, resumedActs: h2.bgActs - h1.bgActs,
    };
  });
  await new Promise((r) => setTimeout(r, 300));

  // ---- F 设置关=旧行为 ----
  R.phases.F = await page.evaluate(async () => {
    await window.__opt('backgroundRun', false);
    window.__rafGate(true);
    window.__setHidden(true);
    await new Promise((r) => setTimeout(r, 120));   // 过渡帧放行
    const h0 = await window.__health();
    await new Promise((r) => setTimeout(r, 1500));
    const h1 = await window.__health();
    await window.__opt('backgroundRun', true);
    await new Promise((r) => setTimeout(r, 1500));
    const h2 = await window.__health();
    window.__rafGate(false);
    window.__setHidden(false);
    return {
      dOffTicks: h1.tick - h0.tick, actsOff: h1.bgActs - h0.bgActs,
      resumedTicks: h2.tick - h1.tick, resumedActs: h2.bgActs - h1.bgActs,
    };
  });
  await new Promise((r) => setTimeout(r, 300));

  // ---- G entry freeze 后台冻结帧面 ----
  R.phases.G = await page.evaluate(async () => {
    const g = window.__swGame;
    window.__rafGate(true);
    window.__setHidden(true);
    await new Promise((r) => setTimeout(r, 120));   // 过渡帧放行
    const armed = g.beginEntryFreeze(2500);
    const h0 = await window.__health();
    await new Promise((r) => setTimeout(r, 1200));
    const h1 = await window.__health();
    await new Promise((r) => setTimeout(r, 2200));   // 越过 deadline(2.5s)
    const h2 = await window.__health();
    window.__rafGate(false);
    window.__setHidden(false);
    return {
      armed, frozenDuring: h1.tick === h0.tick, actsDuring: h1.bgActs - h0.bgActs,
      unfrozeByDeadline: !g.entryFreezeActive, resumedTicks: h2.tick - h1.tick,
    };
  });

  R.pageErrors = pageErrors.slice(0, 5);
  R.errRing = await page.evaluate(() => window.__err());
  fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify(R, null, 1));
  await browser.close();

  // ---- 判语 ----
  const A = R.phases.A, B = R.phases.B, C = R.phases.C, D = R.phases.D,
    E = R.phases.E, F = R.phases.F, G = R.phases.G;
  const checks = [];
  const add = (name, cond, extra = '') => { checks.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`); if (!cond) R.ok = false; };
  R.ok = true;
  add('A 泵 worker 装配', A.pumpWorker === true);
  add('A 前台基线 tick≈60/s', A.rate.rate >= 45 && A.rate.rate <= 75, `rate=${A.rate.rate}`);
  add('A 光照 worker 活(?lightworker=1)', A.lightOn === true, `on=${A.lightOn}`);
  add('A 波场 worker 活', A.ww === true);
  add('B 前台泵竞态零副作用(tick/acc/lastTime/激活数)', B.tickUnchanged && B.accUnchanged && B.lastTimeUnchanged && B.actsUnchanged);
  add('C 后台实时推进(≈60/s×时长)', C.dTicks >= SOAK_MS / 1000 * 60 * 0.6 && C.dTicks <= SOAK_MS / 1000 * 60 * 1.35, `dTicks=${C.dTicks} rate=${C.rate}`);
  add('C 泵激活≈时长/250ms', C.bgActs >= SOAK_MS / 250 * 0.7 && C.bgActs <= SOAK_MS / 250 * 2, `acts=${C.bgActs}`);
  add('C soak 分段速率稳定(每10s∈[45,80])', C.soakMinRate >= 45 && C.soakMaxRate <= 80, `min=${C.soakMinRate} max=${C.soakMaxRate}`);
  add('C 后台世界演化(挂机连续性:时钟/敌怪)', C.worldEvolved === true, `clock ${C.world0?.clock}→${C.world1?.clock} enemyN ${C.world0?.enemyN}→${C.world1?.enemyN}`);
  add('C 累计器有界(acc<1tick)', C.accBounded);
  add('C 单一时间权威(lastTime 新鲜<600ms)', C.lastTimeFresh);
  add('C 光照请求-回传对账(postedD==resultsD∨均0)', C.lightPostedD === C.lightResultsD, `postedD=${C.lightPostedD} resultsD=${C.lightResultsD}`);
  add('C 光照看门狗零误杀(falls 增量=0)', C.fallsD === 0, `fallsD=${C.fallsD}`);
  add('C 光照 live 门零出场', C.live === true && C.exit === null, `exit=${C.exit}`);
  add('C 波场保持(watchdog 零请求面)', C.ww === true);
  add('D 回前台 tick≈120/2s(零爆发零双计)', D.rate.rate >= 45 && D.rate.rate <= 75, `rate=${D.rate.rate}`);
  add('D 回前台泵保持惰性(激活数=C 段终值)', D.bgActsTotal === C.bgActs, `total=${D.bgActsTotal} cActs=${C.bgActs}`);
  add('E 暂停期冻结(泵尊重 paused;容闭闸过渡帧≤2)', E.dPausedTicks <= 2, `d=${E.dPausedTicks}`);
  add('E 解暂停后台恢复推进', E.resumedTicks >= 40, `d=${E.resumedTicks} acts=${E.resumedActs}`);
  add('F backgroundRun=off 后台冻结(旧行为;容过渡帧≤2)', F.dOffTicks <= 2, `d=${F.dOffTicks}`);
  add('F 复开后恢复推进', F.resumedTicks >= 40, `d=${F.resumedTicks} acts=${F.resumedActs}`);
  add('G entry freeze 后台 tick 冻结(冻结帧面)', G.armed === true && G.frozenDuring === true, `actsDuring=${G.actsDuring}`);
  add('G 泵驱动冻结帧(激活增长)', G.actsDuring > 0, `acts=${G.actsDuring}`);
  add('G deadline 后台照常解冻+恢复推进', G.unfrozeByDeadline === true && G.resumedTicks >= 25, `d=${G.resumedTicks}`);
  add('零页面异常', R.pageErrors.length === 0, `${R.pageErrors.length}`);

  fs.writeFileSync(`${OUT}/verdict.txt`, R.ok ? 'PASS' : 'FAIL');
  console.log(`\n==== 后台 tick 泵验收 ${R.ok ? '★ 全绿' : '✗ 有红'} → ${OUT}`);
  console.log(checks.join('\n'));
  console.log(`A=${JSON.stringify(A)}\nB=${JSON.stringify(B)}\nC=${JSON.stringify(C)}\nD=${JSON.stringify(D)}\nE=${JSON.stringify(E)}\nF=${JSON.stringify(F)}\nG=${JSON.stringify(G)}`);
  if (R.pageErrors.length) console.log(`pageErrors: ${R.pageErrors.join(' | ')}`);
  process.exit(R.ok ? 0 : 1);
}

// ★top-level await（wbake-promotion 同款）:run-diag 子进程按「import 完成=主体完成」
// 判定——fire-and-forget 调用会让 import 立即 resolve,child 500ms flush 定时器把
// 进行中的探针静默杀掉（run1/run2 空目录定谳）。必须 await 到收尾。
await main();
