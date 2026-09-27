// ★2026-09-27 火苗速率案 端到端探针：60/120fps 帧率上限下火苗钟同相。
//  病灶（B1 役登记）：TileFrameSeed 按绘制周期推进 → 120fps 火苗 24Hz。
//  修：seed = LCG^(⌊gameTickCount/5⌋+1)（tick 纯函数,读侧幂等）。
//  判据：
//   FA seed 变化率 ≈ 12/s @ frameCap 60（±3 容差;变异判别 = 旧病灶为 ~60/s 计数）
//   FB seed 变化率 ≈ 12/s @ frameCap 120 —— fps 加倍速率不变（核心判据）
//   FC seed = f(tick) 逐位：每采样点页内复算 LCG^(⌊tick/5⌋+1)(BASE) 全等
//   FD 逻辑 tick 率 ≈ 60/s @ 两档（fixedUpdate 与渲染解耦）
//   FE 同相位：两臂重叠 tick 域的 tick→seed 映射逐 tick 全等（种子相位锚世界年龄,
//     两臂起始 tick 不同属预期;同 tick 同种子=同相）
//   FF 绘制帧率证据：页内包账 renderer.render 计数 —— 60 臂≈60/s,120 臂≈120/s
//  运行:SW_ORIGIN=http://localhost:5226 node tools/run-diag.mjs --timeout=900000 scripts/_flame-rate-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({
  extraArgs: ['--disable-frame-rate-limit', '--disable-gpu-vsync'],
});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 采样器：每 rAF 记 (墙钟t, 逻辑tick, seed);页内复算 vanilla 公式 ----
async function sample(ms) {
  return page.evaluate(async (msWin) => {
    const mod = await import('/src/render/TileFlames.ts');
    const gt = await import('/src/core/GameTime.ts');
    const MASK48 = (1n << 48n) - 1n;
    const BASE = 0x2545f4914f6cdd1dn & MASK48;
    const lcg = (s) => (s * 25214903917n + 11n) & MASK48;
    const seedAt = (tick) => {
      let s = BASE;
      for (let k = 0; k < Math.floor(tick / 5) + 1; k++) s = lcg(s);
      return s;
    };
    const samples = [];
    const t0 = performance.now();
    let raf = 0;
    await new Promise((res) => {
      const step = () => {
        raf++;
        const tick = gt.gameTickCount();
        const seed = mod.currentTileFrameSeed();
        samples.push({ t: performance.now() - t0, tick, seed: seed.toString(), formula: seedAt(tick).toString() });
        if (performance.now() - t0 < msWin) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
    return { samples, raf, sec: msWin / 1000 };
  }, ms);
}

function metrics({ samples, raf, sec }) {
  let changes = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i].seed !== samples[i - 1].seed) changes++;
  const ticks = samples[samples.length - 1].tick - samples[0].tick;
  const fps = raf / sec;
  return { seedRate: changes / sec, tickRate: ticks / sec, fps, changes, samples };
}

// ---- 绘制帧计数（包账 renderer.render——原始 rAF 在 --disable-frame-rate-limit
//      下不受 frameCap 钳,须数【真实绘制】次数）----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  globalThis.__paintCount = 0;
  if (!globalThis.__renderWrapped) {
    const orig = r.render.bind(r);
    r.render = (...a) => { globalThis.__paintCount++; return orig(...a); };
    globalThis.__renderWrapped = true;
  }
  globalThis.__paintCount = 0;
});
const paintFps = async (sec) => {
  const n0 = await page.evaluate(() => globalThis.__paintCount);
  await new Promise((r) => setTimeout(r, sec * 1000));
  const n1 = await page.evaluate(() => globalThis.__paintCount);
  return (n1 - n0) / sec;
};

// ---- 臂 A：frameCap=60（缺省）----
await page.evaluate(async () => { const o = await import('/src/core/Options.ts'); o.options.data.frameCap = 60; });
await new Promise((r) => setTimeout(r, 500));
const A = metrics(await sample(2000));
const fpsA = await paintFps(1);

// ---- 臂 B：frameCap=120 + frameSkipMode='off'（原版 Off=照画跟随 rAF——
//      subtle 档 0 步进帧 SuppressDraw 会把绘制钳回 60,复现不了 120fps 路径;
//      用户实报 120fps 双倍速 = Off/On 档的真实绘制率 120 才会踩中）----
await page.evaluate(async () => {
  const o = await import('/src/core/Options.ts');
  o.options.data.frameCap = 120;
  o.options.data.frameSkipMode = 'off';
});
await new Promise((r) => setTimeout(r, 500));
const B = metrics(await sample(2000));
const fpsB = await paintFps(1);

chk('FA seedRate@60fps ≈12/s', Math.abs(A.seedRate - 12) <= 3, `rate=${A.seedRate.toFixed(1)} fps=${A.fps.toFixed(0)}`);
chk('FB seedRate@120fps ≈12/s（fps 加倍速率不变）', Math.abs(B.seedRate - 12) <= 3, `rate=${B.seedRate.toFixed(1)} fps=${B.fps.toFixed(0)}`);
chk('FC seed=f(tick) 逐位（两臂全采样）',
  A.samples.every((s) => s.seed === s.formula) && B.samples.every((s) => s.seed === s.formula),
  `A ${A.samples.filter((s) => s.seed === s.formula).length}/${A.samples.length} B ${B.samples.filter((s) => s.seed === s.formula).length}/${B.samples.length}`);
chk('FD tickRate ≈60/s 两档', Math.abs(A.tickRate - 60) <= 5 && Math.abs(B.tickRate - 60) <= 5,
  `A=${A.tickRate.toFixed(1)} B=${B.tickRate.toFixed(1)}`);
// FE 节奏指纹：种子变化间隔 ≈83.3ms（5 tick@60Hz）两臂一致,且每个变化拍落在
//   ⌊tick/5⌋ 边界（tick%5===0）上——种子序列锚世界年龄（LCG 链,两臂绝对序列
//   不同属预期）,「同相位」的真身 = 同节奏 + 同 tick 边界 + 同纯函数（FC）
function rhythm(m) {
  const changeTimes = [];
  let boundaryOk = true;
  for (let i = 1; i < m.samples.length; i++) {
    if (m.samples[i].seed !== m.samples[i - 1].seed) {
      changeTimes.push(m.samples[i].t);
      if (m.samples[i].tick % 5 !== 0) boundaryOk = false;
    }
  }
  const gaps = [];
  for (let k = 1; k < changeTimes.length; k++) gaps.push(changeTimes[k] - changeTimes[k - 1]);
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : NaN;
  return { median, boundaryOk, n: changeTimes.length };
}
{
  const ra = rhythm(A), rb = rhythm(B);
  chk('FE 节奏指纹（变化间隔中位 ≈83ms 且落 tick%5 边界,两臂一致）',
    Math.abs(ra.median - 83.3) <= 12 && Math.abs(rb.median - 83.3) <= 12
      && ra.boundaryOk && rb.boundaryOk,
    `A med=${ra.median.toFixed(1)}ms n=${ra.n} B med=${rb.median.toFixed(1)}ms n=${rb.n}`);
}
chk('FF 绘制帧率证据（A≈60/s,B≈120/s;容差 ±20%）',
  Math.abs(fpsA - 60) <= 12 && Math.abs(fpsB - 120) <= 24,
  `paintedA=${fpsA.toFixed(0)}/s paintedB=${fpsB.toFixed(0)}/s`);
chk('GG 页面零报错', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

console.log('\n== 汇总 ==');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`);
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILED`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
