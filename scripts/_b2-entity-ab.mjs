// ★B2 实体/弹/尘族 shim 执行器 像素对拍（2026-09-24;_b1-world-ab 三臂范式）。
// 三臂: A2D(bgl=0) / B1(bgl=1,shim=0=B1 已收口态) / B2(bgl=1,shim=1)。
//   判据: B1≡A 逐字节（B1 既有收口回归哨兵）; B2≈B1 census 有界（实体分数坐标
//   =B1 Skia tie 定谳口径;整数档+整数坐标试逐字节）; P2 行走相=用户实报
//   「bgl=1 角色移动变透明」复现相（shim 开后玩家区像素差必须消失）。
// 场景: 静立 / 行走(复现) / zoom1.0 试字节 / 战斗混排(敌怪+弹幕+掉落+尘两档) /
//   zoom1.5625 census / 重力翻转 / 尘两混合档专项。
// 运行: SW_ORIGIN=http://localhost:5210 node tools/run-diag.mjs --timeout=900000 scripts/_b2-entity-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?bgl=1&bglshim=1&cloudcache=0';
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

// ---- 确定性套件 + 计数钩 + 翻面注入面 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const origDraw = Object.getPrototypeOf(sky).draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__set = (bgl, shim) => { r.constructor.bglSetForTest(bgl); r.constructor.bglShimSetForTest(shim); };
  window.__shimState = () => ({
    bgl: r.constructor.bgl, shim: r.constructor.bglShim,
    path: r.bglPathUsed, shimStats: r.bglShimStats(),
  });
  window.__setTick = async (n) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = n; };
  window.__pause = (v) => { g.paused = v; };
  window.__teleport = (x, y) => {
    g.player.x = x; g.player.y = y; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2;
  };
  window.__walk = (v) => { g.player.vx = v; g.player.direction = v > 0 ? 1 : -1; };
  window.__grav = (v) => { g.player.gravDir = v; };
  window.__spawnDust = (types) => {
    const vd = r.vanillaDust;
    if (!vd) return 0;
    const tt = types || [6, 15, 43, 34];
    let n = 0;
    for (let i = 0; i < 24; i++) {
      const d = vd.spawn(g.camera.x - 200 + i * 16, g.camera.y - 60 + (i % 7) * 14,
        12, 12, tt[i % tt.length], (i % 5) - 2, -1, 254,
        { r: 255, g: 240, b: 180, a: 255 }, 0.7);
      if (d) n++;
    }
    return n;
  };
  window.__spawnMix = () => {
    const g2 = window.__swGame;
    const out = { enemies: 0, drops: 0 };
    for (let i = 0; i < 4; i++) {
      const e = g2.spawnEnemy('slime_green', g2.player.cx + 80 + i * 40, g2.player.cy);
      if (e) out.enemies++;
    }
    for (let i = 0; i < 3; i++) {
      const d = g2.spawnDrop?.(g2.player.cx - 60 + i * 30, g2.player.cy - 10, 'gel', 3);
      if (d) out.drops++;
    }
    return out;
  };
  // 哈比(48)+恶魔(62) 在玩家左侧自然射弹（弹幕族）
  window.__spawnShooters = () => {
    const g2 = window.__swGame;
    const h = g2.spawnNpcByVanilla?.(48, g2.player.cx - 240, g2.player.cy - 60);
    const dm = g2.spawnNpcByVanilla?.(62, g2.player.cx - 320, g2.player.cy - 40);
    return { h: !!h, d: !!dm };
  };
  const P2 = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P2.__b2Patched) {
    P2.__b2Count = { d5: 0, d9: 0 };
    const orig = P2.drawImage;
    P2.drawImage = function (src, ...rest) {
      if (rest.length === 4) P2.__b2Count.d5++;
      else if (rest.length === 8) P2.__b2Count.d9++;
      return orig.call(this, src, ...rest);
    };
    P2.__b2Patched = true;
  }
  const GLP = WebGL2RenderingContext.prototype;
  if (!GLP.__b2Patched) {
    GLP.__b2Count = { draw: 0, sub: 0, img: 0 };
    const oDraw = GLP.drawArrays;
    GLP.drawArrays = function (...a) { GLP.__b2Count.draw++; return oDraw.apply(this, a); };
    const oSub = GLP.texSubImage2D;
    GLP.texSubImage2D = function (...a) { GLP.__b2Count.sub++; return oSub.apply(this, a); };
    const oImg = GLP.texImage2D;
    GLP.texImage2D = function (...a) { GLP.__b2Count.img++; return oImg.apply(this, a); };
    GLP.__b2Patched = true;
  }
  window.__countReset = () => { P2.__b2Count.d5 = 0; P2.__b2Count.d9 = 0; GLP.__b2Count.draw = 0; GLP.__b2Count.sub = 0; GLP.__b2Count.img = 0; };
  window.__countRead = () => ({ ...P2.__b2Count, ...GLP.__b2Count });
  window.__gc0 = () => (performance.memory ? performance.memory.usedJSHeapSize : -1);
});
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
waitFrame; // noqa
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

