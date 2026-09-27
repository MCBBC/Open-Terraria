// ★专案:半砖/斜坡格水层色差/缺层 AB 探针(2026-09-28;用户物证 Starter World
//  (4602-4607,429-436) slope2 阶梯+半砖+涉水;_liqgl-ab 页面范式复用)。
// 三臂(臂间需 boot 期 URL 参数,故逐臂开页):
//   A=?bglshim=0(用户基准"正常";纯 2D 链)  B=缺省(bglshim+liqgl,bug 面)
//   C=?liqgl=0(shim 开液体回 CPU 链——区分 shim/liqgl 责任面)。
// 场面:丛林水池,右缘 slope2 阶梯(用户同构:水面 slope2→下水阶梯),池内半砖
//   (上格有液),玩家涉水站在阶梯slope格前列(身体压 slope 格+水格)。
// 判据:
//   P1 三臂同帧配对 census(n%/maxd/mean/bbox)+区域归因(slope 列窗/主水体窗/
//      玩家矩形窗:逐窗差分像素数+色值量级);
//   P2 玩家压 slope 格像素的"水罩覆盖判别":A 臂该域像素应有水色偏移,B/C 臂
//      对拍量化缺层幅度;
//   P3 臂 B/C shim 状态(batchQuads/fallback/replays)+liqgate 句柄活性。
// 运行:SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs --timeout=1200000 scripts/_slope-water-layer-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

// ---- 场面构建(页内;用户 pond 同构缩样) ----
// 布局(tile):地面行 G=60。水池 x∈[X0,XE-1](表面 G 行 lq=60,G+1..G+4 满 255),
// 右缘 slope2 阶梯:(XE,G) slope2 水线格、(XE-1,G+1) slope2、(XE-3,G+2) slope2、
// (XE-4,G+3) slope2,阶梯右侧/下方实心丛林草填实;池内半砖 (X0+8,G+4) 上格有液。
// 玩家站位:站在 slope2 阶梯第一阶((XE,G) 格顶)涉水,身体压 (XE,G-2..G) 列。
const SCENE = `
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const T = (k) => window.__swTiles?.[k] ?? 0;
  const JG = T('v_60_jungle_grass_block');
  const PX = Math.floor(g.player.cx / 16);
  // G 锚定玩家脚下(groundLevel=橙线深度,非本列地形面——曾挖到地下=黑)
  const G = Math.floor(g.player.y / 16) + 3, XE = PX + 24, X0 = XE - 26;
  // 清域
  for (let x = X0 - 6; x <= XE + 10; x++) for (let y = G - 12; y <= G + 8; y++) {
    st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); st.setHalfBrick(x, y, false); st.setSlope(x, y, 0);
  }
  // 地面(水池右岸填实:XE..XE+8 全列实心)
  for (let x = XE; x <= XE + 8; x++) for (let y = G; y <= G + 6; y++) st.setTile(x, y, JG);
  // slope2 阶梯(右缘):水线第一阶在 (XE,G)——但它与右岸重合,故阶梯左移一格布局:
  // (XE,G)=slope2 水线阶(玩家站此)、(XE-1,G+1)、(XE-3,G+2)、(XE-4,G+3)
  st.setTile(XE, G, JG); st.setSlope(XE, G, 2);
  st.setTile(XE - 1, G + 1, JG); st.setSlope(XE - 1, G + 1, 2);
  st.setTile(XE - 3, G + 2, JG); st.setSlope(XE - 3, G + 2, 2);
  st.setTile(XE - 4, G + 3, JG); st.setSlope(XE - 4, G + 3, 2);
  // 阶梯下实心补齐(水不漏底)
  st.setTile(XE - 1, G + 2, JG); st.setTile(XE - 1, G + 3, JG);
  st.setTile(XE - 2, G + 3, JG); st.setTile(XE - 2, G + 4, JG); st.setTile(XE - 1, G + 4, JG);
  st.setTile(XE - 3, G + 4, JG); st.setTile(XE - 2, G + 5, JG); st.setTile(XE - 3, G + 5, JG);
  // 池水:x∈[X0,XE-1],表面 G 行 lq=60;G+1..G+4 满 255(阶梯格列除外)
  for (let x = X0; x <= XE - 1; x++) {
    for (let y = G + 1; y <= G + 4; y++) {
      if (!st.flags[st.idx(x, y)]) { st.setLiquid(x, y, 255, 1); }
    }
    st.setLiquid(x, G, 60, 1);
  }
  // 半砖(池内,上格有液)
  st.setTile(X0 + 8, G + 4, JG); st.setHalfBrick(X0 + 8, G + 4, true);
  // 池底
  for (let x = X0; x <= XE - 5; x++) st.setTile(x, G + 5, JG);
  // 玩家:站 slope2 水线阶 (XE,G) 顶——player.x/y=世界 px(左上)。player 宽 20px≈1.25 格:
  // 站阶梯格使身体压 (XE,G-2..G) 列(右侧)+ (XE-1,..) 列(左侧=水体)
  // 玩家不挪窝(出生点已扫描)——场景建到家门口;相机钉在阶梯
  g.camera.x = (XE - 2) * 16; g.camera.y = G * 16;
  window.__scene = { G, X0, XE };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__shimStats = () => g.renderer.bglShimStats ? g.renderer.bglShimStats() : null;
`;

