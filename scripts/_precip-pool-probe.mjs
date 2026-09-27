// ★雪/沙 precip 池病定谳探针（2026-09-27;takeClone←bakeMemoized←drawPrecipDust
// 92 张 canvas/s 哨兵实抓的机制级归因）。
// 仪器:
//   A. createElement 聚栈全量出生计数（首帧前 patch;按 2-5 帧聚栈）
//   B. weatherFx 实例包装 takeClone/giveClone/bakeMemoized → 命中/miss/出生/归还计数
//   C. bakeMemo.size + clonePool 尺寸族分布 每 2s 采样
//   D. 雪/沙/雨活量 + fps
// 场景=雪地暴风雪(cloudAlpha=1)+沙尘暴满强度 hooks 强制（不依赖真实生物群系;
//  与用户实报同构——雪原大风+沙尘暴同屏）。跑 40s 覆盖 memo 暖机全程。
// 运行:SW_ORIGIN=http://localhost:5225 node tools/run-diag.mjs --timeout=300000 scripts/_precip-pool-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));

// ---- A. createElement 聚栈（必须在页面脚本前）----
await page.evaluateOnNewDocument(() => {
  window.__bornStacks = new Map();
  window.__bornOn = false;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas' && window.__bornOn) {
      const st = (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/^at\s+/, '')).join(' | ');
      window.__bornStacks.set(st, (window.__bornStacks.get(st) || 0) + 1);
    }
    return orig(tag, ...rest);
  };
});

await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
console.log('createGame', JSON.stringify(gen?.ok ?? gen));
await godMode(page, true);

// ---- 场景强制：雪地暴风雪 + 沙尘暴满强度 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const w = g.world.weather;
  // 暴风雪=雨满强度+雪原满雪
  w.startRain(true, 1);
  w.raining = true;
  let ca = 1; Object.defineProperty(w, 'cloudAlpha', { get: () => ca, set: (v) => { ca = v; } });
  let wsv = 0.6; Object.defineProperty(w, 'windSpeedCurrent', { get: () => wsv, set: (v) => { wsv = v; } });
  // 沙尘暴满强度
  w.sandstorm.happening = true;
  w.sandstorm.timeLeft = 86400;
  w.sandstorm.intendedSeverity = 1;
  w.sandstorm.severity = 1;
  // hooks 强制（不依赖真实雪原/沙漠格数）——★updateWeather 每帧回写这些位,
  // 必须 defineProperty 钉死（getter 恒值,写回被吞）
  const hk = g.weatherHooks;
  const pin = (obj, key, val) => {
    Object.defineProperty(obj, key, { get: () => val, set: () => {}, configurable: true });
  };
  pin(hk, 'zoneRain', true);
  pin(hk, 'surfaceAtmospherics', true);
  pin(hk, 'atmo', 1);
  pin(hk, 'snowTileCount', 6000);
  pin(hk, 'snowRatio', 1);
  pin(hk, 'sandstormVisuals', true);
  pin(hk, 'desertSandTiles', 1000);
  pin(hk, 'bossDanger', false);
  pin(hk, 'deerclopsNear', false);
  pin(hk, 'shimmerAlpha', 0);
  // 沙色加权：森林 scene 权重全 0 → EmitDust 早退;钉一组真实权重
  hk.sandColors = () => [{ color: '#C8A014', weight: 1 }];
  console.log('[probe] remixWorld=', g.world.remixWorld ?? g.world.seedFlags?.remix ?? '?');

  // ---- B. 实例级仪器包装（own property 影子原型方法）----
  const fx = r.weatherFx;
  fx.__stats = { takeN: 0, takeBirth: 0, takePool: 0, giveN: 0, giveDrop: 0, missN: 0, hitN: 0, nullN: 0 };
  const proto = Object.getPrototypeOf(fx);
  const origTake = proto.takeClone, origGive = proto.giveClone, origBake = proto.bakeMemoized;
  fx.takeClone = function (w2, h2) {
    const s = this.__stats; s.takeN++;
    const arr = this.clonePool.get(`${w2}x${h2}`);
    if (arr && arr.length) s.takePool++; else s.takeBirth++;
    return origTake.call(this, w2, h2);
  };
  fx.giveClone = function (c) {
    const s = this.__stats; s.giveN++;
    const arr = this.clonePool.get(`${c.width}x${c.height}`);
    if (arr && arr.length >= 16) s.giveDrop++;
    return origGive.call(this, c);
  };
  fx.bakeMemoized = function (key, genFn) {
    const s = this.__stats;
    const hit = this.bakeMemo.get(key);
    if (hit !== undefined) { s.hitN++; return hit; }
    s.missN++;
    const out = origBake.call(this, key, genFn);
    if (out === null) s.nullN++;
    return out;
  };
  window.__fx = fx;
});

// 世界就绪后等 3s（雨/雪/沙池爬坡）
await new Promise((r) => setTimeout(r, 3000));

// ---- 采样 40s（每 2s;期间横移跑图=真实游玩光照创新驱动）----
await page.evaluate(() => { window.__bornOn = true; });
const samples = [];
for (let i = 0; i < 20; i++) {
  // 每样本横移 800px（模拟玩家跑图——相机移动=屏幕边缘新光照三元组连续创新）
  await page.evaluate(() => { window.__swGame.player.x += 800; }).catch(() => {});
  const s = await page.evaluate(() => {
    const fx = window.__fx;
    const g = window.__swGame;
    const pool = {};
    for (const [k, arr] of fx.clonePool) pool[k] = arr.length;
    const stacks = [...window.__bornStacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    window.__bornStacks.clear();
    const live = (arr) => arr.reduce((n, x) => n + (x.active ? 1 : 0), 0);
    return {
      t: performance.now(),
      born: stacks,
      stats: { ...fx.__stats },
      memoSize: fx.bakeMemo.size,
      pool,
      snow: live(fx.snow), sand: live(fx.sand), rain: live(fx.pool),
      fps: g?.renderer?.frameProbe?.fps ?? null,
    };
  });
  samples.push(s);
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('== 池病定谳采样（每 2s）==');
let prevTake = 0, prevBirth = 0, prevPool = 0, prevMiss = 0, prevHit = 0, prevGive = 0;
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  const dTake = s.stats.takeN - prevTake, dBirth = s.stats.takeBirth - prevBirth;
  const dPool = s.stats.takePool - prevPool, dMiss = s.stats.missN - prevMiss;
  const dHit = s.stats.hitN - prevHit, dGive = s.stats.giveN - prevGive;
  prevTake = s.stats.takeN; prevBirth = s.stats.takeBirth; prevPool = s.stats.takePool;
  prevMiss = s.stats.missN; prevHit = s.stats.hitN; prevGive = s.stats.giveN;
  const top = s.born[0] ? `${s.born[0][1]}x [${s.born[0][0].slice(0, 110)}]` : '-';
  console.log(`t=${Math.round(s.t / 1000)}s take=${dTake}(birth=${dBirth} pool=${dPool}) miss=${dMiss} hit=${dHit} give=${dGive} | memo=${s.memoSize} pool=${JSON.stringify(s.pool)} | snow=${s.snow} sand=${s.sand} rain=${s.rain}`);
  if (dBirth > 0 || (i === 0)) console.log(`   born: ${top}`);
}
console.log('== 累计 ==');
const fin = samples[samples.length - 1].stats;
console.log(JSON.stringify(fin));
console.log('pageErrors:', pageErrors.length, pageErrors.slice(0, 3));
await browser.close();
