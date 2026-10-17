// ★环境改造枪掉帧定量 v2（真实节律剂量）:spray=每弹每 tick 3 子步 convertArea
//   (size2/3)+每子步 1 尘;连发 3-6 弹同时在飞。模拟=每 tick 18 次 convertArea
//   (6 弹×3 子步,弹心沿各自轨迹)+18 尘,60 tick。读帧耗时/脏深度/烘焙账分解。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261017 });
await pump(page, 40);
await page.evaluate(() => {
  const g = window.__swGame;
  g.running = false;
  window.__pause = (v) => { g.paused = v; };
  window.__stats = () => {
    const ch = g.chunks;
    return {
      dirty: ch.dirtyQueue.length,
      pages: ch.wallPages.length,
      bakeClient: !!ch.bakeClient,
      workerAwait: ch.workerAwaiting.size,
      dustN: (g.vanillaDust?.each?.(true)?.length ?? -1),
    };
  };
});
await page.evaluate(() => window.__pause(true));
await page.evaluate(() => {
  for (let i = 0; i < 20; i++) {
    window.__vnow = (window.__vnow || performance.now()) + 16.7;
    window.__swGame.frame(window.__vnow);
  }
});
const base = await page.evaluate(() => {
  const g = window.__swGame;
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) { window.__vnow += 16.7; g.frame(window.__vnow); }
  return { ms: +(performance.now() - t0 / 1).toFixed(3), ...window.__stats() };
});
base.ms = base.ms / 30;
console.log('基线:', JSON.stringify(base));
// 分解臂 0:关键函数计时 hook（喷射期间累计墙钟）
await page.evaluate(() => {
  const g = window.__swGame;
  const ch = g.chunks;
  window.__prof = {};
  const wrap = (obj, name, key) => {
    const orig = obj[name];
    if (!orig) return;
    obj[name] = function (...a) {
      const t0 = performance.now();
      const r = orig.apply(this, a);
      const d = performance.now() - t0;
      window.__prof[key] = (window.__prof[key] || 0) + d;
      window.__prof[key + '#n'] = (window.__prof[key + '#n'] || 0) + 1;
      return r;
    };
  };
  wrap(Object.getPrototypeOf(ch), 'completeWorkerBake', 'bake回包落页');
  wrap(Object.getPrototypeOf(ch), 'flushDirty', 'flushDirty');
  wrap(Object.getPrototypeOf(g.renderer), 'drawVanillaDustPass', '尘pass');
  wrap(Object.getPrototypeOf(g.renderer), 'drawChunkGrid', 'chunk格绘制');
  wrap(Object.getPrototypeOf(ch), 'glMarkPageDirty', 'GL脏标记');
});
// 分解臂:convertArea-only（无尘/无渲染——纯转化+级联成本）
const convOnly = await page.evaluate(() => {
  const g = window.__swGame;
  const ev = g.evolution;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.y / 16) - 8;
  const angles = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5];
  const pos = angles.map((a) => ({ x: px * 16 + 900, y: py * 16, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7 }));
  const t0 = performance.now();
  for (let t = 0; t < 60; t++) {
    for (const p of pos) {
      for (let sub = 0; sub < 3; sub++) {
        p.x += p.vx; p.y += p.vy;
        ev.convertArea(Math.floor(p.x / 16), Math.floor(p.y / 16), 1, 2);
      }
    }
  }
  return (performance.now() - t0) / 60;
});
console.log('convertArea-only:', convOnly.toFixed(2), 'ms/tick（纯转化+级联,无渲染/尘）');
// 真实节律剂量:6 弹(不同轨迹)×3 子步×60 tick
const spray = await page.evaluate(() => {
  const g = window.__swGame;
  const ev = g.evolution;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.y / 16) - 8;
  // 6 弹轨迹:扇形散射(±30°),弹速~7px/substep
  const angles = [-0.5, -0.3, -0.1, 0.1, 0.3, 0.5];
  const pos = angles.map((a) => ({ x: px * 16, y: py * 16, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7 }));
  const t0 = performance.now();
  const perTick = [];
  let dustSpawned = 0;
  for (let t = 0; t < 60; t++) {
    const f0 = performance.now();
    for (const p of pos) {
      for (let sub = 0; sub < 3; sub++) {
        p.x += p.vx; p.y += p.vy;
        ev.convertArea(Math.floor(p.x / 16), Math.floor(p.y / 16), 1, 2);
        const d = g.vanillaDust?.spawn?.(p.x, p.y, 6, 6, 110, p.vx * 0.2, p.vy * 0.2, 100, null, 1, true);
        if (d) dustSpawned++;
      }
    }
    window.__vnow += 16.7;
    g.frame(window.__vnow);
    perTick.push(+(performance.now() - f0).toFixed(1));
  }
  return {
    ms: +((performance.now() - t0) / 60).toFixed(3),
    peak: Math.max(...perTick),
    dustSpawned,
    perTickTail: perTick.slice(-6),
    ...window.__stats(),
  };
});
console.log('喷射(真实节律 60 tick):', JSON.stringify(spray));
console.log(`帧耗时 基线=${base.ms}ms → 喷射均值=${spray.ms}ms (${(spray.ms / base.ms).toFixed(1)}×) 峰值=${spray.peak}ms`);
const prof = await page.evaluate(() => window.__prof);
const profLine = Object.entries(prof).filter(([k]) => !k.includes('#')).map(([k, v]) => `${k}=${v.toFixed(1)}ms(${prof[k + '#n'] || 0}次)`).join(' ');
console.log('函数分解(60tick累计):', profLine);
console.log(`【Windows 推算:×5-10 判例 → ${(spray.ms * 5).toFixed(1)}-${(spray.ms * 10).toFixed(1)}ms/帧 = ${spray.ms * 5 > 8.3 ? '爆 8.3ms 槽=掉帧实锤' : 'Mac 侧无感,需用户 trace'}】`);
await browser.close();
