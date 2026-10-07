// ★ghostblur 帧尾 accumulation pass A/B 像素证据（2026-10-07;?ghostblur=1 灰度旗）。
//
// 判据（任务书:A/B 像素证据+变异证红——变异证红在 tests/ghostblur-*.test.ts 双变异
// 实验落地,本探针=浏览器侧像素面）:
//   GA  静止恒等:ghost 开+相机静止（决策核 bypass=零 GL 写入,window.__swGhost.action
//       ==='bypass' 结构证据）vs 旗关——glCanvas 像素差 ≤ 同臂噪声预算 D0
//       （D0=旗关臂 3 对静态帧差 max;剩余噪声=闪烁钟残相/渲染期时基动画）。
//   GB  高速拖影在:ghost 开+相机振荡 pan（render wrapper 6 对 ±192px,净位移=0
//       恒域内零烘焙 hitch;96→192px/帧=8-12px/ms ≫ MAX=满档）——pan 后混合帧 vs
//       同相机位旗关原帧:像素差 ≫ D0（≈0.22× 相邻相位内容差=满屏级）;
//       且 pan 中段 __swGhost.action==='mix' ∧ α∈(0.1,0.25]。
//   GC  ★递归衰减链（feedback 本体判据,防「恒定调暗」假阳性）:急停后逐帧差
//       对同一 raw 参照几何衰减（d1>d3>d6>d12）,~60 帧后 ≙ raw（差 ≤ D0）——
//       拖影随时间指数消散=呈现面真反馈,非一次性混合/非调暗器;「静止=0 不脏
//       画面」像素面。
//   GD  旗关臂负结果:旗关+同款 pan——pan 末帧 ≙ 静止帧（差 ≤ D0）,拖影只随旗。
//   GE  旗面缺省关:无 ?ghostblur 页 Renderer.ghostBlur===false（灰度契约）。
//
// 运行:SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs --timeout=600000 scripts/_ghostblur-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?ghostblur=1&cloudcache=0';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

