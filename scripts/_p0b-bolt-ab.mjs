// ★P0-B 雷击风暴 A/B 验收探针（2026-09-25 定谳续刀）。
// 判据:
//   A. 上传风暴消灭:bake OFF 臂雷帧 swpipe 纹理上传 ≈2000-3500 笔/帧（病灶签名,
//      逐 fill rasterizePathOp 即发即弃）;bake ON 臂 ≤ 每 bolt 1 笔+底噪（≤40/帧,
//      雷帧上传风暴定谳面量化闭合——11ms→目标 +1-2ms）。
//   B. 帧耗对照:雷视觉窗（bolts 全 active）渲染帧耗 p50,bake ON 相对 OFF 削减
//      ≥5ms（病灶 +11ms 雷帧→目标 ≤+2ms;对齐臂=同种子同拍数）。
//   C. 像素对拍:同 seed 同相位截帧,bake ON vs OFF 雷区平均 |Δ| 有界
//      （α 渐变窗内 census 有界;结构性大差=烘焙几何错,FAIL）。
//   D. 并发钳:1091 主雷+叉 ≤7（vanilla MaxForksPerBolt/MaxForkDepth=2/2 界）。
//   E. bolt 几何恒定:同 bolt 连续两帧 positions 逐点全等（视觉期 positions 冻结锚）。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_p0b-bolt-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await page.evaluate(() => { window.__swGame.running = false; });

// 通用驱动:实时步进 vnow（生存面/雷视觉帧全同步驱动）;collect=逐帧耗时+swpipe 上传笔数
await page.evaluate(() => {
  const g = window.__swGame;
  window.__vnow = performance.now();
  window.__strike = null;
  window.__drive = (n, collect) => {
    const G = window.__GLS;
    const out = { ms: [], up: [], draws: [] };
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      window.__vnow += 16.6667;
      g.frame(window.__vnow);
      const dt = performance.now() - t0;
      if (collect) {
        out.ms.push(dt);
        const s = G.gpuLogSnapshot();
        out.up.push(s.ctxs.swpipe ? s.ctxs.swpipe.frameUp : 0);
        out.draws.push(s.ctxs.swpipe ? s.ctxs.swpipe.frameDraws : 0);
      }
    }
    return out;
  };
  window.__spawn = (x, y, seed) => { g.spawnStormBolt1091(x, y, seed); };
  window.__boltState = () => {
    const g = window.__swGame;
    const projs = (g.entities.all?.() ?? []).filter((e) => e && (e.projId === 1091 || e.projId === 1117 || e.projId === 1122));
    const bolts = projs.filter((e) => e && e.visualT > 0);
    const main = bolts[0];
    return {
      live: projs.length,
      visual: bolts.length,
      boltCount: main ? (main['bolts'] ? main['bolts'].length : -1) : -1,
      posFrozen: main ? JSON.stringify(main['bolt'] ? main['bolt'].positions : null) : null,
      x: main ? main.cx : 0, y: main ? main.cy : 0,
    };
  };
  return import('/src/render/GLStats.ts').then((m) => { window.__GLS = m; });
});

const p50 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

// ---- 臂参数:6 发 1091 同拍齐放（Kill 同帧→视觉窗 6 雷全叠 40 帧,风暴峰值形态） ----
const STRIKES = 6;
const WINDUP = 246;            // 1091 life=240 → Kill 落雷帧
const VISUAL = 40;             // 尸检视觉窗采样长（visualTotal=45 全叠窗内）
const arm = async (bakeOff) => {
  await page.evaluate(async (off) => {
    const m = await import('/src/entities/proj1457.ts');
    m.StormLightning.BOLT_BAKE_OFF = !!off;
    const g = window.__swGame;
    // 基线 30 帧（无雷;吃掉一次性建面噪声）
    window.__drive(30, false);
    window.__stagger = [];
    const px = g.player.cx, py = g.player.cy;
    for (let k = 0; k < 6; k++) window.__stagger.push({ x: px + (k - 2.5) * 90, y: py - 24, seed: 0xB017 + k * 7919 });
    window.__frameIdx = 0;
    window.__spun = 0;
  }, bakeOff);
  // 同拍齐放（Kill 同帧=雷视觉窗全叠）
  for (let k = 0; k < STRIKES; k++) {
    await page.evaluate((kk) => {
      const st = window.__stagger[kk];
      window.__spawn(st.x, st.y, st.seed);
    }, k);
  }
  // 驱动到 Kill 落雷（life 240→Kill 帧=风窗末）
  await page.evaluate((n) => { window.__drive(n, false); }, WINDUP);
  // 视觉窗:先 10 帧到相位窗内采 bolt 态（窗末 bolt 已尸检完,读数恒 0=探针坑）,
  // 再 collect 采样余下帧
  await page.evaluate((n) => { window.__drive(n, false); }, 10);
  const state = await page.evaluate(() => {
    const s1 = window.__boltState();
    window.__drive(1, false);
    const s2 = window.__boltState();
    return { ...s1, posFrozen: s1.posFrozen !== null && s1.posFrozen === s2.posFrozen };
  });
  const vis = await page.evaluate((n) => window.__drive(n, true), VISUAL - 11);
  return { p50ms: p50(vis.ms), meanMs: mean(vis.ms), upMean: mean(vis.up), upMax: Math.max(...vis.up), state };
};