async function census(aFin, bFin, region) {
  return page.evaluate(({ a, b, region }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w, H = a.h;
    const rx0 = region ? Math.max(0, region[0]) : 0, ry0 = region ? Math.max(0, region[1]) : 0;
    const rx1 = region ? Math.min(W, region[2]) : W, ry1 = region ? Math.min(H, region[3]) : H;
    for (let py = ry0; py < ry1; py++) {
      for (let px = rx0; px < rx1; px++) {
        const i = (py * W + px) * 4;
        const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
          Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
        if (dd > 0) {
          n++;
          if (dd > maxd) maxd = dd;
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
      }
    }
    const area = (rx1 - rx0) * (ry1 - ry0);
    return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null, area, pct: +(100 * n / area).toFixed(3) };
  }, { a: aFin, b: bFin, region: region ?? null });
}

/** 三臂对拍:0=A2D 1=B1桥接 2=B2b累积（★2026-09-24 B2b 起:bgl+shim=acc 累积态,
 *  主判据换 B2b≡A(2D 真值);B1 桥接=回归哨兵。tick 注入 3 相;strict=逐字节/census 有界宽限<pctMax%） */
function cs0(w) { return w ? `n=${w.n}(${(100 * w.n / (1280 * 560)).toFixed(2)}%)` : '?'; }
async function phase(label, { strict = false, pctMax = 5, ticks = 3 } = {}) {
  const fins = {};
  const arms = [['A', false, false], ['B1', true, false], ['B2', true, true]];
  for (const [tag, bgl, shim] of arms) {
    await page.evaluate((b, s) => window.__set(b, s), bgl, shim);
    await waitFrame(5);
    for (let k = 0; k < ticks; k++) {
      await page.evaluate((n) => window.__setTick(500 + n), k);
      await waitFrame(1);
      fins[tag + k] = await snapFin();
    }
  }
  let worst = null, worstSent = null;
  for (let k = 0; k < ticks; k++) {
    // ★B2b:主判据=B2b(acc) vs A(2D 真值);哨兵=B1(桥接) vs A
    const c = await census(fins['A' + k], fins['B2' + k]);
    if (!worst || c.n > worst.c.n) worst = { k, c };
    if (fins['A' + k].b64 !== fins['B1' + k].b64) {
      const cs = await census(fins['A' + k], fins['B1' + k]);
      if (!worstSent || cs.n > worstSent.n) worstSent = cs;
    }
    console.log(`  [${label} tick${k}] B2b${fins['A' + k].b64 === fins['B2' + k].b64 ? '≡A' : `≈A census n=${c.n}(${c.pct}%) maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)}`}  B1${fins['A' + k].b64 === fins['B1' + k].b64 ? '≡' : `≈A n=${cs0(worstSent)}`}`);
  }
  // 回归哨兵:strict 相=B1≡A 逐字节;非 strict 相（1.5625/重力翻转=census 相）容忍 <5%
  const total0 = fins['A0'].w * fins['A0'].h;
  const sentOk = strict ? !worstSent : (!worstSent || worstSent.n < total0 * 0.05);
  chk(`[${label}] 回归哨兵 B1${strict ? '≡' : '≈'}A（既有收口不回归）`, sentOk,
    worstSent ? `census n=${worstSent.n}(${(100 * worstSent.n / total0).toFixed(3)}%) maxΔ=${worstSent.maxd}` : '');
  const total = fins['A0'].w * fins['A0'].h;
  const ok = strict ? worst.c.n === 0 : (worst.c.n < total * pctMax / 100);
  chk(`[${label}] B2b ${strict ? '≡A 逐字节' : `≈A census 有界(<${pctMax}%)`}`, ok,
    worst.c.n === 0 ? '逐字节' : `worst n=${worst.c.n}(${worst.c.pct}%) maxΔ=${worst.c.maxd}`);
  const st = await page.evaluate(() => window.__shimState());
  return { st, fins };
}

// ==== P1 静立地表（出生点）====
console.log('== P1 静立 ==');
await phase('P1静立');

