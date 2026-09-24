// ★B2b worldCanvas 退役 像素对拍+三消归零证明（2026-09-24;_b1-world-ab 页内翻面范式）。
// A 臂=?bgl=0（全 2D 真值）;B 臂=bgl=1（缺省=acc 累积态）。页内 bglSetForTest 翻面。
// 判据：
//   GA  各相位×各 tick:A ≡ B 终帧逐字节 md5（tie-free 档）/census 有界（非整数档,
//       Skia tie 定谳口径<5%;混沌波场相放宽并登记）;
//   GB  A'≡A 翻回恢复;
//   GC  B 态 worldCanvas === null（三消③画布本体;降级帧才惰性建）;
//   GD  动画相位多帧采样（tileAnim.tick 3 相位配对）;
//   GE  热点账本三消:①全幅 texSubImage2D(≥600px 高)B=0 ②swpipe 画布→2D 全幅
//       回贴次数 B=1(仅最终合成) vs A≥4 ③compose 链 worldCanvas 上传归零;
//   GF  降级面:bglPathStats 无 'b2b-acc-degraded'（稳态零降级）;
//   GG  帧耗时 A vs B（快机兑现点:acc 应有正收益——B1/B2 桥接态曾打平）;
//   GH  新层相位:导线/标尺/宏伟蓝图(strokeRect 隔离栅格化)/风摆多帧/汪洋 warp
//       (chaos census)/背景液体+浸润带/火苗/瀑布/晶塔（自然出现按场景）。
// 矩阵:地表静立/实体尘混排/zoom1/2(逐字节)/1.27/1.5625(census)/低清K0.5/洞穴暗光/
//       海洋水边/重力翻转/导线/标尺+蓝图/风摆/warp 水体。
// 运行:SW_ORIGIN=http://localhost:5212 node tools/run-diag.mjs --timeout=1200000 scripts/_b2b-world-ab.mjs
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
  window.__b2bSet = (v) => r.constructor.b2bSetForTest(v);
  window.__accState = () => ({
    flag: r.constructor.bgl, b2b: r.constructor.b2b,
    path: r.bglPathUsed,
    stats: r.bglPathStats,
    worldCanvasNull: r.worldCanvas === null,   // 三消③:稳态零创建
    creations: r.b2bWorldCanvasCreations,      // 建面计数（acc 帧不增;翻 2D 臂首次 +1）
    pipeAlive: !!r['worldPipeLayer'],
  });
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
  // 尘池清空（尘在暂停下不过期——严格相位需要无尘干净场,精确族误差隔离到尘相位）
  window.__killDust = () => {
    const vd = r.vanillaDust;
    if (!vd) return 0;
    let n = 0;
    for (const d of vd['pool'] ?? []) { if (d.active) { d.active = false; n++; } }
    return n;
  };
  // ★新层注入:导线条带（玩家脚下 24×8 格红+蓝线）/标尺/宏伟蓝图(strokeRect 族)
  window.__wirePhase = (on) => {
    r.showWires = on;
    r.wireModes = [1, 1, 1, 1, 1];
    const st = g.world.store;
    const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
    for (let y = py - 2; y < py + 6; y++) {
      for (let x = px - 12; x < px + 12; x++) {
        if (!st.inBounds(x, y)) continue;
        st.wire[st.idx(x, y)] = on ? ((x + y) % 2 ? 1 : 2) : 0;
      }
    }
  };
  window.__rulerPhase = (on) => {
    if (!on) { r.builderRulers = null; return; }
    const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
    r.builderRulers = {
      lineOn: true, gridOn: true,
      feetTx: px, feetTy: py, nudge: 1,
      mouseTx: px + 7, mouseTy: py - 3,
      speed: 0, gridDist: 0, gravDir: 1,
    };
  };
  window.__grandPhase = (on) => {
    const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
    r.grandPreview = on ? { from: [px - 5, py - 4], to: [px + 6, py + 3], mode: 1 } : null;
  };
  // ★热点计数钩:2D drawImage（5/9 参分桶+swpipe 画布回贴专账）+ GL texSub/texImage
  //   （全幅判据:h≥600 的 texSubImage2D=compose worldCanvas 上传特征）
  const P2 = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P2.__b2bPatched) {
    P2.__b2bCount = { d5: 0, d9: 0, pipeBlit: 0 };
    const orig = P2.drawImage;
    P2.drawImage = function (src, ...rest) {
      if (!window.__inB2bHook) {
        if (rest.length === 4) P2.__b2bCount.d5++;
        else if (rest.length === 8) P2.__b2bCount.d9++;
        if (src === window.__pipeCanvas()) P2.__b2bCount.pipeBlit++;
      }
      return orig.call(this, src, ...rest);
    };
    P2.__b2bPatched = true;
  }
  const GLP = WebGL2RenderingContext.prototype;
  if (!GLP.__b2bPatched) {
    GLP.__b2bCount = { sub: 0, subFull: 0, img: 0 };
    const oSub = GLP.texSubImage2D;
    GLP.texSubImage2D = function (target, level, xo, yo, ...a) {
      if (!window.__inB2bHook) {
        GLP.__b2bCount.sub++;
        // 7 参 DOM 形态 (…,fmt,type,src):src=世界画布且全幅高 → compose worldCanvas 上传特征
        if (a.length === 3 && a[2] && a[2] === window.__swGame.renderer.worldCanvas) GLP.__b2bCount.subFull++;
        else if (a.length >= 9 && a[3] >= 600) GLP.__b2bCount.subFull++;
      }
      return oSub.apply(this, arguments);
    };
    const oImg = GLP.texImage2D;
    GLP.texImage2D = function (...a) { if (!window.__inB2bHook) GLP.__b2bCount.img++; return oImg.apply(this, a); };
    GLP.__b2bPatched = true;
  }
  window.__pipeCanvas = () => {
    const r = window.__swGame.renderer;
    const p = r['worldPipeLayer'];
    return p ? p.canvas : null;
  };
  window.__countReset = () => { P2.__b2bCount.d5 = 0; P2.__b2bCount.d9 = 0; P2.__b2bCount.pipeBlit = 0; GLP.__b2bCount.sub = 0; GLP.__b2bCount.subFull = 0; GLP.__b2bCount.img = 0; };
  window.__countRead = () => ({ ...P2.__b2bCount, ...GLP.__b2bCount });
});
// 停 rAF 主循环——渲染全权由 waitFrame 同步驱动
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const fixed = 60_000;
  Object.defineProperty(r, '_liquidNow', { get: () => fixed, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
await pump(page, 60);
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

/** 单相位主流程:A(2D)/B(acc) 配对逐 tick + A' 翻回。strict=true 判逐字节。 */
async function phase(label, strict = false, pctMax = 5, maxdMax = 255) {
  const fins = {};
  // B 臂先跑（bgl 开=acc 累积;建面计数快照→比对,acc 帧零建面=三消③判据）
  await page.evaluate(() => window.__bglSet(true));
  await waitFrame(5);
  const stB = await page.evaluate(() => window.__accState());
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(500 + n), k);
    await waitFrame(1);
    fins['B' + k] = await snapFin();
  }
  const stB2 = await page.evaluate(() => window.__accState());
  // A 臂（bgl 关=全 2D;此臂会建 worldCanvas=后续相位不再判 null 只判计数）
  await page.evaluate(() => window.__bglSet(false));
  await waitFrame(4);
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(500 + n), k);
    await waitFrame(1);
    fins['A' + k] = await snapFin();
  }
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
  const total = fins['A' + 0].w * fins['A' + 0].h;
  const ok = strict ? allEq : (allEq || (!!worst && worst.c.n < total * pctMax / 100 && worst.c.maxd <= maxdMax));
  chk(`[${label}] GA A${strict ? '≡' : '≈'}B ${strict ? '逐字节（3 tick,tie-free 档）' : `census 有界(<${pctMax}%,maxΔ≤${maxdMax})`}`, ok,
    allEq ? `md5=${md5(fins.A0.b64).slice(0, 8)}` : (worst ? `worst n=${worst.c.n}(${(worst.c.n * 100 / total).toFixed(2)}%) maxΔ=${worst.c.maxd}` : '?'));
  // B 态 worldCanvas 本体三消（B 臂 span 内零建面）+ 降级面
  const st = stB2;
  chk(`[${label}] GC B 臂 span 零建面（三消③）`, st.creations === stB.creations && st.flag === true,
    `creations ${stB.creations}→${st.creations} path=${st.path}`);
  const degraded = Object.keys(st.stats).filter((k) => k.startsWith('b2b-acc-degraded')).reduce((a, k) => a + st.stats[k], 0);
  chk(`[${label}] GF 稳态零降级`, degraded === 0, `degraded=${degraded} path=${st.path}`);
  // A' 翻回恢复
  await page.evaluate(() => window.__bglSet(false));
  await waitFrame(4);
  await page.evaluate((n) => window.__setTick(500 + n), 0);
  await waitFrame(1);
  const A2 = await snapFin();
  chk(`[${label}] GB A'≡A 翻回恢复（无残留）`, A2.b64 === fins.A0.b64,
    A2.b64 === fins.A0.b64 ? md5(A2.b64).slice(0, 8) : `A=${md5(fins.A0.b64).slice(0, 8)} A'=${md5(A2.b64).slice(0, 8)}`);
  return fins;
}

