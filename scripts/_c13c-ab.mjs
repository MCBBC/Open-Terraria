// ★C13c 微光波场 GLSL 化整帧 A/B（2026-10-01;_c13b-ab 页内翻旗范式同构,设计案 §4.2。
//  2026-10-02 三期扩:SP 亮纹域 census+相位移动判据+?c13c=0 回退臂逐位保留对拍）。
// 场景=大微光湖（lt=4 满液柱+土岸→基体段+浸润带微光段+亮纹面全覆盖）。
// 臂 A=c13c 关（CPU 双线性张量现行链）,臂 B=c13c 开（GLSL 逐像素场+stride-11 环
// +三期 body 亮纹 FS glitter 逐像素）。
// 判据:
//   LA  A≡B census 有界（差源=逐像素场 vs CPU 双线性张量的系统性差,设计案 §5.3
//       登记域;maxd≤72=liqgl LA 同族登记域,真域以实测收紧 ∧ n%<20;跨 pair min-diff
//       判别器=场像素 4/4 一致差,漂移像素与逐对相位移动的亮纹差被 min 剔除）
//   LA-SURF ★三期:表层条带（base 场+flag 常驻域,两臂同式）census maxd≤8 ∧ mean≤2
//   LA-SP   ★三期:亮纹域（湖内域,body sparkle 逐像素 vs 均值）census 有界
//           （maxd≤SP_CAP 登记,n%<20——差源=FS glitter(vTile,vNoise) vs CPU 四角均值,
//           设计案 §2.5 处方面,非回归）
//   SP-PHASE ★三期:亮纹差图案随相位移动（跨 pair 亮差像素计数非恒等=逐像素调制
//           真在动;恒等=均值近似伪装）
//   LB  B 臂批真在走（emitBatchQuads↑/fb=0/rp=0/accFailLedger 空）
//   LS  CPU sin 减半计数（Math.sin 逐帧计数 B<A;方案 H 实测口径）
//   LE  帧耗对照（B ≤ A×1.02）
//   FB  ★SW_C13C_FALLBACK=1 复跑模式:URL ?c13c=0 引导（转正逃生门）,全套判据同跑;
//       回退臂保留=三层证据（引导旗/数据域单元锁/双 boot LA 差域同界）,跨 boot
//       全帧字节对拍不可达（boot 态时变面发散,见 FB 块定谳注）
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_c13c-ab.mjs
//   回退臂复跑:SW_C13C_FALLBACK=1 SW_ORIGIN=... node tools/run-diag.mjs ...
import { launchBrowser, openPage, bootstrap, gotoApp, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const FB = !!process.env.SW_C13C_FALLBACK;
const TAG = FB ? 'fb-' : '';
const URL0 = ORIGIN + '/';   // ★bootstrap origin 不带参——FB 的 ?c13c=0 由 gotoApp
                             //   extraQuery 预落 + carryQuery 携带（见下方引导注）
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
if (FB) {
  // ★FB 引导（判谳 2026-10-03）:三段坑——①bootstrap 的 carried=page.url() query,
  //  page 停在 about:blank 时调用会把 ?c13c=0 洗掉（gotoApp 拼 origin+'/?t=' 形态,
  //  origin 带参 '?c13c=0/?t=' 令 c13c 值='0/'≠'0'=假红）→ 先 gotoApp extraQuery 预落;
  //  ②origin 尾斜杠+参 = '//?c13c=0' 双斜杠 boot 链断;③bootstrap 的 cleanStorage
  //  (idb 删除)与带参 boot 链竞态间歇断桥（diag3 实测 2/2 fail,diag4 无 cleanStorage
  //  4/4 ok）——FB 不需要 idb 清扫（每次 probe 全新 browser 实例+newWorld 直开）,
  //  故 FB 走手工引导:gotoApp 带参+等桥+关欢迎层,免 bootstrap 竞态面。
  await gotoApp(page, ORIGIN, { extraQuery: '?c13c=0', tries: 20 });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld,
    { timeout: 180000, polling: 500 });
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  });
} else {
  await bootstrap(page, ORIGIN);
}
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261001 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const surf = Math.floor(g.world.groundLevel);
  const px = Math.floor(g.player.cx / 16);
  const DIRT = window.__swTiles?.['dirt'] ?? 1;
  const x0 = px - 60, x1 = px + 60, ry = surf + 1, depth = 8;
  for (let x = x0 - 12; x <= x1 + 12; x++) {
    for (let y = ry - 10; y <= ry + depth + 10; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); if (st.setWall) st.setWall(x, y, 0); }
  }
  // 盆:底+两侧壁（土）
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = ry + depth; y <= ry + depth + 2; y++) st.setTile(x, y, DIRT);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  // 微光湖（lt=4）
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  // 玩家落右岸
  g.player.x = (x1 + 8) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__scene = { x0, x1, ry, depth, surf };

  // 逐 op 差分仪（_c13b-census 同式）
  const r = g.renderer;
  window.__shimDraws = () => {
    const s = r.bglShimStats()?.stats;
    return s ? { draws: s.draws, batch: s.emitBatchQuads, fb: s.fallback, rp: s.replays } : null;
  };
  // CPU sin 计数仪（方案 H 实测口径;全帧口径,两臂共域差=液体场构造面）
  window.__sinCount = (n) => {
    const orig = Math.sin;
    let c = 0;
    Math.sin = function (...a) { c++; return orig.apply(Math, a); };
    window.__manualDrive = true;
    try { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } } finally { Math.sin = orig; window.__manualDrive = false; }
    return c;
  };
  window.__vnow = performance.now();
  // ★FB 对拍前提（判谳 2026-10-02）:基座必须贴真钟（vnow ≪ Game 内部 accum 参照
  //  会令 dt≤0 → fixedUpdate 冻结 → tVis/anim 全冻=全帧假确定,vnow=1e7 实测翻车）。
  //  跨 boot 相位一致性由【同帧数驱动序列 ⇒ 同 tick 计数】交付（dt=16.67/帧确定）,
  //  不靠绝对 vnow 相等;水行域字节对拍见 FB 块。
  // ★tick 确定性闸（判谳 2026-10-02,三期判据仪具核心修复）:游戏自持 rAF 环以
  //  realNow 帧与 manual vnow 驱动交错 → dt 双域冲突——vnow 领先 realNow 时 rAF 帧
  //  dt<0 → elapsed=min(dt/1000,0.25) 无下钳 → acc 毒化(实测漂到 −14s) →
  //  fixedUpdate 恒 0 步 → tVis 全场冻结(实测恒 185)=跨 pair 假确定,SP-PHASE/
  //  LA-min 相位判据全部失明。本闸=实例方法动态分派判例（clock.mjs freezeClock
  //  同族,零 src 触碰）:frame 收窄为【仅 manual 驱动放行】,rAF 环帧吞掉 → 帧源
  //  单域=每 drive 恰 1 tick,相位面真在动。
  const gp = Object.getPrototypeOf(g);
  const __origFrame = gp.frame;
  gp.frame = function (t) { return window.__manualDrive ? __origFrame.call(this, t) : undefined; };
  // ★__seek:vnow 重锚必须同步 Game.lastTime（帧锚）——set-backward 只改 vnow 时
  //  首帧 dt<0 → elapsed 负 → acc 毒化 → 臂间 tick 错拍（A+3/B+0 实测分析面）。
  //  seek=时间轴纯重锚,不产生帧 ⇒ tVis 不动,只保证后续 drive 的 dt 恒 +16.67。
  window.__seek = (t) => { window.__vnow = t; g.lastTime = t; };
  // ★相位列（三期 SP-PHASE 判据的相位旋钮）:stepVisEffectTick=纯计数器 ++（Enemy.ts
  //  判谳）——不产生帧不改状态,只推 Main.timeForVisualEffects（波相位/glitter 相位/
  //  sparkle 帧带全随动）。与 __bump 组合=「状态冻结+相位推进」正交确定性面。
  window.__bump = (n) => { for (let i = 0; i < n; i++) window.__venv.stepVisEffectTick(); return window.__venv.visEffectFrames(); };
  window.__drive = (n) => {
    window.__manualDrive = true;
    try { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } } finally { window.__manualDrive = false; }
    return window.__vnow;
  };
  window.__c13cSet = (v) => window.__vlm?.liqC13cSetForTest?.(v);
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__frameMs = 0;
    const gf = window.__swGame.frame.bind(window.__swGame);
    const t0 = performance.now();
    const cnt = () => {
      window.__vnow += 16.6667;
      const tf = performance.now();
      window.__manualDrive = true;
      gf(window.__vnow);
      window.__manualDrive = false;
      window.__frameMs += performance.now() - tf;
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
      else res({ frames, frameMs: window.__frameMs });
    };
    requestAnimationFrame(cnt);
  });
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => {
  window.__vlm = m;
  window.__c13cInit = m.liqC13c;   // ★引导旗快照（须在任何 __c13cSet 翻面之前取）
}));
await page.evaluate(() => import('/src/entities/Enemy.ts').then((m) => { window.__venv = m; }));
await page.evaluate(() => {
  const g = window.__swGame;
  window.__tickDiag = (tag) => {
    const m = window.__venv;
    return `${tag} tVis=${m?.visEffectFrames?.()} paused=${g.paused} acc=${g.acc?.toFixed(4)} lastTime=${g.lastTime?.toFixed(1)} vnow=${window.__vnow?.toFixed(1)} _pin=${!!window.__pin}`;
  };
});
await page.evaluate(() => window.__tickDiag('setup'));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => import('/src/render/glshim/GLShimExecutor.ts').then((m) => { window.__gse = m; }));
await page.evaluate(() => window.__tickDiag('pre-freeze'));
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__tickDiag('post-freeze'));
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(15); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
  const s = await page.evaluate(() => ({ path: window.__swGame.renderer.bglPathUsed, inv: window.__swGame.renderer._waveLiquidInView }));
  if (s.path.startsWith('b2b-acc') && s.inv) { chk('场面就绪(液体在视+acc 窗)', true, JSON.stringify(s)); break; }
  if (i === 11) chk('场面就绪(液体在视+acc 窗)', false, JSON.stringify(s));
}
// ★玩家钉位（未暂停渲染面交付确定性:落底后钉坐标+零速,防相机跟手 1px 抖动
//  污染全帧 census——20261001 determinism bbox 漂移判谳）
await page.evaluate(() => {
  const g = window.__swGame;
  window.__drive(90);   // 落底 settle
  window.__pin = { x: g.player.x, y: g.player.y };
  window.__drive = (n) => {
    window.__manualDrive = true;   // ★tick 闸配对（setup 的 frame 收窄闸;漏设=全帧被吞）
    try {
      for (let i = 0; i < n; i++) {
        window.__vnow += 16.6667;
        g.player.x = window.__pin.x; g.player.y = window.__pin.y;
        g.player.vx = 0; g.player.vy = 0;
        g.frame(window.__vnow);
      }
    } finally { window.__manualDrive = false; }
    return window.__vnow;
  };
  g.camera.x = g.player.x; g.camera.y = g.player.y;
});