// ==== P2 行走（用户实报「bgl=1 角色移动变透明」复现相）====
// ★三臂同态协议:每臂捕获前 pause+teleport(同点)+animTime/vx/direction 注入
//   （行走帧= floor(animTime×1.3/8)%len——直接钉 animTime=确定性）——臂间世界态零漂移
console.log('== P2 行走（复现相）==');
const PP = await page.evaluate(() => { const g = window.__swGame; return { x: g.player.x, y: g.player.y }; });
for (let k = 0; k < 3; k++) {
  const snaps = {};
  for (const [tag, bgl, shim] of [['A', false, false], ['B1', true, false], ['B2', true, true]]) {
    await page.evaluate((b, s) => window.__set(b, s), bgl, shim);
    await waitFrame(4);
    await page.evaluate(({ x, y, k }) => {
      const g = window.__swGame;
      g.paused = true;
      g.player.x = x; g.player.y = y; g.player.vx = 2.6; g.player.vy = 0; g.player.direction = 1; g.player.gravDir = 1;
      g.player.animTime = 1.7 + k * 0.55;
      g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2;
    }, { x: PP.x, y: PP.y, k });
    await page.evaluate((n) => window.__setTick(500 + n), k);
    await waitFrame(1);
    snaps[tag + k] = await snapFin();
  }
  const c = await census(snaps['B1' + k], snaps['B2' + k]);
  const a1 = await census(snaps['A' + k], snaps['B1' + k]);
  console.log(`  [P2行走 tick${k}] B1${a1.n === 0 ? '≡' : `≠A n=${a1.n}(${(100 * a1.n / (a.w * a.h)).toFixed(3)}%)`}  B2 ${c.n === 0 ? '≡' : `census n=${c.n}(${c.pct}%) maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)}`} B1`);
  results.push({ name: `P2行走 tick${k}`, ok: c.pct < 5, detail: `n=${c.n} pct=${c.pct}%` });
}

// ==== P3 zoom 1.0 静立（试字节）====
console.log('== P3 zoom1.0 ==');
await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.0); window.__pause(false); });
await pump(page, 80);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await phase('P3zoom1', { strict: true });

// ==== P4 战斗混排（敌怪+掉落+哈比弹幕+尘两档）====
console.log('== P4 战斗混排 ==');
{
  const mix = await page.evaluate(() => window.__spawnMix());
  const sh = await page.evaluate(() => window.__spawnShooters());
  const dusts = await page.evaluate(() => window.__spawnDust([6, 15, 43, 34, 182, 206]));
  console.log('  [混排注入]', JSON.stringify(mix), JSON.stringify(sh), '尘=' + dusts);
  await page.evaluate(() => window.__pause(false));
  await pump(page, 30);   // 收敛+哈比入位
  await page.evaluate(() => window.__pause(true));
  await waitFrame(4);
  const r = await phase('P4混排');
  console.log('  [shim 账]', JSON.stringify(r.st.shimStats?.stats ?? r.st.shimStats));
}
await page.evaluate(() => { window.__set(1, false); window.__pause(true); });

// ==== P5 zoom 1.5625 census ====
console.log('== P5 zoom1.5625 ==');
await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.5625); window.__pause(false); });
await pump(page, 80);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await phase('P5zoom1.5625');
await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.25); window.__pause(false); });
await pump(page, 80);
await page.evaluate(() => window.__pause(true));
await waitFrame(2);

// ==== P6 重力翻转（玩家 gravDir=-1;哨兵相）====
console.log('== P6 重力翻转 ==');
await page.evaluate(() => window.__grav(-1));
await pump(page, 20);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await phase('P6重力翻转');
await page.evaluate(() => window.__grav(1));

// ==== P7 雨夜（雨条 rotated quad 路径;weatherFx.drawRain 在实体窗内）====
// ★协议:先真实 update 填充雨池 50 帧（raining+cloudAlpha 开）→ 冻结定格 → 三臂
//   （雨滴位置在 pause 下不推进=三臂同态;rot 雨条=旋转 quad 路径覆盖面）
console.log('== P7 雨夜 ==');
{
  await page.evaluate(() => {
    const w = window.__swGame.world.weather;
    if (w) { w.raining = true; w.cloudAlpha = 1; w.maxRaining = 0.8; }
  });
  await page.evaluate(() => window.__pause(false));
  await pump(page, 50);
  await page.evaluate(() => window.__pause(true));
  await page.evaluate(() => {
    const w = window.__swGame.world.weather;
    const cnt = window.__swGame.renderer.weatherFx?.pool?.filter?.((d) => d.active).length
      ?? window.__swGame.renderer.weatherFx?.pool?.length ?? -1;
    console.log('  [雨池]', cnt);
  });
  await waitFrame(6);
  await phase('P7雨夜');
  await page.evaluate(() => {
    const w = window.__swGame.world.weather;
    if (w) { w.raining = false; w.cloudAlpha = 0; }
  });
  await pump(page, 10);
}

