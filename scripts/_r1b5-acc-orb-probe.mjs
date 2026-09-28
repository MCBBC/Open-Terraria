// ★R1b-5 样式工厂降级常态化 探针（2026-09-28 雷雨 degradeAcc 逐帧定谳 收口面）。
// 病灶:acc 窗内 StormLightning.draw 辉光盘（proj1457.ts:1851 createRadialGradient,
//       'lighter'+渐变 fillRect）逐帧触发读值面→ensureBridged→整帧降级+present 回贴
//       （Windows 雷雨 trace:degradeAcc drawImage 1032ms=9.3% 稳态,全帧样本唯一退化栈）。
// 修:样式工厂走上下文无关真对象（styleCtx）+lighter 渐变 fillRect 栅格化 ADD 档。
// 硬计数器（页内逐调用,规避 bglPathStats 双窗/帧界口径）:
//   renders=Renderer.render 调用;degrades=host.degradeAcc 调用;factory=shim.styleCtx 调用
//   （GREEN 相=工厂真实次数;RED 相把桩换成计数桩返 null=旧行为模拟）。
// 判据（每相 spawn 新 1091（life=240tick 飞行期恒 orb 分支）+真时等待 ~1.6s）:
//   G1  degrades=0 且 fallback 增量=0 且 factory≥60% renders（雷逐帧走工厂,acc 恒在场）;
//   R1  degrades≥60% renders（旧行为=逐帧降级常态化复演）;
//   G2  degrades≤5% renders（摘桩恢复,acc 窗正确重开）;
//   P1  各相 renders（帧产率参考值:RED 全链桥接应显著掉帧=帧耗回收的直接体现）。
// 运行:SW_ORIGIN=http://localhost:5258 node tools/run-diag.mjs --timeout=600000 scripts/_r1b5-acc-orb-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?bgl=1&cloudcache=0';
const WAIT_MS = 1600;
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

await clockSet(page, 10 / 24);
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  try { sky.maintainClouds = () => {}; sky.drawAmbience = () => {}; } catch { /* 域差异 */ }
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; w.update = () => {}; }
  // 硬计数器
  window.__cnt = { renders: 0, degrades: 0, factory: 0 };
  const origRender = r.render.bind(r);
  r.render = function (...a) { window.__cnt.renders++; return origRender(...a); };
  const shim = r.bglEntShim;
  if (shim && shim.host) {
    const origDeg = shim.host.degradeAcc;
    if (origDeg) shim.host.degradeAcc = (...a) => { window.__cnt.degrades++; return origDeg(...a); };
  }
  window.__styleMode = (mode) => {
    const sh = r.bglEntShim;
    if (!sh) return false;
    delete sh.styleCtx;
    if (mode === 'green-count') {
      const orig = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sh), 'styleCtx').value.bind(sh);
      sh.styleCtx = (...a) => { window.__cnt.factory++; return orig(...a); };
    } else if (mode === 'red') {
      sh.styleCtx = () => { window.__cnt.factory++; return null; };   // 旧行为:工厂不可达→ensureBridged→降级
    }
    return true;
  };
  window.__spawnOrbLightning = async () => {
    const m = await import('/src/entities/proj1457.ts');
    const px = g.player.x, py = g.player.y;
    const p = new m.StormLightning(1091, px + 300, py - 200, 10, 1);
    g.entities.add(p, 'projectiles');
    return { id: p.id, projId: p.projId };
  };
  window.__zeroCnt = () => { window.__cnt.renders = 0; window.__cnt.degrades = 0; window.__cnt.factory = 0; };
});
await page.evaluate(() => window.__styleMode('green-count'));
await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));   // 预热
const orb = await page.evaluate(() => window.__spawnOrbLightning());
chk('spawnOrbLightning', !!orb?.id, JSON.stringify(orb ?? {}));

async function phase(label) {
  await page.evaluate(() => window.__zeroCnt());
  const t0 = Date.now();
  await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), WAIT_MS);
  const c = await page.evaluate(() => ({ ...window.__cnt }));
  const rp = (n, d) => d ? Math.round(n / d * 100) + '%' : 'n/a';
  console.log(`  [${label}] renders=${c.renders} degrades=${c.degrades} factory=${c.factory} wall=${Date.now() - t0}ms`);
  return { ...c, pctDeg: c.renders ? c.degrades / c.renders : 0 };
}

// ---- G1 GREEN 基线（修复态:工厂计数桩,真工厂可用）----
const g1 = await phase('G1');
chk('G1:零降级帧', g1.degrades === 0, `degrades=${g1.degrades}/${g1.renders}`);
chk('G1:雷逐帧走工厂(不降级)', g1.renders >= 10 && g1.factory >= Math.floor(g1.renders * 0.6),
  `factory=${g1.factory} vs renders=${g1.renders}`);

// ---- R1 RED（旧行为模拟:工厂不可达→ensureBridged→整帧降级）----
await page.evaluate(() => window.__styleMode('red'));
const r1 = await phase('R1');
chk('R1:逐帧降级常态化复演(旧行为)', r1.renders >= 10 && r1.degrades >= Math.floor(r1.renders * 0.6),
  `degrades=${r1.degrades}/${r1.renders}=${(r1.pctDeg * 100).toFixed(0)}%`);

// ---- G2 GREEN 恢复（摘桩=修复态真工厂）----
await page.evaluate(() => window.__styleMode('green-count'));
const g2 = await phase('G2');
chk('G2:摘桩后降级停增', g2.renders >= 10 && g2.degrades <= Math.floor(g2.renders * 0.05),
  `degrades=${g2.degrades}/${g2.renders}`);
chk('G2:工厂恢复逐帧在场', g2.factory >= Math.floor(g2.renders * 0.6), `factory=${g2.factory} vs renders=${g2.renders}`);

const errs = pageErrors.filter((e) => !/favicon/.test(e));
chk('零页面异常', errs.length === 0, errs.slice(0, 3).join(' | '));

const fails = results.filter((x) => !x.ok).length;
console.log(`\n== R1b-5 orb probe: ${results.length - fails}/${results.length} PASS ==`);
process.exit(fails ? 2 : 0);