// ---- 页内:glCanvas 原始字节读回（readPixels 默认帧缓冲,preserveDrawingBuffer 判例）
//      +命名快照账（__ghostCap 存 / __ghostCmp 任意对差分——相邻对协议的升级:
//      首轮实测相邻链被相机 follow 漂移/时序错配污染,具名对=位置对齐可控）。
const SETUP = () => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__ghostStore = {};
  window.__ghostCap = (name) => {
    const pipe = r.swPipe;
    if (!pipe || pipe.unavailable || !r.glCanvasEl) return { why: 'no-pipe' };
    const gl = pipe.glx;
    const cv = r.glCanvasEl;
    const W = cv.width, H = cv.height;
    const buf = new Uint8Array(W * H * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    window.__ghostStore[name] = { buf, W, H, cam: g.camera.x, state: window.__swGhost ? { a: window.__swGhost.action, al: window.__swGhost.alpha } : null };
    return { name, W, H, cam: g.camera.x };
  };
  window.__ghostCmp = (a, b) => {
    const A = window.__ghostStore[a], B = window.__ghostStore[b];
    if (!A || !B || A.buf.length !== B.buf.length) return { why: 'missing' };
    let diff = 0, maxDelta = 0, sum = 0;
    const u = A.buf, v = B.buf;
    for (let i = 0; i < u.length; i++) {
      const d = Math.abs(u[i] - v[i]);
      if (d > 8) diff++;
      if (d > maxDelta) maxDelta = d;
      sum += d;
    }
    // sumAbs=无阈总量（衰减链判据——α 释放 ×0.165 后逐字节差全落 >8 阈下,
    // 阈计数恒 0;总量统计对 fp32 噪声鲁棒=4M 字节均值）
    return { diff, maxDelta, mean: +(sum / u.length).toFixed(4), sumAbs: sum, camA: A.cam, camB: B.cam };
  };
  window.__waitFrames = (n) => new Promise((res) => {
    const t0 = g._paintedFrames;
    const f = () => { if (g._paintedFrames >= t0 + n) res(g._paintedFrames); else requestAnimationFrame(f); };
    f();
  });
  return { ok: true };
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261007 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性钉面（_opresent-ab 同款:时钟/云/灯/气球/鸟/天气全冻结+闪烁钟钉） ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  const origBalloons = proto.drawPartyBalloonsNear;
  sky.drawPartyBalloonsNear = function (ctx, viewW, viewH, camX, dtMs) {
    return origBalloons.call(this, ctx, viewW, viewH, camX, 0);
  };
  sky.drawAmbience = () => {};
  sky.ambEntities.length = 0;
  sky.ambNextAttempt = 1000000;
  const w = g.world.weather;
  if (w) { w.update = () => {}; w.lightning = 0; }
  // 闪烁钟钉（FlickerClock 每拍步进=光照图逐帧呼吸的噪声源;D0 实测 4k 像素级）
  try { g.lighting.clock.tick = () => {}; } catch { /* 域差异 */ }
  // 世界动态冻结（paused 直写=applyAutoPauseUI 不回弹——_uiPausedByAutoPause 未置位;
  //  fixedUpdate 全停=NPC 游走/玩家物理/生成全冻结。渲染循环照跑=帧照出。
  //  首轮实测 GA3 超差=城镇 NPC 在 ~45 帧窗内走动,非 ghost 面）
  g.paused = true;
  // 相机 follow 钉（0.15 缓动每 fixedUpdate 拉回玩家锚——首轮实测 pan 后漂移=
  //  GC/GD 大差伪影;钉住=pan 净位移精确可控+静止帧真静止）
  g.camera.follow = () => {};
  // 振荡 pan 驱动器:6 对 (+192,−192) → 净位移 0 恒回原位（零新地形烘焙 hitch;
  //  192px/16ms=12px/ms ≫ MAX 1.2=满档;headless 掉帧 192/60ms=3.2 仍满档）
  window.__pan = { active: false, seq: [], idx: 0 };
  window.__panStart = () => {
    const p = window.__pan;
    p.seq = []; p.idx = 0;
    for (let i = 0; i < 6; i++) { p.seq.push(192, -192); }
    p.active = true;
  };
  const rp = Object.getPrototypeOf(r);
  const origRender = rp.render;
  rp.render = function (cam, ...rest) {
    const p = window.__pan;
    if (p && p.active && p.idx < p.seq.length) { cam.x += p.seq[p.idx]; p.idx++; if (p.idx >= p.seq.length) p.active = false; }
    return origRender.call(this, cam, ...rest);
  };
  window.__ghostSet = (v) => r.constructor.ghostBlurSetForTest(v);
  window.__ghostState = () => {
    const s = window.__swGhost;
    return s ? { action: s.action, alpha: s.alpha, speed: s.speed } : null;
  };
  window.__calm = () => {
    try { g.entities.enemies.length = 0; g.entities.projectiles.length = 0; g.particles.length = 0; } catch { /* 域差异 */ }
  };
});
await freezeClock(page, { tod: 0.5 });

await page.evaluate(SETUP);
const pre = await page.evaluate(async () => {
  await window.__waitFrames(10);
  const r = window.__swGame.renderer;
  return { pipe: !!r.swPipe && !r.swPipe.unavailable, stack: !!r.swPipe?.screenStackMode };
});
chk('GA0 GL 管线在场+屏栈模式（真实 GL 前置;SwiftShader=软死判）', pre.pipe === true, JSON.stringify(pre));

// ---- GA:噪声预算 D0（旗关臂 3 对静态差 max）+静止恒等 ----
await page.evaluate(() => { window.__ghostSet(false); window.__calm(); });
await page.evaluate(async () => { await window.__waitFrames(6); });
const d0 = await page.evaluate(async () => {
  await window.__ghostCap('d0a');
  await window.__waitFrames(3);
  await window.__ghostCap('d0b');
  await window.__waitFrames(3);
  await window.__ghostCap('d0c');
  await window.__waitFrames(3);
  await window.__ghostCap('d0d');
  return [window.__ghostCmp('d0a', 'd0b').diff, window.__ghostCmp('d0b', 'd0c').diff, window.__ghostCmp('d0c', 'd0d').diff];
});
const D0 = Math.max(...d0);
chk('GA1 噪声预算 D0 采样（3 对 max）', D0 < 50000, `pairs=${d0.join(',')} D0=${D0}`);
const ga = await page.evaluate(async () => {
  window.__ghostSet(true);
  await window.__waitFrames(30);   // warm→seed→bypass 稳态
  const st = window.__ghostState();
  await window.__calm();
  await window.__waitFrames(2);
  await window.__ghostCap('onStatic');
  return st;
});
chk('GA2 静止决策=bypass（零 GL 写入结构证据）', ga?.action === 'bypass', JSON.stringify(ga));
const gaCmp = await page.evaluate(() => window.__ghostCmp('onStatic', 'd0d'));
chk('GA3 静止 ghost-on ≙ ghost-off（差 ≤ D0）', (gaCmp.diff ?? 1e9) <= D0,
  `onVsOff=${gaCmp.diff} D0=${D0}`);

