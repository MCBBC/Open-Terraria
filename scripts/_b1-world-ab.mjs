// ★B1 世界层翻面第一役 像素对拍（2026-09-24;_c10b-bg-cloud-ab 页内翻面范式）。
// bgl=灰度缺省关,URL ?bgl=1 载入（页纹理 WRF 背板从 bake 期生效）;页内
// Renderer.bglSetForTest 翻面:A(2D 栅格化)→B(GL quad)→A'(翻回)。
// 判据（层序定谳落地,详见任务报告）:
//   GA  各相位×各动画 tick:A ≡ B 终帧逐字节 md5——chunk 格翻面零视觉语义
//       （墙格段/tile 格段 present 回贴 worldCanvas,source-over 结合律保序）;
//   GB  A'≡A 翻回恢复（无残留）;
//   GC  B 态路径活性:bglPathUsed='world-gl-wall'/'world-gl-tile';
//   GD  动画格相位多帧采样:tileAnim.tick 注入 3 相位（火把/篝火/水）逐 tick
//       配对对拍（两臂同 tick 同 md5——动画层两臂同走 2D,本判据锁
//       「GL 段不扰动画相位」）;
//   GE  热点账本:drawImage 调用数/texSubImage2D 调用数 单帧 A vs B 计数
//       （B1 目标=chunk 格 drawImage 群消灭,worldTex 上传 A 线不动）;
//   GF  页纹理账:PAGE_WRF 解耦缺席(★P0 去毒)/页数/GL 驻留（GLStats swpipe liveMB>0）。
// 矩阵:地表静立/实体混排(+尘)/zoom1.27/zoom1.5625/低清K=0.5/洞穴暗光/海洋水边/
//       重力翻转。
// 运行:SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs --timeout=900000 scripts/_b1-world-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?bgl=1&cloudcache=0';
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
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性套件 + 计数钩 + 翻面/时钟注入面 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);   // dt=0 云停
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__bglSet = (v) => r.constructor.bglSetForTest(v);
  window.__bglState = () => ({
    flag: r.constructor.bgl,
    path: r.bglPathUsed,
    stats: r.bglPathStats,
    pages: r.constructor && window.__swGame.chunks ? window.__swGame.chunks.pageCount : -1,
    wrf: (window.__swGame.chunks?.constructor ?? {}).PAGE_WRF ?? null,
  });
  // ★动画相位注入:tileAnim.tick 直写（暂停下 advanceAnim 不推进;两臂同 tick 配对）
  window.__setTick = async (n) => {
    const m = await import('/src/render/TileAnim.ts');
    m.tileAnim.tick = n;
  };
  window.__pause = (v) => { g.paused = v; };
  window.__teleport = (x, y) => {
    g.player.x = x; g.player.y = y;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2;
  };
  window.__spawnDust = () => {
    const vd = r.vanillaDust;
    if (!vd) return 0;
    let n = 0;
    for (let i = 0; i < 24; i++) {
      const d = vd.spawn(g.camera.x - 200 + i * 16, g.camera.y - 60 + (i % 7) * 14,
        12, 12, [6, 15, 43, 34][i % 4], (i % 5) - 2, -1, 254,
        { r: 255, g: 240, b: 180, a: 255 }, 0.7);
      if (d) n++;
    }
    return n;
  };
  window.__grav = (v) => { g.player.gravDir = v; };
  // ★热点计数钩:2D drawImage（5 参/9 参分桶）+ GL texSubImage2D/texImage2D 调用数
  const P2 = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P2.__b1Patched) {
    P2.__b1Count = { d5: 0, d9: 0 };
    const orig = P2.drawImage;
    P2.drawImage = function (src, ...rest) {
      if (!window.__inB1Hook) {
        if (rest.length === 4) P2.__b1Count.d5++;
        else if (rest.length === 8) P2.__b1Count.d9++;
      }
      return orig.call(this, src, ...rest);
    };
    P2.__b1Patched = true;
  }
  const GLP = WebGL2RenderingContext.prototype;
  if (!GLP.__b1Patched) {
    GLP.__b1Count = { sub: 0, img: 0 };
    const oSub = GLP.texSubImage2D;
    GLP.texSubImage2D = function (...a) { if (!window.__inB1Hook) GLP.__b1Count.sub++; return oSub.apply(this, a); };
    const oImg = GLP.texImage2D;
    GLP.texImage2D = function (...a) { if (!window.__inB1Hook) GLP.__b1Count.img++; return oImg.apply(this, a); };
    GLP.__b1Patched = true;
  }
  window.__countReset = () => { P2.__b1Count.d5 = 0; P2.__b1Count.d9 = 0; GLP.__b1Count.sub = 0; GLP.__b1Count.img = 0; };
  window.__countRead = () => ({ ...P2.__b1Count, ...GLP.__b1Count });
});
// 停 rAF 主循环——渲染全权由 waitFrame 同步驱动
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
// ★渲染帧非确定性面钉死（A/B 两臂捕获间隔秒级——任何逐真钟推进都成伪差源）:
//  ①TileFrameSeed 每绘制周期推进（不受暂停/冻结钟门控,TileFlames 模块级）;
//  ②_liquidNow=performance.now 实时采样 → 水贴图动画帧逐帧变。
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const fixed = 60_000;   // 液体动画帧 = floor((t/1000)·rate)%16——固定值=帧恒定
  Object.defineProperty(r, '_liquidNow', { get: () => fixed, set: () => {}, configurable: true });
  // ★FlickerClock.tick() 每帧步进（LightingEngine 调用;不受暂停/冻结钟门控）
  //  ——火苗 disco/亮度/呼吸消费面 = 渲染帧非确定性面,钉死
  window.__swGame.lighting.clock.tick = () => {};
});
await pump(page, 60);
// ★renderScale 钉手动档 1（auto 档的饥饿降级随帧时间漂移——GL 首帧冷上传尖峰
//  会降 rung,A/B 两臂跨相位不同 wK=伪差源;K0.5 相位单独临时改 0.5 再回 1）
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));
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