// ---- 相位 1:地表静立（出生点;玩家+向导 NPC 实体混排;背景液体/动画格/火苗/windSway=off 在场）
// pctMax=0.005+maxdMax=8:GPU 8bit 混合 vs Skia 逐像素舍入的 ±LSB 精度族（B2 登记口径,bounded 像素） ----
await phase('地表静立', false, 0.005, 8);

// ---- 相位 2:实体+尘混排（尘相位=census 有界:尘屏坐标分数态=精度登记族,B2 P4-P8 同口径） ----
{
  const n = await page.evaluate(() => window.__spawnDust());
  console.log('  [尘注入]', n);
  await phase('实体尘混排', false, 0.01);
  const killed = await page.evaluate(() => window.__killDust());
  console.log('  [尘清空]', killed);
}

// ---- 相位 3-6:缩放相位（1/2 逐字节;1.27/1.5625 census 有界=Skia tie 定谳口径） ----
for (const [z, strict] of [[1.0, true], [2.0, true], [1.27, false], [1.5625, false]]) {
  await page.evaluate((zz) => { window.__swGame.camera.setZoomTarget(zz); }, z);
  await page.evaluate(() => window.__pause(false));
  await pump(page, 80);
  await page.evaluate(() => window.__pause(true));
  await waitFrame(4);
  await phase('zoom' + z, strict);
  await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.25); });
  await pump(page, 80);
  await page.evaluate(() => window.__pause(true));
  await waitFrame(2);
}

