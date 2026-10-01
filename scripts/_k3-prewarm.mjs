// ★K3 星批 idle 预热探针（2026-10-01）：首夜帧尖峰定谳面 A/B——
// ①组件级:standalone GLSpriteLayer 上 sprite:precip 冷编译+Star_0 首传+首批发射
//   （=emitStarBatchGL 首帧 132ms 尖峰的构成）vs 预热后复跑;
// ②实机级:世界就绪后 mainFlow rIC 挂点已跑 prewarmStarBatch ——
//   cloudGlLayer.precipProg 非空 + sbat: 键纹理在场 = 预热生效直证。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_k3-prewarm.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, ORIGIN + '/');

const g = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
chk('世界就绪', !!g?.ok, g?.why ?? '');
await sleep(3500);   // rIC（timeout 2000）+ loadTex 异步窗

// ---- ②实机级:预热生效直证 ----
const live = await page.evaluate(() => {
  const gg = window.__swGame;
  const sky = gg?.renderer?.sky;
  const layer = sky?.cloudGlLayer;
  if (!sky || !layer) return { why: 'no sky/layer' };
  const starKeys = [];
  for (const [k] of layer.texs) if (k.startsWith('sbat:')) starKeys.push(k);
  return {
    precipCompiled: layer.precipProg != null,
    precipFail: layer.precipFail,
    starTexKeys: starKeys.sort(),
    starTexsLoaded: sky.starTexs.filter((t) => t && t.width > 0).length,
  };
});
if (live.why) {
  chk('实机预热直证', false, live.why);
} else {
  chk('sprite:precip 预编译（precipProg 非空/未 fail）', live.precipCompiled && !live.precipFail,
    `precipCompiled=${live.precipCompiled} fail=${live.precipFail}`);
  chk('Star_0..3 预传（sbat: 键在场）', live.starTexKeys.length >= 4,
    `keys=${JSON.stringify(live.starTexKeys)} loaded=${live.starTexsLoaded}`);
}

// ---- ①组件级:冷 vs 热构成计量（standalone 层;程序/纹理首传成本） ----
// ★仪器债登记:同浏览器进程内 app 已编译过 sprite:precip（预热生效直证的同义面）
// ——驱动着色器缓存按源哈希命中,standalone「cold」=2.2ms 伪影。冷构成改用
// 【本进程从未编译过的 sprite:forcefield 程序】做代理（K2 新程序,K3 页无四柱
// =真冷编译），量化首夜帧原先要付的编译+首绘成本上界。
const comp = await page.evaluate(async () => {
  const mod = await import('/src/render/GLSpriteLayer.ts');
  const layer = new mod.GLSpriteLayer();
  if (layer.unavailable) return { why: 'webgl2 unavailable' };
  const star = new Image();
  star.src = 'sprites/vanilla/Star_0.png';
  await new Promise((res) => { star.onload = res; star.onerror = res; });
  if (!(star.width > 0)) return { why: 'star tex load fail' };
  // 300 星 stride-8 批（buildStarBatch 同布局）
  const Q = 300;
  const data = new Float32Array(Q * 48);
  for (let q = 0; q < Q; q++) {
    const x = (q * 37) % 1200, y = (q * 53) % 700, s = 8;
    const pts = [[x, y, 0, 0], [x + s, y, 1, 0], [x + s, y + s, 1, 1], [x, y, 0, 0], [x + s, y + s, 1, 1], [x, y + s, 0, 1]];
    for (let v = 0; v < 6; v++) {
      const o = q * 48 + v * 8;
      data[o] = pts[v][0]; data[o + 1] = pts[v][1]; data[o + 2] = pts[v][2]; data[o + 3] = pts[v][3];
      data[o + 4] = 1; data[o + 5] = 1; data[o + 6] = 1; data[o + 7] = 0.8;
    }
  }
  const run = (key) => {
    const t0 = performance.now();
    layer.resize(1280, 800);
    layer.begin('sstarn');
    const e = layer.texFromImage(key, star, false, true);
    if (e) layer.quadBatchRgba(e, data, Q, true);
    layer.end();
    return performance.now() - t0;
  };
  const cold = run('k3cold:' + Math.random());
  const warm = run('k3warm:' + Math.random());
  // 冷编译代理:sprite:forcefield（stride 9,本页未编译过;K2 白面纹理源=perlin 不可得,
  // 用 star 贴图顶替——采样值不影响编译成本计量）
  const ffData = new Float32Array(54);
  for (let v = 0; v < 6; v++) {
    ffData[v * 9] = v % 2 ? 600 : 100; ffData[v * 9 + 1] = v < 3 ? 100 : 400;
    ffData[v * 9 + 2] = v === 1 || v === 2 || v === 4 ? 1 : 0;
    ffData[v * 9 + 3] = v >= 2 ? 1 : 0;
    ffData[v * 9 + 4] = 1; ffData[v * 9 + 5] = 1; ffData[v * 9 + 6] = 1; ffData[v * 9 + 7] = 1;
    ffData[v * 9 + 8] = 1.0;
  }
  const ffCold = (() => {
    const t0 = performance.now();
    layer.resize(1280, 800);
    layer.begin('sstarn');
    const e = layer.texFromImage('k3ffproxy', star, false, true);
    if (e) layer.quadBatchForceField(e, ffData, 1);
    layer.end();
    return performance.now() - t0;
  })();
  layer.dispose();
  return { cold, warm, ffCold };
});
if (comp.why) {
  chk('组件级冷/热计量', false, comp.why);
} else {
  chk('预热后星批构成成本回落（warm < cold）', comp.warm < comp.cold,
    `warm=${comp.warm.toFixed(1)}ms (同页驱动缓存伪影 cold=${comp.cold.toFixed(1)}ms)`);
  chk('冷程序编译+首绘成本量化（forcefield 代理 ≥15ms=首夜尖峰构成量级）',
    comp.ffCold >= 15, `ffCold=${comp.ffCold.toFixed(1)}ms`);
}
chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