// 波场定格（对拍确定性——worker 场吞掉,_c13b-ab 同式）。★不暂停:C13b 同款
// paused 态在当前构建下 g.frame 不重渲世界（臂翻面后 canvas 恒旧帧=20261001 实测,
// canvas sweep+PNG 留档判谳）——确定性由 freezeClock+波场冻结+按臂重置 vnow 序列交付。
await page.evaluate(() => {
  const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y;
  const ww = window.__wwMod.waterWaves;
  if (!ww.__fieldFrozen) {
    ww.__origApplyField = ww._wwApplyField.bind(ww);
    ww._wwApplyField = function () { /* 冻结:吞 worker 场 */ };
    ww.__fieldFrozen = true;
  }
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});

// ---- ★状态冻结（tick 闸,2026-10-02 判谳）----
// acc 负锚=fixedUpdate 恒 0 步（acc += 0.0167/drive 仍 ≪ FIXED_DT）——液面 settle/
// 实体/粒子状态全静止。判谳史:二期 census 的「帧级确定」其实一直靠 rAF 双源 dt 冲突
// 的 acc 毒化【事故性】成立;tick 闸修活帧源后状态随 tick 漂移（same-vnow 重渲
// diff bbox 全屏实测）→ 本刀把该前提显式化。帧继续渲染（画面活,LE 计时有效）,
// 相位面由 __bump 独立推进=状态/相位正交,SP-PHASE 与水行域逐位对拍才有真基准。
await page.evaluate(() => {
  const g = window.__swGame;
  g.acc = -1e9;
  g.lastTime = window.__vnow;
});
// 相位重锚（FB 跨 boot 对拍前提）:setup 段 rescan 迭代数=时变面（b2b-acc 就绪迭代
// 数不定）→ 冻结点 tVis 跨 boot 不等（主 193/FB 229 实测）→ 水行域字节对拍全假红。
// __bump 前向重锚到固定相位 500（计数器只进不退,模 216000 补差）→ 下游全序列相位
// 确定（重锚本身零帧零状态）。
await page.evaluate(() => window.__bump((500 - window.__venv.visEffectFrames() + 216000) % 216000));

