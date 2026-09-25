// ★A1 screenFx 滤镜链入管线 像素对拍+滤镜帧账本证明（2026-09-25;_opresent 页内翻面范式）。
// GLScreenFilters 多 pass 链:旧=「GL→2D→GL 乒乓、每 pass 全帧重传」（N 次全幅上传
// +N−1 次 staging 回读+staging 画布+sfx 独立 GL 上下文）;新=GLPipeline FBO('sfxA'/
// 'sfxB') 乒乓+末 pass present 单次回贴。判据：
//   GA  路径面:A 态（sfxPipe=false）sfxPathUsed='pingpong';B 态='pipe';翻回 A'≡A。
//   GB  终帧逐字节:A vs B 全帧 md5 全等+census n=0（同 shader/同输入字节/同采样
//       参数——等价论证见 GLScreenFilters drawChainPipe 头注; ANY Δ=转录 bug）。
//   GC  滤镜帧账本:A 态 'screenFx' 账页 frameUp==N（1 源+N−1 staging 全幅上传）
//       +draws==N+staging 画布在场;B 态（自 boot 管线会话）'screenFx' 账页整个
//       不存在（独立上下文零创建=IOSurface 净−1）+staging 恒 null（已建会话恒
//       零增量 frameUp==0）。
//   GD  组合帧不回归:opresent/b2b 缺省同开下全矩阵;另 opresent 关断相位仍逐字节。
//   GE  矩阵:pass 链全清单（heat/blood/grave/heat+blood+grave+crt=4 pass 深乒乓/
//       nebula+sepia DSTNoise/noir+retro NoirNoise/tower+heat/shake/ALL=10 pass）
//       ×昼（tod 0.5）/夜（tod 0.0）×zoom1.5625。
// 仪器:sfxPathUsed/sfxPathStats/screenFx.staging/__swGPULog.snapshot() 账页。
// 运行:SW_ORIGIN=http://localhost:5214 node tools/run-diag.mjs --timeout=1200000 scripts/_sfxgl-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';   // ★转正后缺省即管线链（?sfxgl 缺省开）;逃生门页 ?sfxgl=0 单测
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 3).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性套件 + 滤镜态注入面 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  const proto = Object.getPrototypeOf(sky);
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  // ★环境钉面（云/灯/气球/鸟群/天气/群系背景全冻结——滤镜帧 A/B 唯一自由度=链路径）
  sky.drawAmbience = () => {};
  sky.ambEntities.length = 0;
  sky.ambNextAttempt = 1000000;
  window.__weatherSet = ({ raining, alpha, numClouds }) => {
    const w = g.world.weather;
    if (!w) return false;
    if (raining !== undefined) w.raining = raining;
    if (alpha !== undefined) { w.cloudAlpha = alpha; w.maxRaining = alpha; }
    if (numClouds !== undefined) w.numClouds = numClouds;
    w.lightning = 0;
    return true;
  };
  window.__weatherFreeze = () => { const w = g.world.weather; if (w) w.update = () => {}; };
  window.__pause = (v) => { g.paused = v; };
  window.__sfxSet = (v) => r.constructor.sfxPipeSetForTest(v);
  // ★滤镜态注入（mono.update 冻结+旗态手工钉——激活矩阵/斜坡全旁路,每帧恒稳）
  window.__sfxPoke = (spec) => {
    const m = r.monoFilters;
    m.update = () => {};
    for (const f of m.filters) { f.active = false; f.opacity = 0; }
    m.heatActive = false; m.heatOpacity = 0; m.heatIntensity = 0;
    m.bloodMoonUseOpacity = 0; m.graveyardProgress = 0;
    delete r._lunarTowerFilterTarget;
    r._towerFilterOpacity = 0; r._towerFilterLastMs = performance.now();
    const le = g.world.lunarEvent;
    if (le) le.moonLordCountdown = 0;
    const set = (key, op) => { const f = m.state(key); if (f) { f.active = true; f.opacity = op; } };
    if (spec.heat) { m.heatActive = true; m.heatOpacity = 1; m.heatIntensity = 2; }
    if (spec.blood) { set('BloodMoon', 1); m.bloodMoonUseOpacity = 0.6; }
    if (spec.grave) { set('Graveyard', 1); m.graveyardProgress = 0.6; }
    if (spec.nebula) set('MonolithNebula', 1);
    if (spec.sepia) set('Sepia', 1);
    if (spec.noir) set('Noir', 1);
    if (spec.retro) set('Test2', 1);
    if (spec.crt) set('CRT', 1);
    if (spec.tower) {
      r._lunarTowerFilterTarget = () => ({ key: 'nebula', x: g.camera.x + 260, y: g.camera.y - 10, ai3: 0, shieldUp: true });
      r._towerFilterOpacity = 1; r._towerFilterLastMs = performance.now();
    }
    if (spec.shake && le) { le.moonLordCountdown = 180; le.moonLordCountdownMax = 3600; }   // sin(180/60·0.5)=sin(1.5)>0（1200 时 sin(10)<0 → clamp 0=不激活,首跑教训）
    return true;
  };
  window.__paths = () => ({
    used: r.sfxPathUsed,
    stats: { ...r.sfxPathStats },
    staging: !!(r.screenFx && r.screenFx.staging),
  });
  window.__ledger = () => {
    const s = window.__swGPULog?.snapshot?.();
    if (!s) return null;
    const fx = s.ctxs['screenFx'];
    return { hasFxCtx: !!fx, fxUp: fx ? fx.frameUp : null, fxDraws: fx ? fx.frameDraws : null, ctxKeys: Object.keys(s.ctxs) };
  };
  // ★时间耗面（滤镜帧场景 g.frame 纯耗时;快机口径参考值）
  window.__timeFrames = (cnt) => {
    const ts = [];
    for (let i = 0; i < cnt; i++) {
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      const t0 = performance.now();
      g.frame(window.__vnow);
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    return { p50: ts[Math.floor(cnt / 2)], p90: ts[Math.floor(cnt * 0.9)], mean: ts.reduce((a, b) => a + b, 0) / cnt };
  };
});
// ★停 rAF 主循环——渲染全权由 waitFrame 同步驱动（headless rAF 0~3fps 不可预期）
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 2;
}));
await page.evaluate(() => window.__weatherSet({ raining: false, alpha: 0, numClouds: 60 }));
await pump(page, 160);
await page.evaluate(() => window.__weatherFreeze());
await page.evaluate(() => { window.__swGame.renderer.sky.maintainClouds = () => {}; });
await page.evaluate(() => { window.__swGame.renderer.biomeBg.update = () => {}; });
await page.evaluate(() => window.__pause(true));
await waitFrame(8);

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}