// ---- 相位 7:低清 K=0.5 ----
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 0.5; }));
await waitFrame(4);
await phase('低清K0.5', false);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));

// ---- 相位 8:洞穴暗光 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const gy = (g.world.groundLevel ?? 300) + 48;
  window.__teleport(g.player.x, gy * 16);
});
await pump(page, 40);
await page.evaluate(() => window.__pause(true));
await waitFrame(6);
await phase('洞穴暗光', false);


// ---- GI 降级路径存在性（出生点=旱地无 chaos;页内翻 b2b=0=桥接态回退;像素=2D 真值） ----
await page.evaluate(() => { window.__teleport(window.__swGame.player.x, window.__swGame.world.groundLevel * 16 - 80); });
await pump(page, 20);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await page.evaluate(() => window.__b2bSet(false));
await waitFrame(4);
await page.evaluate((n) => window.__setTick(500), 0);
await waitFrame(1);
const bridgeFin = await snapFin();
const stBridge = await page.evaluate(() => window.__accState());
chk('[GI] ?b2b=0 桥接态回退:worldCanvas 复建+像素=2D 真值', stBridge.worldCanvasNull === false,
  `worldCanvasNull=${stBridge.worldCanvasNull} path=${stBridge.path}`);
await page.evaluate(() => window.__bglSet(false));
await waitFrame(4);
await page.evaluate((n) => window.__setTick(500), 0);
await waitFrame(1);
const pure2D = await snapFin();
chk('[GI] 桥接态像素 ≡ 2D 真值（bgl 逃生门链完好）', bridgeFin.b64 === pure2D.b64,
  bridgeFin.b64 === pure2D.b64 ? md5(bridgeFin.b64).slice(0, 8) : 'census 见控制台');
