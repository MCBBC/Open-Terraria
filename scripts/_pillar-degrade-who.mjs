// ★一次性:四柱场景 b2b-acc 逐帧降级 trigger 取证（degradeAcc 首帧调用栈+shim op 名）。
import { launchBrowser, openPage, bootstrap, createGame, front } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const errors = [];
const browser = await launchBrowser({});
const page = await openPage(browser, { errors });
await bootstrap(page, `${ORIGIN}/?cloudcache=0`);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });

await front(page);
await page.evaluate(() => {
  const g = window.__swGame;
  const R = g.renderer;
  // ① 包 Renderer.degradeAcc：记首 3 次调用栈（degrade 前栈=触发点）
  const RP = Object.getPrototypeOf(R);
  const origDeg = RP.degradeAcc;
  window.__degStacks = [];
  RP.degradeAcc = function (...a) {
    if (window.__degStacks.length < 3) {
      window.__degStacks.push(new Error('degrade-here').stack?.split('\n').slice(1, 14).join('\n'));
    }
    return origDeg.apply(this, a);
  };
  // ② 包 GLShimExecutor.accTailOp + ensureBridged：记 op 名
  return import('/src/render/glshim/GLShimExecutor.ts').then((m) => {
    const SP = m.GLShimExecutor.prototype;
    window.__tailOps = [];
    const origTail = SP.accTailOp;
    SP.accTailOp = function (op, args) {
      if (window.__tailOps.length < 20) window.__tailOps.push(op);
      return origTail.call(this, op, args);
    };
    // ③ 纹理解析失败支（flush 内 degradeAcc 调用点 :954-955 在私有管线内——
    //    用 host.degradeAcc 包裹侧写:首调栈已够）
    return 'armed';
  });
});
// 造 1 塔（盾 100）在玩家东 900px（屏内），先 rAF soak 2.5s（塔落位+Perlin 懒载）
await page.evaluate(async () => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const px = g.player.x;
  const gy = g.world.groundLevel * 16;
  await flow.spawnVanillaEnemy(422, px + 900, gy - 320);
  const le = g.world.lunarEvent;
  le.active = true; le.towerActive.vortex = true; le.shield.vortex = 100;
  g.enemySpawnEnabled = false;
  const w = g.world.weather; if (w) { w.raining = false; w.cloudAlpha = 0; w.lightning = 0; }
  const sky = g.renderer.sky;
  sky.maintainClouds = () => {}; sky.drawAmbience = () => {};
  g.renderer.biomeBg.update = () => {};
  window.__ffDraws = 0;
  return import('/src/fx/ForceFieldBubble.ts').then((m) => {
    const orig = m.drawForceFieldBubble;
    window.__ffWrap = (ctx, r, o) => { window.__ffDraws++; return orig(ctx, r, o); };
  });
});
// ForceFieldBubble 是模块导出函数——Renderer 里 import 的绑定无法页内换;改用
// drawTowerShield 侧写（数调用）+ soak 后再同步采帧
await page.evaluate(() => {
  const g = window.__swGame;
  const RP = Object.getPrototypeOf(g.renderer);
  const orig = RP.drawTowerShield;
  window.__tsCalls = 0;
  RP.drawTowerShield = function (...a) { window.__tsCalls++; return orig.apply(this, a); };
});
await page.evaluate(() => { window.__swGame.start(); });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { window.__swGame.running = false; });
await page.evaluate(() => {
  const g = window.__swGame;
  g.paused = false;
  let vnow = performance.now();
  window.__paths = [];
  for (let i = 0; i < 12; i++) {
    vnow += 16.6667;
    g.frame(vnow);
    window.__paths.push(g.renderer.bglPathUsed);
  }
});
const stacks = await page.evaluate(() => ({ stacks: window.__degStacks, tailOps: window.__tailOps, paths: window.__paths, ts: window.__tsCalls, ff: window.__ffDraws }));
console.log('paths:', stacks.paths, 'towerShield calls:', stacks.ts);
console.log('tailOps:', stacks.tailOps);
for (const s of stacks.stacks) console.log('---- degrade stack ----\n' + s);
if (errors.length) console.log('ERRORS:', errors.slice(0, 6));
await browser.close();