console.log('--- 臂 1:bake OFF（病灶链=逐 fill rasterizePathOp 即发即弃上传） ---');
const off = await arm(true);
console.log(`[OFF] p50=${off.p50ms.toFixed(1)}ms mean=${off.meanMs.toFixed(1)}ms uploads/帧 mean=${off.upMean.toFixed(0)} max=${off.upMax} visual=${off.state.visual} bolts/bolt=${off.state.boltCount}`);
console.log('--- 臂 2:bake ON（整 bolt 一张 scratch） ---');
const on = await arm(false);
console.log(`[ON]  p50=${on.p50ms.toFixed(1)}ms mean=${on.meanMs.toFixed(1)}ms uploads/帧 mean=${on.upMean.toFixed(0)} max=${on.upMax} visual=${on.state.visual} bolts/bolt=${on.state.boltCount}`);

chk('D1 1091 主雷+叉 ≤7（vanilla 生成界）', off.state.boltCount >= 1 && off.state.boltCount <= 7, `bolts=${off.state.boltCount}`);
chk('E1 bolt 几何视觉期恒定（positions 连帧全等——烘焙前提锚）', off.state.posFrozen === true, `frozen=${off.state.posFrozen}`);
chk('A1 OFF 臂复现上传风暴（雷帧 swpipe 上传 ≥800 笔/帧）', off.upMean >= 800 || off.upMax >= 800, `mean=${off.upMean.toFixed(0)} max=${off.upMax}`);
chk('A2 ON 臂上传归一（≤120 笔/帧=6 bolt×1 上传+底噪）', on.upMean <= 120, `mean=${on.upMean.toFixed(0)}`);
const dP50 = off.p50ms - on.p50ms;
chk(`B1 雷帧 p50 削减 ≥4ms（OFF ${off.p50ms.toFixed(1)} → ON ${on.p50ms.toFixed(1)}）`, dP50 >= 4, `Δ=${dP50.toFixed(1)}ms`);

// ---- C. 像素对拍:同 seed 单发+同帧双渲（g.frame 同 vnow=dt0 纯重渲,环境零漂移;
//      旧版双臂各自驱动 260 帧→云漂 260 帧非雷差淹没 census=探针坑） ----
const census = await page.evaluate(async () => {
  const m = await import('/src/entities/proj1457.ts');
  const g = window.__swGame;
  const snap = (x0, y0) => {
    const cv = g.renderer.canvas;
    return cv.getContext('2d').getImageData(x0, y0, 280, 640);
  };
  const st = window.__stagger[0];
  window.__spawn(st.x, st.y, st.seed);
  window.__drive(246, false);           // WINDUP 常量不入页内闭包,内联
  window.__drive(14, false);            // 视觉相位固定在 progress≈0.31（α 渐变窗内）
  const [scx, scy] = g.camera.worldToScreen(st.x, st.y);   // 世界坐标→画布像素（★canvas=getImageData 域）
  const x0 = Math.max(0, Math.round(scx) - 140), y0 = Math.max(0, Math.round(scy) - 620);
  const vt0 = (g.entities.all().find((e) => e && e.projId === 1091 && e.visualT > 0))?.visualT;
  m.StormLightning.BOLT_BAKE_OFF = true;
  const a = snap(x0, y0);               // OFF 渲染(已画)捕获
  g.frame(window.__vnow);               // 同 vnow 重渲=dt0 状态不进,纯 bake ON 面
  m.StormLightning.BOLT_BAKE_OFF = false;
  const b = snap(x0, y0);
  const vt1 = (g.entities.all().find((e) => e && e.projId === 1091 && e.visualT > 0))?.visualT;
  window.__drive(60, false);            // 冷却离窗
  const d = a.data, e2 = b.data;
  let acc = 0, big = 0, n = 0, litA = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 24) litA++;   // 正控:雷区确有内容
  for (let i = 0; i < d.length; i += 4) {
    const dd = (Math.abs(d[i] - e2[i]) + Math.abs(d[i + 1] - e2[i + 1]) + Math.abs(d[i + 2] - e2[i + 2])) / 3;
    acc += dd; n++;
    if (dd > 16) big++;
  }
  return { meanD: acc / n, bigPct: big / n * 100, litPct: litA / n * 100, dt0Frozen: vt0 === vt1 && vt0 > 0 };
});
console.log('[C] 像素对拍 mean|Δ|=', census.meanD.toFixed(2), ' 结构差(>16)=%', census.bigPct.toFixed(3));
chk('C0 正控:雷区确有内容（lit ≥1.5%,排除空区恒等伪绿）+dt0 状态冻结', census.litPct >= 1.5 && census.dt0Frozen === true, `lit%=${census.litPct.toFixed(2)} dt0frozen=${census.dt0Frozen}`);
chk('C1 census 有界（mean|Δ| ≤3 且结构差 ≤1.5%）', census.meanD <= 3 && census.bigPct <= 1.5, `mean=${census.meanD.toFixed(2)} big%=${census.bigPct.toFixed(3)}`);

await browser.close();
const bad = results.filter((r) => !r.ok);
console.log(bad.length ? `P0B-PROBE: ${bad.length}/${results.length} FAIL` : `P0B-PROBE: ${results.length}/${results.length} PASS`);
process.exit(bad.length ? 1 : 0);