/** 终帧快照（主画布全帧） */
async function snapFin() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}

/** census:A vs B 全帧差分（像素数/maxΔ/bbox） */
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    for (let i = 0; i < P.length; i++) {
      const dd = Math.abs(P[i] - Q[i]);
      if (dd > 0) {
        n++;
        if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a: aFin, b: bFin });
}

/** 单相位主流程:B(pipe)→A(pingpong)→B'(翻回)——pipe 先行保「staging 零创建」证词
 *  纯净（boot 后首个滤镜帧即管线的会话里 'screenFx' 账页缺席断言不被 A 污染）。
 *  spec=null=沿用当前 poke 态。返回 { B, A, paths, ledger }。 */
async function phase(label, spec = null) {
  if (spec) { await page.evaluate((s) => window.__sfxPoke(s), spec); await waitFrame(8); }
  await page.evaluate(() => window.__sfxSet(true));
  await waitFrame(4);
  const B1 = await snapFin();
  await waitFrame(1);
  const B2 = await snapFin();
  chk(`[${label}] B 两次捕获恒等（确定性哨兵）`, B1.b64 === B2.b64, md5(B1.b64).slice(0, 8));
  const pathsB = await page.evaluate(() => window.__paths());
  const ledB = await page.evaluate(() => window.__ledger());
  chk(`[${label}] GA B 态路径=pipe`, pathsB.used === 'pipe', `used=${pathsB.used}`);
  const B = { fin: B2, paths: pathsB, led: ledB };
  await page.evaluate(() => window.__sfxSet(false));
  await waitFrame(4);
  const A1 = await snapFin();
  await waitFrame(1);
  const A2 = await snapFin();
  chk(`[${label}] A 两次捕获恒等（确定性哨兵）`, A1.b64 === A2.b64, md5(A1.b64).slice(0, 8));
  const pathsA = await page.evaluate(() => window.__paths());
  const ledA = await page.evaluate(() => window.__ledger());
  chk(`[${label}] GA A 态路径=pingpong`, pathsA.used === 'pingpong', `used=${pathsA.used}`);
  const A = { fin: A2, paths: pathsA, led: ledA };
  await page.evaluate(() => window.__sfxSet(true));
  await waitFrame(4);
  const B2f = await snapFin();
  chk(`[${label}] GC 翻回恢复 B'≡B（无残留）`, B2f.b64 === B.fin.b64,
    `${md5(B.fin.b64).slice(0, 8)}/${md5(B2f.b64).slice(0, 8)}`);
  return { A, B };
}