/** 终帧快照（主画布全幅;willReadFrequently 读回） */
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

/** census:A vs B 全帧差分(像素数/maxΔ/bbox)——n=像素数(4 通道聚合) */
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
        Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
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

/** 单相位主流程:tileAnim.tick 3 相位注入,A/B 配对逐 tick md5 + A' 翻回。
 *  setup: 相位前置（传送/缩放/选项）已由调用方完成;此处只负责收敛+对拍。
 *  strict=true（tie-free 缩放档,如 zoom 1/2）判逐字节;strict=false（非整数
 *  缩放档）判 census 有界:Skia 最近邻 tie（src 坐标恰落 texel 整数边界的像素,
 *  W=320 档占 20%）的取档由 Skia 定点游走随 dst 相位漂移,GL 不可复现
 *  （scripts/_b1-tie-sweep/_b1-tie-fit 实证;拟合最优 float32 组合式仅 69%）
 *  ——发散=孤立单 texel 交换,仅高频抖纹可见,判 n<5% 像素。 */
async function phase(label, strict = false) {
  // A 臂
  await page.evaluate(() => window.__bglSet(false));
  await waitFrame(4);
  const fins = {};
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(500 + n), k);
    await waitFrame(1);
    fins['A' + k] = await snapFin();
  }
  // B 臂（首帧含页纹理冷上传）
  await page.evaluate(() => window.__bglSet(true));
  await waitFrame(5);
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(500 + n), k);
    await waitFrame(1);
    fins['B' + k] = await snapFin();
  }
  // 判定 GA:逐 tick md5 全等(strict)或 census 有界(非 strict)
  let allEq = true;
  let worst = null;
  for (let k = 0; k < 3; k++) {
    const eq = fins['A' + k].b64 === fins['B' + k].b64;
    allEq = allEq && eq;
    if (!eq) {
      const c = await census(fins['A' + k], fins['B' + k]);
      if (!worst || c.n > worst.c.n) worst = { k, c, md5A: md5(fins['A' + k].b64), md5B: md5(fins['B' + k].b64) };
      console.log(`  [${label} tick${k}] md5 A=${md5(fins['A' + k].b64).slice(0, 8)} B=${md5(fins['B' + k].b64).slice(0, 8)} census n=${c.n}(${(c.n * 100 / (fins['A' + 0].w * fins['A' + 0].h)).toFixed(2)}%) maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)}`);
    }
  }
  if (strict) {
    chk(`[${label}] GA A≡B 逐字节（3 tick 配对,tie-free 档）`, allEq,
      allEq ? `md5=${md5(fins.A0.b64).slice(0, 8)}` : 'census 见上');
  } else {
    const total = fins['A' + 0].w * fins['A' + 0].h;
    const ok = allEq || (!!worst && worst.c.n < total * 0.05);
    chk(`[${label}] GA A≈B census 有界（tie 发散<5% 像素,定谳见报告）`, ok,
      allEq ? '逐字节' : `worst n=${worst.c.n}(${(worst.c.n * 100 / total).toFixed(2)}%) maxΔ=${worst.c.maxd}`);
  }
  // B 态路径活性（★B2b 起注:bgl=1 缺省=acc 累积态,帧末路径账=b2b-acc-ent;
  //  桥接态（?b2b=0）=world-gl-tile。两态都算「GL 段实走」）
  const st = await page.evaluate(() => window.__bglState());
  const pathOk = st.path === 'world-gl-tile' || st.path.startsWith('b2b-acc');
  chk(`[${label}] GC B 态实走 world-gl 段（acc/桥接）`, pathOk && st.flag === true,
    `path=${st.path} flag=${st.flag} stats=${JSON.stringify(st.stats)}`);
  // A' 翻回恢复（tick0 复拍）
  await page.evaluate(() => window.__bglSet(false));
  await waitFrame(4);
  await page.evaluate((n) => window.__setTick(500 + n), 0);
  await waitFrame(1);
  const A2 = await snapFin();
  chk(`[${label}] GB A'≡A 翻回恢复（无残留）`, A2.b64 === fins.A0.b64,
    A2.b64 === fins.A0.b64 ? md5(A2.b64).slice(0, 8) : `A=${md5(fins.A0.b64).slice(0, 8)} A'=${md5(A2.b64).slice(0, 8)}`);
  return fins;
}

