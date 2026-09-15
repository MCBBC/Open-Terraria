// ★BJ94 D1/D2 分配普查(实机直接物证;构造器计数子类法 = _bj78-wave-census.mjs 先例)
//
// 目标:
//   D1 渲染循环 4 个 URLSearchParams 构造点(drawChunkGrid×2/drawAnimatedTileLayer×1/
//      drawDummyTileAnim×1,每帧各 1 次解析)——基线计数(修复后应为 0);
//   D2 ~12/帧 Set 背景——【栈归因】定位构造点(源文件+行),供「可消除的消分配/
//      不可消除的登记」分类。
// 仪具:页内换全局构造器为计数子类(值语义不变,仅计数);Set 每次构造抓
//   new Error().stack 前 8 帧(重但仅普查窗内用,不做时延测量)。
// 场景:地表静立(land) + 水边静立(water,waveQ=3 全链);3 采样窗取中位。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=420000 scripts/_bj94-set-census.mjs
import { launchBrowser, openPage, bootstrap, createGame, teleport, pump, ledger, front } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
const FRAMES = 120;

/** 安装计数仪具(Set 带栈归因) */
async function installCounter(page) {
  return page.evaluate(() => {
    window.__census = { usp: 0, set: 0, stacks: new Map() };
    const RealUSP = URLSearchParams;
    window.URLSearchParams = class extends RealUSP {
      constructor(...a) { super(...a); window.__census.usp++; }
    };
    const RealSet = Set;
    window.Set = class extends RealSet {
      constructor(...a) {
        super(...a);
        window.__census.set++;
        const st = new Error().stack ?? '';
        const frames = st.split('\n').slice(1, 9).map((s) =>
          s.trim().replace(/^at /, '').replace(/\?[^)]*$/, '').replace(/:\d+:\d+$/, ''));
        const key = frames.join(' <- ');
        window.__census.stacks.set(key, (window.__census.stacks.get(key) ?? 0) + 1);
      }
    };
    return { ok: true };
  });
}

/** 计一轮(animTick 定界;3 窗) */
async function countWindow(page) {
  const samples = [];
  for (let s = 0; s < 3; s++) {
    const r = await page.evaluate((n) => new Promise((res) => {
      const g = window.__swGame;
      const t0 = g.renderer.animTick;
      window.__census.usp = 0;
      window.__census.set = 0;
      const iv = setInterval(() => {
        if (g.renderer.animTick - t0 >= n) {
          clearInterval(iv);
          res({ usp: window.__census.usp, set: window.__census.set, frames: g.renderer.animTick - t0 });
        }
      }, 25);
    }), FRAMES);
    samples.push(r);
  }
  return samples;
}

/** 栈归因报告:窗内聚合 Set 构造栈(逐场景清零重计) */
async function stackWindow(page, frames) {
  return page.evaluate((n) => new Promise((res) => {
    const g = window.__swGame;
    const t0 = g.renderer.animTick;
    window.__census.stacks = new Map();
    const iv = setInterval(() => {
      if (g.renderer.animTick - t0 >= n) {
        clearInterval(iv);
        const rows = [...window.__census.stacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
        res(rows);
      }
    }, 25);
  }), frames);
}

/** 一个场景的完整普查 */
async function census(page, label) {
  await pump(page, 60, { clearEnemies: true });
  await front(page);
  const samples = await countWindow(page);
  const med = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[1] / FRAMES;
  const stacks = await stackWindow(page, FRAMES);
  L.say(`[${label}] URLSearchParams/帧 = ${med('usp').toFixed(2)}  Set/帧 = ${med('set').toFixed(2)}  (3窗: ${JSON.stringify(samples)})`);
  for (const [k, v] of stacks) L.say(`[${label}]   Set ×${v}/${FRAMES}f ← ${k}`);
  return { usp: med('usp'), set: med('set') };
}

try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot0(boot));
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await installCounter(page);

  // waveQ=3(全链);静风无雨(同 _bj78 先例,天气扰动出清)
  await page.evaluate(async () => {
    const m = await import('/src/core/Options.ts');
    m.options.data.waveQuality = 3;
    m.options.data.swayInWind = false;
    const w = window.__swGame.world.weather;
    if (w) { try { w.maxRaining = 0; w.raining = false; w.windSpeedCurrent = 0; } catch { /* 域缺字段 */ } }
  });

  // 场景 1:地表静立(出生点)
  await census(page, 'land');

  // 场景 2:水边静立(找水;teleport 至水面上方)
  const water = await page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const runs = []; let rs = -1, rl = 0;
    for (let x = 2; x < st.w - 2; x++) {
      let c = 0;
      for (let y = Math.max(0, gl - 30); y <= gl + 12; y++) if (st.liquid[y * st.w + x] > 0) c++;
      if (c >= 8) { if (rs < 0) rs = x; rl++; } else if (rs >= 0) { if (rl >= 10) { runs.push([rs, rs + rl - 1]); } rs = -1; rl = 0; }
    }
    if (rs >= 0 && rl >= 10) runs.push([rs, rs + rl - 1]);
    return { runs, gl };
  });
  L.chk('找水', water.runs.length > 0, JSON.stringify(water.runs.slice(0, 2)));
  const [w0, w1] = water.runs[0];
  await teleport(page, (w1 + 6) * 16, water.gl * 16 - 48);
  const a = await census(page, 'water');
  L.chk('D1 基线: URLSearchParams/帧 ≈4(修复前)', a.usp >= 3.5, `usp/f=${a.usp}`);
  L.say('census-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}

function boot0(boot) { return boot.why ?? ''; }
