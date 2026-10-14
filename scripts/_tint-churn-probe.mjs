// ★tintTex canvas 出生回潮闸（2026-10-14 用户 dist 实报 229/s;evict-on-insert 刀
//   的机械断言）。晨昏窗扫描驱动:每帧 timeOfDay 微量推进（cots 色键随真实时钟
//   漂移=晨昏 churn 复现;freezeClock 钉死会键恒定测不出）——读 miss/births/池
//   存量逐秒账。修前预期 births≈miss（批量窗口饥饿）;修后暖机（cache 达 256）
//   births→0 持续。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261014 });
await pump(page, 30);
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  window.__tint = { calls: 0, miss: 0, births: 0, poolStock: {}, cacheSize: 0 };
  const proto = Object.getPrototypeOf(sky);
  const orig = proto.tintTex;
  const origCE = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    const el = origCE(tag, ...rest);
    if (String(tag).toLowerCase() === 'canvas') {
      const st = (new Error().stack || '');
      if (st.includes('tintTex')) window.__tint.births++;
    }
    return el;
  };
  proto.tintTex = function (tex, rr, gg, bb, use) {
    window.__tint.calls++;
    const key = `${use}:${texId(tex)}:${(rr | 0) & ~3},${(gg | 0) & ~3},${(bb | 0) & ~3}`;
    void key;
    const hit = null;   // hit 判定从外部不可见——用 cacheSize 差分近似,miss=calls-births 不准;
    void hit;
    return orig.call(this, tex, rr, gg, bb, use);
  };
  function texId(o) { return (o && (o.__texid ?? (o.__texid = Math.random()))) || 0; }
  window.__tintRead = () => {
    const t = window.__tint;
    const pool = {};
    for (const [k, arr] of sky.tintFree) pool[k] = arr.length;
    const out = { calls: t.calls, births: t.births, cache: sky.tintCache2.size, pool };
    t.calls = 0; t.births = 0;
    return out;
  };
  window.__pause = (v) => { g.paused = v; };
});
// 晨昏窗往复扫描:0.20↔0.32（日出窗全域）每帧 ±0.0003（60fps=每秒 0.018≈4s 单程
// =12s 覆盖 1.5 个来回）——多轮回访键域=cache 涨满 256 到稳态（用户 229/s 场景=
// 满缓存 churn;首版 0.00004 太慢 12s 只暖机到 29 键=没测到稳态,判据假绿判例）。
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.0;
  window.__pause(true);
  g.running = false;
});
// ★全天循环扫描（0→1 循环,每帧 +0.001=16.7s/圈）:键域=全天色带×use 族
//   （sun/sun3/moon/dither）>256 上限——必触淘汰路径（evict-on-insert 的真实验面;
//   首版 0.20-0.32 往复域只 111 键<256=全命中假绿,淘汰支根本没跑判例）。
console.log('全天循环扫描 40s（每秒:tintTex 调用/出生/缓存/池）…');
for (let sec = 0; sec < 40; sec++) {
  for (let f = 0; f < 60; f++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      g.world.clock.timeOfDay = (g.world.clock.timeOfDay + 0.001) % 1;
      window.__vnow = (window.__vnow || performance.now()) + 16.7;
      g.frame(window.__vnow);
    });
  }
  const s = await page.evaluate(() => window.__tintRead());
  console.log(`t${sec}: calls=${s.calls} births=${s.births} cache=${s.cache} pool=${JSON.stringify(s.pool)}`);
}
// 稳态判据:末 4 窗（cache≥256 或往复两轮后）births 合计=0
const tailBirths = [];
for (let sec = 0; sec < 4; sec++) {
  for (let f = 0; f < 60; f++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      g.world.clock.timeOfDay = (g.world.clock.timeOfDay + 0.001) % 1;
      window.__vnow += 16.7;
      g.frame(window.__vnow);
    });
  }
  const s = await page.evaluate(() => window.__tintRead());
  tailBirths.push(s.births);
  console.log(`tail${sec}: calls=${s.calls} births=${s.births} cache=${s.cache}`);
}
const total = tailBirths.reduce((a, b) => a + b, 0);
const ok = total === 0;
console.log(ok ? 'GATE PASS（稳态 4 窗零分配）' : `GATE FAIL（末 4 窗 births 合计=${total}）`);
process.exitCode = ok ? 0 : 1;
await browser.close();