/** 判据组 GB+GC（N=期望 pass 数）。
 *  GB 门=逐字节 md5 全等（★2026-09-25 三版定谳后全矩阵 n=0——二版 'I:' no-flip
 *  变体链接单元的 ±1 编译差已由「全 pass 原版 VERT+逐 pass 直通 blit」消除;
 *  定谳实验链存 scripts/_sfxgl-diag.mjs:中间产物直比/scroll0 判别/稳定性复核）。 */
async function judge(label, { A, B }, n) {
  const c = await census(A.fin, B.fin);
  chk(`[${label}] GB 终帧逐字节（md5 全等）`, A.fin.b64 === B.fin.b64,
    `n=${c.n} maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)} A=${md5(A.fin.b64).slice(0, 8)} B=${md5(B.fin.b64).slice(0, 8)}`);
  // 账本:旧链每滤镜帧 N 次全幅上传（1 源+N−1 staging）+N draw;staging 画布在场
  chk(`[${label}] GC A 态 screenFx 账页 frameUp==N（1 源+${n - 1} staging）`, A.led?.hasFxCtx && A.led.fxUp === n,
    `up=${A.led?.fxUp} draws=${A.led?.fxDraws} ctx=${JSON.stringify(A.led?.ctxKeys)}`);
  chk(`[${label}] GC A 态 staging 画布在场（N≥2 才建;N=1 恒 null）`, n >= 2 ? A.paths.staging === true : true,
    `staging=${A.paths.staging} n=${n}`);
  // 新链:'screenFx' 账页不存在（上下文零创建）或零增量（A 已建过的会话）
  chk(`[${label}] GC B 态 screenFx 账页缺席或零增量（staging 全幅上传归零）`,
    !B.led?.hasFxCtx || (B.led.fxUp === 0 && B.led.fxDraws === 0),
    `hasCtx=${B.led?.hasFxCtx} up=${B.led?.fxUp} draws=${B.led?.fxDraws}`);
}

// ---- 相位 0:boot 起纯管线的 staging/上下文双缺席证明（任何 A 态触碰前） ----
{
  await page.evaluate((s) => window.__sfxPoke(s), { heat: true, crt: true });
  await waitFrame(20);
  const p0 = await page.evaluate(() => window.__paths());
  const l0 = await page.evaluate(() => window.__ledger());
  chk('[纯管会话] staging 恒 null（管线链零创建）', p0.staging === false, `staging=${p0.staging}`);
  chk('[纯管会话] screenFx GL 上下文零创建（账页缺席=IOSurface 净−1）', l0 && !l0.hasFxCtx,
    JSON.stringify(l0?.ctxKeys));
  chk('[纯管会话] 路径=pipe', p0.used === 'pipe', `used=${p0.used}`);
  // 预载 Noir/DST 噪声（后续 sepia/noir 相位两路都已就绪——链剔除面不进对拍窗）
  await page.evaluate((s) => window.__sfxPoke(s), { sepia: true, noir: true });
  await waitFrame(30);
}

// ---- 矩阵:pass 链全清单×昼（tod 0.5） ----
const SCENARIOS = [
  ['heat 单pass', { heat: true }, 1],
  ['血月 单pass', { blood: true }, 1],
  ['墓地 单pass', { grave: true }, 1],
  ['四pass深乒乓 heat+blood+grave+crt', { heat: true, blood: true, grave: true, crt: true }, 4],
  ['nebula+sepia(DSTNoise)', { nebula: true, sepia: true }, 2],
  ['noir+retro(NoirNoise)', { noir: true, retro: true }, 2],
  ['tower+heat', { tower: true, heat: true }, 2],
  ['月总shake 单pass', { shake: true }, 1],
  ['ALL 十pass stress', { heat: true, shake: true, tower: true, nebula: true, grave: true, blood: true, sepia: true, noir: true, retro: true, crt: true }, 10],
];
for (const [label, spec, n] of SCENARIOS) {
  const r = await phase(label, spec);
  await judge(label, r, n);
}

// ---- 夜间（tod 0.0:血月/混合/ALL——tint 对夜色的可见相位） ----
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0; });
await waitFrame(6);
for (const [label, spec, n] of [
  ['夜·血月', { blood: true }, 1],
  ['夜·四pass', { heat: true, blood: true, grave: true, crt: true }, 4],
  ['夜·ALL', { heat: true, shake: true, tower: true, nebula: true, grave: true, blood: true, sepia: true, noir: true, retro: true, crt: true }, 10],
]) {
  await page.evaluate((s) => window.__sfxPoke(s), spec);
  await waitFrame(6);
  const r = await phase(label);
  await judge(label, r, n);
}
await page.evaluate(() => { window.__swGame.world.clock.timeOfDay = 0.5; });
await waitFrame(4);