async function runArm(browser, urlSuffix, label) {
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
  // 直接带参导航+等桥(bootstrap 的二次导航与预导航竞态=bridge 超时;boot 单测
  //  _tmp-boot-test 三臂桥全绿=导航本身无恙)
  await page.goto(ORIGIN + '/' + urlSuffix + (urlSuffix ? '&' : '?') + 't=' + Date.now(),
    { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  { const t0 = Date.now(); let ok = false;
    while (Date.now() - t0 < 180000) {
      ok = await page.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld).catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ok) throw new Error('bridge-timeout ' + urlSuffix);
  }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
  if (!gen?.ok) throw new Error('createGame fail: ' + (gen?.why ?? '?'));
  await godMode(page, true);
  await page.evaluate(SCENE);
  await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
  await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vl = m; }));
  await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => {
    const ww = window.__wwMod.waterWaves;
    const origFrame = ww.frame.bind(ww);
    ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
  });
  // 预热+相机钉位+再驱动(渲染态收敛)
  await page.evaluate(() => window.__drive(30));
  await page.evaluate(() => {
    const g = window.__swGame;
    g.camera.x = (window.__scene.XE - 2) * 16; g.camera.y = window.__scene.G * 16;
  });
  // drawLiquids 帧内态捕获(_accMode 帧间恒 off——finishAccFrame 收口;须拦帧内)
  await page.evaluate(() => {
    const r = window.__swGame.renderer;
    r.__swMid = {};
    const proto = Object.getPrototypeOf(r);
    const orig = proto.drawLiquids;
    r.drawLiquids = function (...a) {
      const isFg = a[5] === false;
      const res = orig.apply(this, a);
      if (isFg) {
        r.__swMid = {
          accMode: r._accMode, path: r.bglPathUsed,
          liqgl: window.__vl ? window.__vl.liqgl : null,
          gate: !!r._liqGateHandle,
          warp: (window.__vl ? JSON.parse(JSON.stringify(window.__vl.liquidDebugState().warp)) : null),
        };
      }
      return res;
    };
    r.__swWrapped = true;
  });
  await page.evaluate(() => window.__drive(5));
  const state = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    return {
      mid: r.__swMid ?? {},
      inv: r._waveLiquidInView, accMode: r._accMode, path: r.bglPathUsed,
      camX: g.camera.x, camY: g.camera.y, zoom: g.camera.zoom,
      viewW: g.camera.viewW, viewH: g.camera.viewH,
      cw: r.canvas.width, ch: r.canvas.height, dpr: window.devicePixelRatio,
      playerX: g.player.x, playerY: g.player.y, playerW: g.player.w, playerH: g.player.h,
      scene: window.__scene,
      warpDbg: r.liquidDebugState?.()?.warp ?? null,
    };
  });
  await page.evaluate(() => window.__drive(2));
  // 多帧连拍(8 帧,帧间 1 drive):闪烁=帧间水体窗色变
  const snaps = [];
  for (let k = 0; k < 8; k++) {
    const fin = await page.evaluate(() => {
      const c = window.__swGame.renderer.canvas;
      const lc = document.createElement('canvas');
      lc.width = c.width; lc.height = c.height;
      const lx = lc.getContext('2d', { willReadFrequently: true });
      lx.drawImage(c, 0, 0);
      const d = lx.getImageData(0, 0, lc.width, lc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      window.__drive(1);
      return { w: c.width, h: c.height, b64: btoa(bin) };
    });
    snaps.push(fin);
  }
  const fin = snaps[0];
  const stats = await page.evaluate(() => window.__shimStats());
  writeFileSync(`/tmp/slope-ab-${label}.rgba`, Buffer.from(fin.b64, 'base64'));
  await page.screenshot({ path: `/tmp/slope-ab-${label}.png` });
  await page.close();
  return { fin, snaps, state, stats, md5: createHash('md5').update(Buffer.from(fin.b64, 'base64')).digest('hex'), errors: pageErrors };
}