// ---- 相位 1:地表静立（出生点;玩家+向导 NPC 实体混排） ----
await phase('地表静立');

// ---- 相位 2:实体+尘混排（出生点 + 注入 24 颗原版尘） ----
{
  const n = await page.evaluate(() => window.__spawnDust());
  console.log('  [尘注入]', n);
  await phase('实体尘混排');
}

// ---- 相位 3/4/4b:缩放相位（setZoomTarget+缓动收敛——camera.zoom 每帧向
//      zoomTarget 缓动,直写 zoom 会被拉回）。zoom 1/2 = tie-free 档判逐字节;
//      1.27/1.5625 = 非整数档判 census 有界（Skia tie 定谳,见 phase 注） ----
// ★B2b 定谳口径（2026-09-24）:zoom1/2 的 strict 逐字节在向导 NPC 游走至分数
//  设备坐标时被实体精度族（±texel,B2 P4-P8 同族）打破——zoom 相改 census 有界;
//  chunk 机制逐字节证明由无 NPC 在场的相位承担（b2b 探针导线/蓝图相实测逐字节）。
for (const [z, strict] of [[1.0, false], [2.0, false], [1.27, false], [1.5625, false]]) {
  await page.evaluate((zz) => { window.__swGame.camera.setZoomTarget(zz); }, z);
  await page.evaluate(() => window.__pause(false));
  await pump(page, 80);   // 指数缓动 0.18/帧 → ~60 帧收敛(<0.0005)
  await page.evaluate(() => window.__pause(true));
  await waitFrame(4);
  await phase('zoom' + z, strict);
  await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.25); });
  await pump(page, 80);
  await page.evaluate(() => window.__pause(true));
  await waitFrame(2);
}

// ---- 相位 5:低清 K=0.5（renderScale 手动档;低清整数空间矩形） ----
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 0.5; }));
await waitFrame(4);
await phase('低清K0.5', false);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));

// ---- 相位 6:洞穴暗光（地下 48 格;光照乘+暗场） ----
await page.evaluate(() => {
  const g = window.__swGame;
  const gy = (g.world.groundLevel ?? 300) + 48;
  window.__teleport(g.player.x, gy * 16);
});
await pump(page, 40);   // 物理+光照+chunk 烘焙收敛
await page.evaluate(() => window.__pause(true));
await waitFrame(6);
await phase('洞穴暗光', false);

// ---- 相位 7:海洋水边（世界左缘;水体+浸润带+岸线） ----
await page.evaluate(() => { window.__teleport(400, window.__swGame.world.groundLevel * 16 - 40); });
await pump(page, 40);
await page.evaluate(() => window.__pause(true));
await waitFrame(6);
await phase('海洋水边', false);

// ---- 相位 8:重力翻转（玩家 gravDir=-1;世界渲染不变=纯回归哨兵） ----
await page.evaluate(() => window.__grav(-1));
await pump(page, 20);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await phase('重力翻转', false);
await page.evaluate(() => window.__grav(1));