// ---- zoom 1.5625（uScreenResolution/uTargetPx 换算面） ----
await page.evaluate(() => { window.__swGame.camera.zoom = 1.5625; });
await waitFrame(6);
{
  const r = await phase('zoom1.5625·四pass', { heat: true, blood: true, grave: true, crt: true });
  await judge('zoom1.5625·四pass', r, 4);
}
await page.evaluate(() => { window.__swGame.camera.zoom = 1; });
await waitFrame(4);

// ---- 组合帧:opresent 关断相位（滤镜链与世界合成同管线共存的独立性面） ----
await page.evaluate(() => window.__swGame.renderer.constructor.opresentSetForTest(false));
await waitFrame(4);
{
  const r = await phase('opresent-off·四pass', { heat: true, blood: true, grave: true, crt: true });
  await judge('opresent-off·四pass', r, 4);
}
await page.evaluate(() => window.__swGame.renderer.constructor.opresentSetForTest(true));
await waitFrame(2);

// ---- 帧耗参考口径（滤镜帧场景,headless 参考值——非判据） ----
{
  await page.evaluate((s) => window.__sfxPoke(s), { heat: true, blood: true, grave: true, crt: true });
  await waitFrame(10);
  await page.evaluate(() => window.__sfxSet(false));
  await waitFrame(6);
  const tA = await page.evaluate((n) => window.__timeFrames(n), 120);
  await page.evaluate(() => window.__sfxSet(true));
  await waitFrame(6);
  const tB = await page.evaluate((n) => window.__timeFrames(n), 120);
  console.log(`[帧耗] 四pass滤镜帧 A(pingpong) p50=${tA.p50.toFixed(2)}ms p90=${tA.p90.toFixed(2)}ms  B(pipe) p50=${tB.p50.toFixed(2)}ms p90=${tB.p90.toFixed(2)}ms`);
  chk('[帧耗] 管线链 p50 不劣于旧链（参考口径,±15% 噪声容限）', tB.p50 <= tA.p50 * 1.15 + 0.5,
    `A=${tA.p50.toFixed(2)} B=${tB.p50.toFixed(2)}`);
}

// ---- 账本分布（全会话 sfxPathStats——pipe 应显著占优） ----
await page.evaluate(() => window.__sfxSet(true));
await waitFrame(3);
const led = await page.evaluate(() => window.__paths());
chk('[账本] sfxPathStats.pipe>0（矩阵期管线帧在账）', (led.stats.pipe ?? 0) > 0, JSON.stringify(led.stats));
chk('[账本] sfxPathStats.2d 仅限噪声预载窗（sepia/noir Image 就绪前链空帧落 2D——合法回退,非对拍期）',
  (led.stats['2d'] ?? 0) <= 4, JSON.stringify(led.stats));
console.log('[账本]', JSON.stringify(led));

// ---- 逃生门 ?sfxgl=0（回旧乒乓链,双路径并存）:独立页加载断言 ----
{
  const page2 = await openPage(browser, {});
  await bootstrap(page2, ORIGIN + '/?sfxgl=0&cloudcache=0');
  await createGame(page2, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await page2.evaluate(() => {
    const g = window.__swGame;
    const r = g.renderer;
    r.sky.drawAmbience = () => {};
    r.sky.ambEntities.length = 0;
    r.sky.ambNextAttempt = 1000000;
    const m = r.monoFilters;
    m.update = () => {};
    for (const f of m.filters) { f.active = false; f.opacity = 0; }
    m.heatActive = true; m.heatOpacity = 1; m.heatIntensity = 2;
    g.paused = true;
  });
  for (let i = 0; i < 40; i++) {
    await page2.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
  const esc = await page2.evaluate(() => ({
    used: window.__swGame.renderer.sfxPathUsed,
    hasStandaloneCtx: !!window.__swGame.renderer.screenFx?.gl,
    flag: window.__swGame.renderer.constructor.sfxPipe,
  }));
  chk('[逃生门] ?sfxgl=0 → 旗关（回旧乒乓链）', esc.flag === false && esc.used === 'pingpong' && esc.hasStandaloneCtx === true,
    JSON.stringify(esc));
  await page2.close();
}

if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name + (f.detail ? ' [' + f.detail + ']' : ''));
process.exitCode = fails.length ? 1 : 0;