// ---- GB+GC:振荡 pan 拖影 + 递归衰减链 ----
const panSeq = await page.evaluate(async () => {
  const out = {};
  window.__calm();
  window.__panStart();
  await window.__waitFrames(5);
  out.mid = window.__ghostState();          // pan 中段决策面
  await window.__waitFrames(7);             // 6 对=12 帧（5+7）;净位移回 0
  out.panDone = window.__ghostState();
  await window.__ghostCap('panMix');        // pan 末帧=混合帧（cam0）
  // 递归衰减链（ghost 保持开,相机静止——α 释放 0.22×0.75ᵏ→地板旁路）
  await window.__waitFrames(1);
  out.st1 = window.__ghostState();
  await window.__ghostCap('d1');
  await window.__waitFrames(1);
  await window.__ghostCap('d2');
  await window.__waitFrames(1);
  out.st3 = window.__ghostState();
  await window.__ghostCap('d3');
  await window.__waitFrames(3);
  await window.__ghostCap('d6');
  await window.__waitFrames(6);
  out.st12 = window.__ghostState();
  await window.__ghostCap('d12');
  await window.__waitFrames(60);
  out.settledState = window.__ghostState();   // 采样点=settled 捕获前（α 已过地板旁路）
  await window.__ghostCap('settled');
  // 旗关原帧（同相机位;reset 后首帧=raw）
  window.__ghostSet(false);
  await window.__waitFrames(2);
  window.__calm();
  await window.__ghostCap('panRaw');
  return out;
});
chk('GB1 pan 中段决策=mix ∧ α∈(0.1,0.25]', panSeq.mid?.action === 'mix'
  && panSeq.mid.alpha > 0.1 && panSeq.mid.alpha <= 0.25, JSON.stringify(panSeq.mid));
const gb = await page.evaluate(() => window.__ghostCmp('panMix', 'panRaw'));
chk('GB2 混合帧 vs 同位旗关原帧（差 ≫ D0=拖影在）', (gb.diff ?? 0) > Math.max(D0 * 5, 50000),
  `mixVsRaw=${gb.diff} maxΔ=${gb.maxDelta} mean=${gb.mean} D0=${D0}`);
const decay = await page.evaluate(() => ({
  d1: window.__ghostCmp('d1', 'panRaw').sumAbs,
  d2: window.__ghostCmp('d2', 'panRaw').sumAbs,
  d3: window.__ghostCmp('d3', 'panRaw').sumAbs,
  d12: window.__ghostCmp('d12', 'panRaw').sumAbs,
  settled: window.__ghostCmp('settled', 'panRaw'),
}));
// ★8bit 量化地板判例（探针实测定谳）:α 释放 ×0.75ⁿ,残差 αᵏ×δ 逐帧 <0.5 舍入
// 归零——连续几何衰减在 RGBA8 上只可观测 ~2-3 帧（d1=76 万,sumAbs; d2 残峰;
// d3 起逐字节恒等 raw）。「恒定调暗」假阳性形态=d1=d2=d3=const>0,被
// 「严格递减且归零」判据否定;feedback 本体=残差随反馈逐帧衰减。
chk('GC1 递归衰减链（sumAbs: d1>d2>d3≥0 且 d1>100k——feedback 本体,防恒定调暗假阳性）',
  decay.d1 > decay.d2 && decay.d2 > decay.d3 && decay.d3 >= 0 && decay.d1 > 100000,
  JSON.stringify({ ...decay, settled: decay.settled.diff, st1: panSeq.st1, st3: panSeq.st3 }));
chk('GC2 静止收敛归零（settled ≙ raw,差 ≤ D0;state=bypass）',
  (decay.settled.diff ?? 1e9) <= D0 && panSeq.settledState?.action === 'bypass',
  `settledVsRaw=${decay.settled.diff} D0=${D0} state=${JSON.stringify(panSeq.settledState)}`);