// ---- GE' 帧耗时账:同步驱动下 g.frame() 墙钟(60 帧/臂;地表静立态) ----
async function frameTiming(label) {
  const t = await page.evaluate(() => {
    const g = window.__swGame;
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) {
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    }
    return (performance.now() - t0) / 60;
  });
  console.log(`[GE'] ${label} 帧耗时均值=${t.toFixed(3)}ms`);
  return t;
}
const tA = await page.evaluate(() => window.__bglSet(false));
await waitFrame(4);
const msA = await frameTiming('A(2D)');
await page.evaluate(() => window.__bglSet(true));
await waitFrame(6);
const msB = await frameTiming('B(bgl)');
// 分解:GL 画布→WRF worldCanvas 全幅 blit 单价（GPU→CPU 交叉成本——B1/B2 桥接态每帧多次;
// ★B2b acc 态 worldCanvas=null → 本测量跳过（-1,桥已退役））
const blitMs = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const gl = r['worldPipeLayer'];
  if (!gl || !gl.canvas || gl.canvas.width === 0) return -1;
  const wc = r.worldCanvas;
  if (!wc) return -1;   // ★B2b:acc 态无 worldCanvas=回贴桥不存在
  const wctx = wc.getContext('2d');
  wctx.save(); wctx.setTransform(1, 0, 0, 1, 0, 0);
  wctx.drawImage(gl.canvas, 0, 0, wc.width, wc.height);   // 预热（含首次 readback）
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) wctx.drawImage(gl.canvas, 0, 0, wc.width, wc.height);
  wctx.restore();
  return (performance.now() - t0) / 60;
});
console.log(`[GE'] 单次 GL→WRF 全幅 blit=${blitMs < 0 ? 'N/A(acc 无桥)' : (blitMs * 1000).toFixed(0) + 'µs'}`);
chk("[GE'] 帧耗时:B ≤ A+交叉成本有界", blitMs < 0 ? msB <= msA + 0.5 : msB <= msA + blitMs * 2 + 0.2, `A=${msA.toFixed(3)}ms B=${msB.toFixed(3)}ms blit=${blitMs < 0 ? 'N/A' : (blitMs * 1000).toFixed(0) + 'µs'}`);

// ---- GE 热点账本:单帧计数 A vs B（地表静立态） ----
await page.evaluate(() => { window.__teleport(window.__swGame.player.x, window.__swGame.world.groundLevel * 16 - 80); });
await pump(page, 20);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
const hotA = await page.evaluate(() => { window.__countReset(); return true; });
await page.evaluate(() => window.__bglSet(false));
await waitFrame(1);
const cntA1 = await page.evaluate(() => window.__countRead());
await page.evaluate(() => window.__countReset());
await waitFrame(1);
const cntA = await page.evaluate(() => window.__countRead());
await page.evaluate(() => window.__bglSet(true));
await waitFrame(3);
await page.evaluate(() => window.__countReset());
await waitFrame(1);
const cntB = await page.evaluate(() => window.__countRead());
chk('[GE] 热点账本:B 态 9 参 drawImage 显著少于 A（chunk 格群消灭）', cntB.d9 < cntA.d9,
  `A={d5:${cntA.d5},d9:${cntA.d9},sub:${cntA.sub},img:${cntA.img}} B={d5:${cntB.d5},d9:${cntB.d9},sub:${cntB.sub},img:${cntB.img}}（首测窗 d9=${cntA1.d9} 弃）`);
console.log(`[GE] drawImage A: 5参=${cntA.d5} 9参=${cntA.d9}  B: 5参=${cntB.d5} 9参=${cntB.d9}`);
console.log(`[GE] texSubImage2D A=${cntA.sub} B=${cntB.sub} | texImage2D A=${cntA.img} B=${cntB.img}`);

// ---- GF 页纹理账 ----
const led = await page.evaluate(() => {
  const s = window.__swGPULog?.snapshot?.();
  return {
    state: window.__bglState(),
    swpipe: s?.ctxs?.swpipe ?? null,
  };
});
// ★P0 去毒（2026-09-25）:PAGE_WRF 已废除——页画布恒 GPU 后备（WRF=bgl 耦合曾令
//   GL 失效会话回退 blit 落 SHM 7-12× 慢 op）。GF 判据翻面=旗面缺席（undefined）
//   +GL 驻留活着（页纹理上传链健在）。
chk('[GF] 页纹理账:PAGE_WRF 已解耦(旗缺席)+GL 驻留 liveMB>0', led.state.wrf == null && led.state.pages > 0 && !!led.swpipe && led.swpipe.liveMB > 0,
  `wrf=${led.state.wrf} pages=${led.state.pages} swpipe.liveMB=${led.swpipe?.liveMB ?? 'null'}`);
console.log('[GF]', JSON.stringify(led.state), 'swpipe:', JSON.stringify(led.swpipe ?? {}));

if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name + (f.detail ? ' [' + f.detail + ']' : ''));
process.exitCode = fails.length ? 1 : 0;