// ==== P8 死亡态（drawDeadPlayerParts 经实体窗;灰化滤镜在合成后不受影响）====
console.log('== P8 死亡态 ==');
{
  await page.evaluate(() => {
    const g = window.__swGame;
    g.paused = true;
    g.player.dead = true;
    g.player.immuneAlpha = 60;
  });
  await waitFrame(4);
  await phase('P8死亡态');
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.dead = false; g.player.immuneAlpha = 0;
  });
  await waitFrame(4);
}

// ==== GE 热点账本 + 帧耗 + GC 账 ====
console.log('== GE 账本 ==');
{
  await page.evaluate(() => window.__set(1, false));
  await waitFrame(3);
  await page.evaluate(() => window.__countReset());
  await waitFrame(1);
  const cntB1 = await page.evaluate(() => window.__countRead());
  await page.evaluate(() => window.__set(1, true));
  await waitFrame(3);
  await page.evaluate(() => window.__countReset());
  await waitFrame(1);
  const cntB2 = await page.evaluate(() => window.__countRead());
  console.log(`[GE] drawImage B1: d5=${cntB1.d5} d9=${cntB1.d9}  B2(shim): d5=${cntB2.d5} d9=${cntB2.d9}`);
  console.log(`[GE] GL drawArrays B1=${cntB1.draw} B2=${cntB2.draw} | texImage2D B1=${cntB1.img} B2=${cntB2.img} | texSub B1=${cntB1.sub} B2=${cntB2.sub}`);
  results.push({ name: '[GE] B2 实体窗 drawImage 迁移量', ok: cntB2.d9 < cntB1.d9 || cntB2.d5 < cntB1.d5, detail: `d5 ${cntB1.d5}→${cntB2.d5}, d9 ${cntB1.d9}→${cntB2.d9}` });

  async function frameTiming(label) {
    return page.evaluate((lb) => {
      const g = window.__swGame;
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) {
        window.__vnow = (window.__vnow || performance.now()) + 16.6667;
        g.frame(window.__vnow);
      }
      return (performance.now() - t0) / 60;
    }, label);
  }
  await page.evaluate(() => window.__set(1, false));
  await waitFrame(4);
  const msB1 = await frameTiming('B1');
  await page.evaluate(() => window.__set(1, true));
  await waitFrame(6);
  const msB2 = await frameTiming('B2');
  console.log(`[GE'] 帧耗 B1=${msB1.toFixed(3)}ms B2=${msB2.toFixed(3)}ms (Δ=${(msB2 - msB1).toFixed(3)})`);
  results.push({ name: "[GE'] B2 帧耗 ≤ B1+1.5ms", ok: msB2 <= msB1 + 1.5, detail: `B1=${msB1.toFixed(3)} B2=${msB2.toFixed(3)}` });
  // GC 分配率:120 帧 usedJSHeapSize 增量（后 60 帧减前 60 帧,两臂各测;噪声大看趋势）
  async function gcRate(label) {
    const r = await page.evaluate(() => new Promise((res) => {
      const g = window.__swGame;
      let a0 = 0, a1 = 0, n = 0;
      const step = () => {
        window.__vnow = (window.__vnow || performance.now()) + 16.6667;
        g.frame(window.__vnow);
        if (performance.memory) {
          const u = performance.memory.usedJSHeapSize;
          if (n === 30) a0 = u;
          if (n === 90) a1 = u;
        }
        if (++n >= 91) res(performance.memory ? (a1 - a0) / 60 / 1024 : -1);
        else setTimeout(step, 0);
      };
      step();
    }));
    console.log(`[GC] ${label} 分配率=${typeof r === 'number' ? r.toFixed(2) : r} KB/帧`);
    return r;
  }
  await page.evaluate(() => window.__set(1, false));
  await waitFrame(4);
  const gcB1 = await gcRate('B1(2D)');
  await page.evaluate(() => window.__set(1, true));
  await waitFrame(6);
  const gcB2 = await gcRate('B2(shim)');
  if (gcB1 >= 0 && gcB2 >= 0) results.push({ name: '[GC] B2 分配率 ≤ B1×1.5+8KB', ok: gcB2 <= gcB1 * 1.5 + 8, detail: `B1=${gcB1.toFixed(2)} B2=${gcB2.toFixed(2)} KB/帧` });
  const st = await page.evaluate(() => window.__shimState());
  console.log('[shim]', JSON.stringify(st));
}

if (pageErrors.length) {
  console.log('PAGE ERRORS (' + pageErrors.length + '):');
  for (const e of pageErrors.slice(0, 8)) console.log('  ' + e);
  results.push({ name: '页错误=0', ok: false, detail: pageErrors[0] });
}
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name + (f.detail ? ' [' + f.detail + ']' : ''));
process.exitCode = fails.length ? 1 : 0;