// ---- 区域归因(设备坐标窗:世界 tile 矩形→device px) ----
// device = (worldPx - cam) * zoom * dpr + canvas/2(cam.x/y=世界像素,viewW/H=css px)
function devRect(st, tx0, ty0, tx1, ty1) {
  const { camX, camY, zoom, viewW, viewH, cw, ch, dpr } = st;
  const wx0 = tx0 * 16, wy0 = ty0 * 16, wx1 = (tx1 + 1) * 16, wy1 = (ty1 + 1) * 16;
  const x0 = Math.round((wx0 - camX) * zoom * dpr + cw / 2), y0 = Math.round((wy0 - camY) * zoom * dpr + ch / 2);
  const x1 = Math.round((wx1 - camX) * zoom * dpr + cw / 2), y1 = Math.round((wy1 - camY) * zoom * dpr + ch / 2);
  return { x0, y0, x1, y1 };
}

function censusBuf(aBuf, bBuf, w, h, rect = null) {
  const P = aBuf, Q = bBuf;
  let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const rx0 = rect ? rect.x0 : 0, ry0 = rect ? rect.y0 : 0, rx1 = rect ? rect.x1 : w - 1, ry1 = rect ? rect.y1 : h - 1;
  for (let y = Math.max(0, ry0); y <= Math.min(h - 1, ry1); y++) {
    for (let x = Math.max(0, rx0); x <= Math.min(w - 1, rx1); x++) {
      const i = (y * w + x) * 4;
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      if (dd > 0) {
        n++; sum += dd;
        if (dd > maxd) maxd = dd;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { n, maxd, mean: n ? sum / n : 0, bbox: n ? [x0, y0, x1, y1] : null };
}

/** 区域均色(诊断面:水罩覆盖判别的真值读数) */
function regionMean(buf, w, rect) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = rect.y0; y < rect.y1; y++) for (let x = rect.x0; x < rect.x1; x++) {
    const i = (y * w + x) * 4;
    r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
  }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null;
}

const browser = await launchBrowser({});
console.log('== 臂 A:?bglshim=0(用户基准) ==');
const A = await runArm(browser, '?bglshim=0', 'A');
console.log('state:', JSON.stringify(A.state));
console.log('md5 A =', A.md5, 'errors:', A.errors.length);
console.log('== 臂 B:缺省(bglshim+liqgl) ==');
const B = await runArm(browser, '', 'B');
console.log('state:', JSON.stringify(B.state));
console.log('md5 B =', B.md5, 'errors:', B.errors.length);
console.log('== 臂 C:?liqgl=0(shim 开液体 CPU 链) ==');
const C = await runArm(browser, '?liqgl=0', 'C');
console.log('state:', JSON.stringify(C.state));
console.log('md5 C =', C.md5, 'errors:', C.errors.length);

chk('臂 A 纯 2D(accMode off)', A.state.accMode !== 'acc', `accMode=${A.state.accMode} path=${A.state.path}`);
chk('臂 B acc+批化活(ligate 句柄面)', B.state.accMode === 'acc', `accMode=${B.state.accMode} path=${B.state.path} warp=${JSON.stringify(B.state.warpDbg)}`);
chk('臂 B acc+gate 活(帧内拦获)', B.state.mid.accMode === 'acc' && B.state.mid.gate === true, JSON.stringify(B.state.mid));
chk('三臂场面同态(液体在视+相机钉位)', A.state.inv === true && B.state.inv === true && C.state.inv === true,
  `inv A=${A.state.inv} B=${B.state.inv} C=${C.state.inv}`);

const { w, h } = A.fin;
const aBuf = A.fin.b64 ? Buffer.from(A.fin.b64, 'base64') : null;
const bBuf = Buffer.from(B.fin.b64, 'base64');
const cBuf = Buffer.from(C.fin.b64, 'base64');

// 区域窗(scene 几何→设备)
const { G, X0, XE } = B.state.scene;
const winSlope = devRect(B.state, XE, G - 1, XE, G);             // slope2 水线阶格
const winWater = devRect(B.state, X0 + 2, G + 1, X0 + 6, G + 3); // 主水体内部
const winEdge = devRect(B.state, XE - 2, G + 1, XE - 2, G + 2);  // 阶梯第二阶 slope 格(水下)
console.log('区域窗 slope=', JSON.stringify(winSlope), ' water=', JSON.stringify(winWater),
  ' edge=', JSON.stringify(winEdge));

for (const [name, P, Q] of [['A-vs-B', aBuf, bBuf], ['A-vs-C', aBuf, cBuf], ['C-vs-B', cBuf, bBuf]]) {
  const full = censusBuf(P, Q, w, h);
  const sSlope = censusBuf(P, Q, w, h, winSlope);
  const sWater = censusBuf(P, Q, w, h, winWater);
  const sEdge = censusBuf(P, Q, w, h, winEdge);
  console.log(`${name}: FULL n=${full.n}(${(full.n * 100 / (w * h)).toFixed(3)}%) maxd=${full.maxd} mean=${full.mean.toFixed(2)} bbox=${JSON.stringify(full.bbox)}`);
  console.log(`  slope列 n=${sSlope.n} maxd=${sSlope.maxd} mean=${sSlope.mean.toFixed(2)} | 主水体 n=${sWater.n} maxd=${sWater.maxd} mean=${sWater.mean.toFixed(2)} | 右缘列 n=${sEdge.n} maxd=${sEdge.maxd} mean=${sEdge.mean.toFixed(2)}`);
}

// 逐帧水体窗均色(闪烁面:同臂帧间色变+跨臂对齐)
for (const [label, arm] of [['A', A], ['B', B], ['C', C]]) {
  const seq = arm.snaps.map((sn) => {
    const buf = Buffer.from(sn.b64, 'base64');
    return regionMean(buf, sn.w, winWater).join(',');
  });
  console.log(`臂 ${label} 水体窗逐帧 RGB: ${seq.join(' | ')}`);
  const seqE = arm.snaps.map((sn) => {
    const buf = Buffer.from(sn.b64, 'base64');
    return regionMean(buf, sn.w, winEdge).join(',');
  });
  console.log(`臂 ${label} 阶梯窗逐帧 RGB: ${seqE.join(' | ')}`);
}

// 区域均色读数(水罩判别真值)
console.log('区域均色 RGB:');
console.log('  slope列  A=', regionMean(aBuf, w, winSlope), ' B=', regionMean(bBuf, w, winSlope), ' C=', regionMean(cBuf, w, winSlope));
console.log('  主水体   A=', regionMean(aBuf, w, winWater), ' B=', regionMean(bBuf, w, winWater), ' C=', regionMean(cBuf, w, winWater));
console.log('  右缘列   A=', regionMean(aBuf, w, winEdge), ' B=', regionMean(bBuf, w, winEdge), ' C=', regionMean(cBuf, w, winEdge));

chk('B/C 臂零回退(批真在走/fallback=0)',
  (B.stats?.stats?.fallback ?? 0) === 0 && (C.stats?.stats?.fallback ?? 0) === 0,
  `B fb=${B.stats?.stats?.fallback} rp=${B.stats?.stats?.replays} batch=${B.stats?.stats?.emitBatchQuads} | C fb=${C.stats?.stats?.fallback} rp=${C.stats?.stats?.replays} batch=${C.stats?.stats?.emitBatchQuads}`);
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(0);   // 诊断探针恒 0(census 归因面非判定面)