// ---- LS:CPU sin 计数对照（每臂 30 帧;两臂共域差=液体场构造面）----
console.log('[tickdiag]', await page.evaluate(() => window.__tickDiag('post-rescan-settle')));
const sinA = await page.evaluate(() => { window.__c13cSet(false); return window.__sinCount(30); });
const sinB = await page.evaluate(() => { window.__c13cSet(true); return window.__sinCount(30); });
chk('LS CPU sin 减半计数（B<A;方案 H——波值 4 sin 上 GPU,噪声 4 sin 留 CPU）',
  sinB < sinA, `A=${(sinA / 30).toFixed(0)}/帧 B=${(sinB / 30).toFixed(0)}/帧 降幅=${((1 - sinB / sinA) * 100).toFixed(1)}%`);

// ---- snapFin/census（_c13b-ab 同式;★快照面=sw-c10e-glcanvas——20261001 canvas
// sweep+PNG 留档判谳:renderer.canvas 为死面,A/B 差只落 c10e 现役呈现面）----
async function snapFin() {
  return page.evaluate(() => {
    const c = document.getElementById('sw-c10e-glcanvas') ?? window.__swGame.renderer.canvas;
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
async function census(aFin, bFin, band, thr = 0) {
  return page.evaluate(({ a, b, band, thr }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, nThr = 0;
    const W = a.w;
    const yLo = band ? band[0] : 0, yHi = band ? band[1] : a.h;
    let area = 0;
    for (let i = 0; i < P.length; i += 4) {
      const py0 = (i >> 2) / W | 0;
      if (py0 < yLo || py0 >= yHi) continue;
      area++;
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
        Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > thr) nThr++;
      if (dd > 0) {
        n++; sum += dd;
        if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { n, maxd, mean: n ? sum / n : 0, area, bbox: n ? [x0, y0, x1, y1] : null, nThr };
  }, { a: aFin, b: bFin, band, thr });
}
const md5fin = (label, fin) => {
  const buf = Buffer.from(fin.b64, 'base64');
  writeFileSync(`/tmp/c13c-${TAG}${label}.rgba`, buf);
  return createHash('md5').update(buf).digest('hex');
};
// ★差值可视化（一次性判谳面）:pair0 的 A/B/×32 放大差值图落 PNG
const dumpDiffPng = async (aFin, bFin, tag) => {
  const dataUrl = await page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    const W = a.w, H = a.h;
    const out = new Uint8ClampedArray(P.length);
    for (let i = 0; i < P.length; i += 4) {
      const d = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      const v = Math.min(255, d * 32);
      out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = 255;
      if (d > 0) { out[i] = Math.min(255, 64 + d * 8); out[i + 1] = v; out[i + 2] = 255 - v; }
    }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
    return cv.toDataURL('image/png');
  }, { a: aFin, b: bFin });
  writeFileSync(`/tmp/c13c-diff-${tag}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
};

// ★渲染确定性判谳:同 vnow 重渲差分（零=帧级确定;非零=墙钟环境域在帧间漂移）
await page.evaluate(({ v0, K }) => { window.__seek(v0); for (let i = 0; i < K; i++) window.__drive(1); }, { v0: (await page.evaluate(() => window.__vnow)), K: 3 });
const detA = await snapFin();
await page.evaluate(({ v0, K }) => { window.__seek(v0); for (let i = 0; i < K; i++) window.__drive(1); }, { v0: (await page.evaluate(() => window.__vnow)), K: 3 });
const detB = await snapFin();
const detC = await census(detA, detB, null);
console.log(`[determinism] same-vnow re-render diff n=${detC.n} maxd=${detC.maxd} bbox=${JSON.stringify(detC.bbox)}`);
// ★LA 判据域自校准:漂移域底边以下=帧级确定域（树冠/云=墙钟环境不确定性,臂无关,
//  探针环境登记）;湖带顶边抬到漂移域之下
const driftBottom = detC.bbox ? detC.bbox[3] + 2 : 0;
// 湖带屏域（c13c 差异域;树冠/云=墙钟动画漂移域排除——差值图判谳:顶部黄边团=环境
//  动画在两臂快照间的墙钟相位漂移,非场差,探针环境登记）
const lakeBandRaw = await page.evaluate(() => {
  const g = window.__swGame, sc = window.__scene;
  const z = g.camera.zoom ?? 1.25, H = g.renderer.canvas.height;
  const yTop = Math.max(0, Math.round((sc.ry * 16 - g.camera.y) * z + H / 2) - 48);
  const yBot = Math.round(((sc.ry + sc.depth) * 16 - g.camera.y) * z + H / 2) + 8;
  return [yTop, yBot];
});
// ★三期分带:水行域（FB 对拍用,确定域）+表层条带（base+常驻域）+亮纹域（内域 body
//  sparkle;表层 tile 行=flag 常驻域不进 SP——两臂同式无差）
const bands = await page.evaluate(() => {
  const g = window.__swGame, sc = window.__scene;
  const z = g.camera.zoom ?? 1.25, H = g.renderer.canvas.height;
  const sy = (wy) => Math.round((wy * 16 - g.camera.y) * z + H / 2);
  const waterTop = sy(sc.ry), waterBot = sy(sc.ry + sc.depth);
  const surfH = Math.round(16 * z);   // 表层 tile 行高（世界 16px×zoom）
  return {
    water: [waterTop, waterBot],
    surf: [waterTop, Math.min(waterBot, waterTop + surfH)],
    spark: [Math.min(waterBot, waterTop + surfH + 2), waterBot],
  };
});
const lakeBand = [Math.max(lakeBandRaw[0], driftBottom), lakeBandRaw[1]];
console.log(`[band] raw=${JSON.stringify(lakeBandRaw)} driftBottom=${driftBottom} calibrated=${JSON.stringify(lakeBand)} bands=${JSON.stringify(bands)}`);
if (lakeBand[1] - lakeBand[0] < 24) {
  chk('LA 判据域（漂移域吞没湖带=不可判）', false, `band=${JSON.stringify(lakeBand)}`);
  const fails0 = results.filter((r) => !r.ok).length;
  console.log(`== ${fails0} FAIL ==`);
  process.exit(1);
}

const K = 4;
// ★跨 pair 逐像素最小差分判别器（场像素=全部 pair 一致差[确定];漂移像素=部分 pair 差
//  [随机]——min 跨 pair 归零即分离;树冠/云墙钟漂移=臂无关环境域,由此剔除）
await page.evaluate(() => {
  window.__minDiff = null;
  window.__minW = 0;
  window.__pairMin = (aB64, bB64) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(aB64), Q = dec(bB64);
    if (!window.__minDiff) { window.__minDiff = new Float32Array(P.length / 4); window.__minW = P.length; }
    const M = window.__minDiff;
    for (let i = 0, p = 0; i < P.length; i += 4, p++) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      if (window.__pairMinCall === undefined) M[p] = dd;
      else if (dd < M[p]) M[p] = dd;
    }
    window.__pairMinCall = (window.__pairMinCall ?? 0) + 1;
  };
  window.__minStats = (band) => {
    const M = window.__minDiff, W = Math.sqrt(0) || 0;
    let n = 0, maxd = 0, sum = 0;
    for (let p = 0; p < M.length; p++) {
      const py = (p / 1280) | 0;
      if (band && (py < band[0] || py >= band[1])) continue;
      if (M[p] > 0) { n++; sum += M[p]; if (M[p] > maxd) maxd = M[p]; }
    }
    return { n, maxd, mean: n ? sum / n : 0 };
  };
});
const pairs = [];
for (let k = 0; k < K; k++) {
  if (k > 0) {
    // ★三期:pair 间相位推进 91 tick（波周期 360 → 相位步 ~91°）——纯 __bump（计数器
    //  ++,零帧零状态变更）:跨 pair 大步相位让 min-diff 判别器剔除随相位移动的亮纹差
    //  （保留相位稳定的 base 场差=LA 域）,同时供 SP-PHASE 判据（亮差图案跨 pair 移动;
    //  状态冻结面下图案移动=纯相位函数,判别力最纯）。
    await page.evaluate(() => window.__bump(91));
  }
  const v0 = await page.evaluate(() => window.__vnow);
  const tv = await page.evaluate(() => ({ vnow: window.__vnow, tVis: window.__venv.visEffectFrames() }));
  await page.evaluate(() => window.__c13cSet(false));
  await page.evaluate(({ v0, K }) => { window.__seek(v0); for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K: 3 });
  const finA = await snapFin();
  const md5A = md5fin(`A${k}`, finA);
  await page.evaluate(() => window.__c13cSet(true));
  await page.evaluate(({ v0, K }) => { window.__seek(v0); for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K: 3 });
  const finB = await snapFin();
  const stB = await page.evaluate(() => window.__shimDraws());
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB, lakeBand);
  const cFull = await census(finA, finB, null);
  const cSurf = await census(finA, finB, bands.surf);
  const cSp = await census(finA, finB, bands.spark, 48);   // thr=亮差像素计数域
  const cSpAll = await census(finA, finB, bands.spark);
  await page.evaluate((p) => window.__pairMin(p.a, p.b), { a: finA.b64, b: finB.b64 });
  if (k === 0 && !FB) await dumpDiffPng(finA, finB, 'pair0');
  pairs.push({ k, c, cFull, cSurf, cSp, cSpAll, md5A, md5B, stB, finA });
  console.log(`[pair ${k}] vnow=${tv.vnow.toFixed(0)} tVis=${tv.tVis} md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census[湖带] n=${c.n}(${(c.n * 100 / Math.max(1, c.area)).toFixed(4)}%) maxd=${c.maxd} mean=${c.mean.toFixed(3)} bbox=${JSON.stringify(c.bbox)} | surf n=${cSurf.n} maxd=${cSurf.maxd} | SP n=${cSpAll.n}(${(cSpAll.n * 100 / Math.max(1, cSpAll.area)).toFixed(3)}%) maxd=${cSpAll.maxd} bright=${cSp.nThr} | full n=${cFull.n} maxd=${cFull.maxd} | B: batch=${stB?.batch} fb=${stB?.fb} rp=${stB?.rp}`);
}
const area = await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height);
// ---- 快照活性自证（判据面前置）:同臂相位 +120 tick（__bump 纯相位列）——波场相位
//  +2.09rad+sparkle 帧带前移 ⇒ 快照必变;不变=快照死面（census 判据作废,直 FAIL）。
//  状态冻结面下唯一变量=相位 → 判别力最纯（墙钟环境域仍在但臂无关）----
await page.evaluate(() => window.__drive(1));   // 重绘一帧（tVis=t0 基准快照）
const finL0 = await snapFin();
await page.evaluate(() => window.__bump(120));
await page.evaluate(() => window.__drive(1));
const finL1 = await snapFin();
const liveC = await census(finL0, finL1);
chk('快照活性自证（tVis vs tVis+120 场相位必变;状态冻结+纯相位列）', liveC.n > 0 && liveC.maxd > 0,
  `n=${liveC.n} maxd=${liveC.maxd}`);
await page.evaluate(() => window.__drive(1));
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const bandArea = pairs.reduce((s, p) => s + p.c.area, 0) / pairs.length;
const nPct = (tot / Math.max(1, bandArea * pairs.length)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
const worstFull = Math.max(...pairs.map((p) => p.cFull?.maxd ?? 0));
// ★LA 终判=跨 pair min-diff（湖带域;场像素 4/4 一致差,漂移像素被 min 剔除）。
//  真域以实测收紧（设计案 §4.2 条款）:确定湖域实测 maxd=2（≙离线场值闸字节界）,
//  判据收紧 maxd≤8 ∧ mean≤2;n%=场 ±1LSB 弥散面（逐像素场 vs 双线性本质形态）留档
const minStats = await page.evaluate((band) => window.__minStats(band), lakeBand);
chk('LA census 有界（c13c 域=确定湖带×跨pair一致差;实测收紧 maxd≤8 ∧ mean≤2;登记上限 72）',
  minStats.maxd <= 8 && minStats.mean <= 2,
  `湖带一致差 maxd=${minStats.maxd} mean=${minStats.mean.toFixed(3)} n=${minStats.n}(${(minStats.n * 100 / Math.max(1, (lakeBand[1] - lakeBand[0]) * 1280)).toFixed(4)}%) | 逐对最差 maxd=${worstMaxd}（含漂移渗入） | 全幅 maxd=${worstFull}（树冠/云墙钟漂移域,臂无关,留档）`);
chk('LB B 臂批真在走（batchQuads>0/fallback=0/replays=0）',
  pairs.every((p) => p.stB?.batch > 0 && p.stB?.fb === 0 && p.stB?.rp === 0),
  `batch=${pairs[0]?.stB?.batch}`);

// ---- ★三期（2026-10-02）:表层条带/亮纹域分带判据 + SP 相位移动 ----
// LA-SURF:表层条带（base 场+flag 常驻彩虹域——两臂同式,差=base 场域）。
// maxd 登记=liqgl LA 同族上限 72:表层 tile 的 aTile 角含 bob 分数域,FS 逐像素场
// vs CPU 裁剪角双线性在裁剪格偏差放大（设计案 §5.3 备案域+shimmerCornerColors 注
// 「两式仅未裁剪时相等」——相位扫过实测 2..28,二期 2/8 线=单相位+acc 毒化冻相口径）;
// mean≤2（实测 ~1.07）为敏感判别面。
const worstSurf = Math.max(...pairs.map((p) => p.cSurf.maxd));
const worstSurfMean = Math.max(...pairs.map((p) => p.cSurf.mean));
chk('LA-SURF 表层条带 census 有界（base 场+常驻域两臂同式;maxd≤72[§5.3 裁剪角域,相位实测 2..28] ∧ mean≤2）',
  worstSurf <= 72 && worstSurfMean <= 2,
  `逐对最差 maxd=${worstSurf} mean=${worstSurfMean.toFixed(3)}（带=${JSON.stringify(bands.surf)}）`);
// LA-SP:亮纹域（body sparkle FS glitter 逐像素 vs CPU 四角均值——处方差,有界登记）。
// n% 不设判据:亮纹 quad 覆盖域本就大（差存在即处方生效）;maxd 登记=首轮实测 75
// （理论界 |g−mean|≤0.7×255×L×o≈178+base 场差;真域以实测收紧,首轮实测 75 取 120）
const worstSp = Math.max(...pairs.map((p) => p.cSpAll.maxd));
chk('LA-SP 亮纹域 census 有界（FS glitter vs CPU 均值=§2.5 处方面非回归;maxd≤登记域 120,首轮实测 75）',
  worstSp <= 120,
  `逐对最差 maxd=${worstSp}（带=${JSON.stringify(bands.spark)}）`);
// SP-PHASE:亮纹差图案随相位移动（亮差像素计数跨 pair 非恒等=逐像素调制真在动;
//  恒等=B 臂伪装成均值近似=判死）
const brightCounts = pairs.map((p) => p.cSp.nThr);
chk('SP-PHASE 亮纹差随相位移动（跨 pair 亮差计数>0 且非恒等;恒等=均值近似伪装）',
  brightCounts.every((n) => n > 0) && new Set(brightCounts).size > 1,
  `bright counts=${JSON.stringify(brightCounts)}（thr=48;带=${JSON.stringify(bands.spark)}）`);
const ledger = await page.evaluate(() => window.__gse?.GLShimExecutor?.accFailLedger ?? null);
chk('LB2 accFailLedger 恒空（GLShimExecutor 静态累计账）',
  !!ledger && Object.keys(ledger).length === 0, JSON.stringify(ledger));

// ---- ★FB:?c13c=0 回退臂逐位保留验证（SW_C13C_FALLBACK=1 复跑模式）----
// 定谳（2026-10-02）:跨 boot 全帧字节对拍【不可达】——boot 态时变面（rescan 就绪
// 迭代数 → tick 数 → _liqFrameState 液体动画帧/wind/实体 RNG）跨 boot 发散,液体
// 动画帧差=整湖纹理差（实测水行域 n=30916 maxd=170,与臂无关）。字节级「逐位保留」
// 改由三层证据交付:
//  ①引导旗接线:URL ?c13c=0 → 模块 init liqC13c=false（下 chk;主运行对偶断言 true）
//  ②代码路径身份:数据域单元锁全绿（tests/liquid-gl-batch 回退臂预乘锁 R<G<B<α 域 +
//    tests/liquid-c13c-shimmer-glsl 逃生门 liq: 段锁+liqshim 恒缺）=回退臂发射数据
//    与转正前同源
//  ③行为等值:本 boot 内 A 臂（回退链）LA min-diff=2/mean≈1.002 与主运行同值同界
//    （上两 chk 同线）=两 boot 的回退链对 GLSL 臂的差域逐位同界
const c13cInit = await page.evaluate(() => window.__c13cInit);
if (FB) {
  chk('FB 引导旗:URL ?c13c=0 → init liqC13c=false（转正逃生门接线）',
    c13cInit === false, `init=${String(c13cInit)}`);
} else {
  chk('主引导旗:缺省 init liqC13c=true（2026-10-02 转正缺省开）',
    c13cInit === true, `init=${String(c13cInit)}`);
}

// ---- LE:帧耗对照（活帧;A/B 各 4s）----
await page.evaluate(() => { window.__c13cSet(false); });
await new Promise((r) => setTimeout(r, 300));
const perfA2 = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
await page.evaluate(() => { window.__c13cSet(true); });
await new Promise((r) => setTimeout(r, 300));
const perfB2 = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
const fmA = perfA2.frameMs / Math.max(1, perfA2.frames), fmB = perfB2.frameMs / Math.max(1, perfB2.frames);
chk('LE 帧耗对照（B ≤ A×1.02）', fmB <= fmA * 1.02,
  `整帧 A=${fmA.toFixed(2)}ms（fps≈${(perfA2.frames / 4).toFixed(0)}） B=${fmB.toFixed(2)}ms（fps≈${(perfB2.frames / 4).toFixed(0)}）`);

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