// ---- GD:旗关臂负结果（同款 pan 无拖影） ----
const neg = await page.evaluate(async () => {
  window.__ghostSet(false);
  window.__calm();
  await window.__waitFrames(4);
  await window.__ghostCap('negStatic');
  window.__panStart();
  await window.__waitFrames(12);
  await window.__ghostCap('negPanEnd');     // cam0（净位移 0）
  await window.__waitFrames(4);
  await window.__ghostCap('negSettle');
  return {
    panVsStatic: window.__ghostCmp('negPanEnd', 'negStatic').diff,
    settleVsPan: window.__ghostCmp('negSettle', 'negPanEnd').diff,
  };
});
chk('GD1 旗关臂 pan 后静止 ≙ pan 末帧（差 ≤ D0,无拖影）', (neg.settleVsPan ?? 1e9) <= D0,
  JSON.stringify(neg));

// ---- GF:屏内滤镜兼容（血月 FilterBloodMoon 激活→K1-2 pipe-stack 链帧） ----
// 滤镜帧链路=链源屏栈 FBO 组装（不读 glCanvas）→链末 present 覆写 glCanvas→
// ghost 帧尾混入读【链输出后】画布——结构上零交集;本节=像素 A/B 实证:
// 静止 bypass 恒等（链输出逐位不脏）+pan 拖影仍在+零页面错误。
const gf = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  g.world.clock.bloodMoon = true;              // 血月滤镜激活（monoFilters.update 目标档）
  r.monoFilters.bloodMoonUseOpacity = 1;       // 斜坡直接钉满（paused 下 update 不推进）
  await window.__waitFrames(8);
  const path1 = r.sfxPathUsed;
  // 静止恒等（ghost on-bypass vs off;滤镜帧=链 present 覆写画布,ghost 不 mix）
  window.__ghostSet(true);
  await window.__waitFrames(30);
  const stF = window.__ghostState();
  await window.__ghostCap('gfOn');
  window.__ghostSet(false);
  await window.__waitFrames(2);
  await window.__ghostCap('gfOff');
  const staticCmp = window.__ghostCmp('gfOn', 'gfOff');
  // pan 拖影（滤镜帧下 mix 仍作用链输出画布）
  window.__ghostSet(true);
  await window.__waitFrames(4);
  window.__panStart();
  await window.__waitFrames(12);
  await window.__ghostCap('gfPanMix');
  window.__ghostSet(false);
  await window.__waitFrames(2);
  await window.__ghostCap('gfPanRaw');
  g.world.clock.bloodMoon = false;
  r.monoFilters.bloodMoonUseOpacity = 0;
  return {
    path1, stF,
    staticDiff: staticCmp.diff,
    trail: window.__ghostCmp('gfPanMix', 'gfPanRaw'),
  };
});
chk('GF1 滤镜链激活（sfxPathUsed=pipe|pipe-stack——K1-2 GPU 链两档:屏栈直入/HUD 源;\n    7x 加算垫底扫尾帧 c10eCompositeIntoHud 已合成→链源取 HUD=pipe 档）',
  gf.path1 === 'pipe' || gf.path1 === 'pipe-stack', `path=${gf.path1}`);
chk('GF2 滤镜帧静止恒等（ghost bypass ≙ 旗关,差 ≤ D0）', (gf.staticDiff ?? 1e9) <= D0,
  `diff=${gf.staticDiff} D0=${D0} state=${JSON.stringify(gf.stF)}`);
chk('GF3 滤镜帧拖影仍在（pan 混合帧 vs 原帧,差 > 10000）', (gf.trail.diff ?? 0) > 10000,
  `diff=${gf.trail.diff} maxΔ=${gf.trail.maxDelta}`);

// ---- GE:缺省关 ----
const page2 = await openPage(browser, {});
await bootstrap(page2, ORIGIN + '/?cloudcache=0');
await createGame(page2, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 7, timeout: 120000 });
const ge = await page2.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 800));
  return { flag: window.__swGame.renderer.constructor.ghostBlur };
});
chk('GE1 无 ?ghostblur 页=旗缺省关', ge.flag === false, JSON.stringify(ge));
chk('GF4 滤镜帧零页面错误（链×ghost 共栈无 GL 错）', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
await page2.close();

chk('页面零错误', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
console.log(`\n== ghostblur AB: ${results.filter((r) => r.ok).length}/${results.length} PASS ==`);
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