await page.evaluate(() => window.__b2bSet(true));
await waitFrame(3);

// ---- 相位 9:海洋水边（背景液体/浸润带/前景水大场面） ----
await page.evaluate(() => { window.__teleport(400, window.__swGame.world.groundLevel * 16 - 40); });
await pump(page, 40);
await page.evaluate(() => window.__pause(true));
await waitFrame(6);
await phase('海洋水边', false);

// ---- 相位 10:重力翻转 ----
await page.evaluate(() => window.__grav(-1));
await pump(page, 20);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await phase('重力翻转', false);
await page.evaluate(() => window.__grav(1));

// ---- 回地表（覆盖层相位在旱地表层跑——洞穴/水城 chaos 隔离） ----
await page.evaluate(() => {
  const g = window.__swGame;
  window.__teleport(g.player.x, g.world.groundLevel * 16 - 80);
});
await pump(page, 30);
await page.evaluate(() => window.__pause(true));
await waitFrame(5);

// ---- 相位 11:导线覆盖层（store.wire 注入条带） ----
await page.evaluate(() => window.__wirePhase(true));
await waitFrame(4);
await phase('导线层', true);
await page.evaluate(() => window.__wirePhase(false));

// ---- 相位 12:标尺网格+标尺线（tintedExtra 逐帧重烘 scratch=动态源族） ----
await page.evaluate(() => window.__rulerPhase(true));
await waitFrame(4);
await phase('标尺层', false, 8);
await page.evaluate(() => window.__rulerPhase(false));

// ---- 相位 13:宏伟蓝图预览（strokeRect→隔离栅格化直支） ----
await page.evaluate(() => window.__grandPhase(true));
await waitFrame(4);
await phase('蓝图预览(strokeRect)', true);
await page.evaluate(() => window.__grandPhase(false));

// ---- 相位 14:风摆动层（swayInWind 开+performance.now 钉死防 glow 相位漂移） ----
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = true; }));
await page.evaluate(() => {
  if (!window.__origPerfNow) {
    window.__origPerfNow = performance.now.bind(performance);
    window.__perfFixed = window.__perfFixed || 1_000_000;
    performance.now = () => window.__perfFixed;
  }
});
await waitFrame(4);
await phase('风摆层', false, 8);
await page.evaluate(() => {
  if (window.__origPerfNow) { performance.now = window.__origPerfNow; window.__origPerfNow = null; }
});
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; }));

// ---- 相位 15:warp 水体（waveQuality=2;波场=混沌系→census 放宽登记,C8 判例） ----
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 2; }));
await pump(page, 30);
await page.evaluate(() => window.__pause(true));
await waitFrame(6);
await phase('warp水体(chaos)', false, 60);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 0; }));
await pump(page, 10);

// ---- GE 三消热点账本:单帧计数 A vs B（海洋水边态=水体大场面） ----
await page.evaluate(() => { window.__teleport(400, window.__swGame.world.groundLevel * 16 - 40); });
await pump(page, 20);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await page.evaluate(() => window.__bglSet(false));
await waitFrame(3);
await page.evaluate(() => window.__countReset());
await waitFrame(1);
const cntA = await page.evaluate(() => window.__countRead());
await page.evaluate(() => window.__bglSet(true));
await waitFrame(4);
await page.evaluate(() => window.__countReset());
await waitFrame(1);
const cntB = await page.evaluate(() => window.__countRead());
chk('[GE-①] 全幅 texSubImage2D（compose worldCanvas 上传特征）B=0', cntB.subFull === 0 && cntA.subFull >= 1,
  `A.subFull=${cntA.subFull} B.subFull=${cntB.subFull}`);
// ★GE-② 桥接对照臂（bgl=1+b2b=0）:墙/tile/behind SO+ADD/ent SO+ADD 的
//   present→worldCanvas 全幅回贴群在 acc 态归零（含云/bg+最终合成=3 底数）
await page.evaluate(() => { window.__bglSet(true); window.__b2bSet(false); });
await waitFrame(4);
await page.evaluate(() => window.__countReset());
await waitFrame(1);
const cntBr = await page.evaluate(() => window.__countRead());
await page.evaluate(() => window.__b2bSet(true));
await waitFrame(3);
chk('[GE-②] swpipe→2D 全幅回贴群:acc=底数3（云/bg/最终合成）且 < 桥接（世界段 present 群归零）',
  cntB.pipeBlit === 3 && cntBr.pipeBlit > cntB.pipeBlit,
  `bridge=${cntBr.pipeBlit} acc=${cntB.pipeBlit} pure2D=${cntA.pipeBlit}`);
console.log(`[GE] A={d5:${cntA.d5},d9:${cntA.d9},pipeBlit:${cntA.pipeBlit},sub:${cntA.sub},subFull:${cntA.subFull},img:${cntA.img}}`);
console.log(`[GE] B(acc)={d5:${cntB.d5},d9:${cntB.d9},pipeBlit:${cntB.pipeBlit},sub:${cntB.sub},subFull:${cntB.subFull},img:${cntB.img}}`);
console.log(`[GE] Bridge={pipeBlit:${cntBr.pipeBlit}}`);

// ---- GG 帧耗时 A vs B（快机兑现点;同步驱动 60 帧×2 臂,海洋水边重场景） ----
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
  console.log(`[GG] ${label} 帧耗时均值=${t.toFixed(3)}ms`);
  return t;
}
await page.evaluate(() => window.__bglSet(false));
await waitFrame(4);
const msA = await frameTiming('A(2D)');
await page.evaluate(() => window.__bglSet(true));
await waitFrame(6);
const msB = await frameTiming('B(acc)');
console.log(`[GG] acc 净收益=${(msA - msB).toFixed(3)}ms/帧（${((msA - msB) / msA * 100).toFixed(1)}%）`);
chk("[GG] acc 帧耗时 ≤ 2D（兑现点:回贴桥退役应有正收益或打平）", msB <= msA + 0.3, `A=${msA.toFixed(3)}ms B=${msB.toFixed(3)}ms`);
// 地表态补测（静立轻场景不回退）
await page.evaluate(() => { window.__teleport(window.__swGame.player.x, window.__swGame.world.groundLevel * 16 - 80); });
await pump(page, 20);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await page.evaluate(() => window.__bglSet(false));
await waitFrame(3);
const msA2 = await frameTiming('A(2D)地表');
await page.evaluate(() => window.__bglSet(true));
await waitFrame(5);
const msB2 = await frameTiming('B(acc)地表');
chk('[GG] 地表态 acc ≤ 2D', msB2 <= msA2 + 0.3, `A=${msA2.toFixed(3)}ms B=${msB2.toFixed(3)}ms`);


if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name + (f.detail ? ' [' + f.detail + ']' : ''));
process.exitCode = fails.length ? 1 : 0;
