// ★TileShine 滚屏慢帧 A/B 定谳探针(第 0 刀,零代码改动)——2026-10-03
//
// 【任务】地狱直通竖井下坠慢帧主因 A/B:缺省(4ms 时间盒) vs ?shinebudget=0(逃生门)
//   (+ 附加臂 __SW_SHINE_OFF=零 shine 仪,量化本通道总成本上界,供降级方案定参)。
// 【世界面】用户真实导出存档(map-天真的钴最高点 (4).json,seed 118606602 =
//   x-ray 基线同种子同竖井——比 createGame 重生成更忠实:井筒/井壁 tile 态 1:1)。
//   loadJson(__swFlow.loadJson)=读自有 json 存档桥(mainFlow.ts:1769)。
// 【下坠配方】玩家定位竖井口(列带 x∈[1616,1628] 首个连续 24 行空气带)→debugGod
//   →自然下坠(零输入,重力承载)→落地地狱带→静止沉降(pendingQ 排干)。
// 【仪器】页内第二 rAF 环逐帧记录 [t,playerY,cameraY,cameraX](与 x-ray 的
//   FireAnimationFrame 事件同仪器);分段按 player.y tile 带归属(非时间对齐——
//   与 xray9 的 vy=600px/s 恒速分段等价,但免疫起落加速段误差);慢帧阈 12.5ms
//   (x-ray 同阈);校准面=落地静止尾窗最小 gap(≈vsync 间隔)。
// 【产物】/tmp/shine-ab/<arm>.json(rows/stats/digests)+ stdout 分段对照表。
//   digests=shineDebugChunkDigests 落地点邻域盒——A/B 逐位对拍通道(降级=延迟
//   烘焙,产物必须逐位恒等;零随机备案 TileShine.ts:240)。
// 【运行】SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs --timeout=280000 \
//          scripts/_shine-ab-fall.mjs            (缺省跑 default 臂)
//   SW_ARMS=budget0 ...                           (?shinebudget=0 臂)
//   SW_ARMS=shineoff ...                          (__SW_SHINE_OFF 臂,零 shine 仪)
//   SW_ARMS=all ...                               (三臂连跑;timeout 需 ≥560000)
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5208';
const WORLD_JSON = process.env.SW_WORLD_JSON || needInput(join(DOWNLOADS, 'map-天真的钴最高点 (4).json'));
const OUT = '/tmp/shine-ab';
const ARM = process.env.SW_ARMS || 'default';
const VIEW = { width: Number(process.env.SW_VW || 1280), height: Number(process.env.SW_VH || 800), deviceScaleFactor: Number(process.env.SW_DPR || 2) };
const FALL_TIMEOUT_MS = Number(process.env.SW_FALL_TIMEOUT || 90_000);
const SETTLE_MS = Number(process.env.SW_SETTLE || 8000);
// 分段带(tile y,与 xray9 段定义同源:雪带 378-620/腐化带 620-1150/石带 1150-1605/地狱 1605-1664)
const BANDS = [['pre', 0, 378], ['snow', 378, 620], ['corrupt', 620, 1150], ['stone', 1150, 1605], ['hell', 1605, 1700]];
mkdirSync(OUT, { recursive: true });

const ARMS = ['default', 'budget0', 'budget4', 'shineoff'];
const ARM_FLAG = { default: '', budget0: '?shinebudget=0', budget4: '?shinebudget=4', shineoff: '' };
// shineStats 序列化面(数值位;★spread 会带 reset 方法,CDP 结构化克隆炸→null)
const PICK_STATS = ['frames', 'ensures', 'hits', 'resumes', 'resumesStalled', 'bakeMs', 'bakes',
  'memoHits', 'memoMisses', 'stale', 'skips', 'pending', 'immediate', 'catchupMax', 'catchupN', 'catchupSum'];

const worldText = readFileSync(WORLD_JSON, 'utf8');
console.log(`world json ${(worldText.length / 1048576).toFixed(1)}MB, arm=${ARM}, viewport=${VIEW.width}x${VIEW.height} dpr${VIEW.deviceScaleFactor}`);

const browser = await launchBrowser({ headed: true, viewport: VIEW });
const errs = [];
try {
  const page = await openPage(browser, { errors: errs, maxErrors: 60 });
  installPinnedRandom(page, 118606602);
  const flag = ARM_FLAG[ARM] ?? '';
  // ★坑:gotoApp 的 origin 形参必须裸 origin+extraQuery 携旗——`ORIGIN+'/'+flag`
  //   会与 gotoApp 内部拼接叠成「?shinebudget=0?shinebudget=0」重复键,
  //   URLSearchParams 取值成 '0?shinebudget=0' → NaN → null → 缺省 4,旗静默失效
  //   (首跑 arm B 即中招=重跑了 baseline)。bootstrap 裸 origin 走,旗在第二跳补。
  const boot = await bootstrap(page, ORIGIN);
  console.log('bootstrap:', JSON.stringify(boot));
  if (!boot.ok) process.exit(1);
  if (flag) {
    const okNav = await gotoApp(page, ORIGIN, { extraQuery: flag });
    const okBridge = okNav && await waitForBridge(page);
    console.log('flag nav:', flag, okNav && okBridge);
    if (!okBridge) process.exit(1);
  }

  // ---- 载入用户真实存档(loadJson 桥;worker 路) ----
  console.log('loadJson start...');
  const tLoad = Date.now();
  await front(page);
  await page.evaluate((text) => { void window.__swFlow.loadJson(text); }, worldText);
  const okGame = await waitForGame(page, { timeout: 240_000, log: (m) => console.log('  ' + m) });
  console.log('loadJson done:', okGame, `${((Date.now() - tLoad) / 1000).toFixed(1)}s`);
  if (!okGame) { await page.screenshot({ path: `${OUT}/${ARM}-loadfail.png` }); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1500));

  // ---- 定位竖井口 + 装记录仪(同一 evaluate:落点即起表,零延迟缝) ----
  const setup = await page.evaluate(async (shineOff) => {
    if (shineOff) globalThis.__SW_SHINE_OFF = true;   // 零 shine 仪:整个通道秒关(含烘焙+blit)
    const g = window.__swGame;
    const st = g.world.store;
    // 竖井列带(xray4:x∈[1614,1632],玩家 x 1616-1628):首个「连续 24 行、行内活跃格≤2」空气带
    let mouth = -1, mouthX = 1622;
    for (let y = 240; y < 1100; y++) {
      let air = true;
      for (let dy = 0; dy < 24 && air; dy++) {
        let act = 0;
        for (let x = 1616; x <= 1628; x++) if (st.hasTile(x, y + dy)) act++;
        if (act > 2) air = false;
      }
      if (air) { mouth = y; break; }
    }
    if (mouth < 0) return { ok: false, why: 'shaft-mouth-not-found' };
    // 选井筒内最深的净空柱(防局部绳索/平台)
    let bestX = mouthX, bestAir = -1;
    for (let x = 1616; x <= 1628; x++) {
      let n = 0;
      while (n < 1400 && mouth + n < st.h && !st.hasTile(x, mouth + 4 + n)) n++;
      if (n > bestAir) { bestAir = n; bestX = x; }
    }
    g.player.debugGod = true;
    g.player.x = bestX * 16 + 8;
    g.player.y = (mouth + 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.statLife = g.player.statLifeMax2;
    if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    // 逐帧记录仪(rAF 时间戳与游戏主环同拍;gap=帧距)
    window.__rows = [];
    window.__stats = [];
    window.__rec = true;
    window.__t0 = performance.now();
    const pickStats = (s) => {
      if (!s) return null;
      const o = {};
      for (const k of ['frames', 'ensures', 'hits', 'resumes', 'resumesStalled', 'bakeMs', 'bakes',
        'memoHits', 'memoMisses', 'stale', 'skips', 'pending', 'immediate', 'catchupMax', 'catchupN', 'catchupSum']) o[k] = s[k];
      return o;
    };
    window.__pickStats = pickStats;
    const tick = (ts) => {
      if (!window.__rec) return;
      const gg = window.__swGame;
      window.__rows.push([Math.round(ts * 100) / 100, Math.round(gg.player.y * 100) / 100,
        Math.round(gg.camera.y * 100) / 100, Math.round(gg.camera.x * 100) / 100]);
      if (window.__rows.length % 120 === 0) {
        window.__stats.push([Math.round(performance.now() - window.__t0), pickStats(window.__shineStats)]);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const m = await import('/src/render/TileShine.ts');
    window.__shineStats = m.shineStats;
    return {
      ok: true, mouth, mouthX: bestX, airDepth: bestAir, py: g.player.y,
      viewW: g.camera.viewW, viewH: g.camera.viewH, zoom: g.camera.zoom,
      canvasW: g.renderer.canvas.width, canvasH: g.renderer.canvas.height,
      shineBudgetMs: m.shineBudgetMs, search: location.search.slice(0, 80),
      shineOff: !!globalThis.__SW_SHINE_OFF,
    };
  }, ARM === 'shineoff');
  console.log('setup:', JSON.stringify(setup));
  if (!setup.ok) process.exit(1);

  const statsSnap = (tag) => page.evaluate((t) => ({ tag: t, t: Math.round(performance.now() - window.__t0),
    stats: window.__pickStats ? window.__pickStats(window.__shineStats) : null }), tag).catch(() => null);
  const preDrop = await statsSnap('pre-drop');

  // ---- 下坠驾驶:轮询到位(地狱带 y≥1600t 且 |vy|<1)或超时 ----
  const t0 = Date.now();
  let landed = false, lastY = -1;
  while (Date.now() - t0 < FALL_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 2000));
    const st2 = await page.evaluate(() => {
      const g = window.__swGame;
      return { y: g.player.y, vy: g.player.vy, tileY: Math.round(g.player.y / 16) };
    }).catch(() => null);
    if (!st2) continue;
    console.log(`  fall t=${((Date.now() - t0) / 1000).toFixed(0)}s tileY=${st2.tileY} vy=${st2.vy.toFixed(1)}`);
    if (st2.tileY >= 1600 && Math.abs(st2.vy) < 1) { landed = true; break; }
    // 中途滞停哨:2s 位移<2px 且未到地狱带=挂在平台/液体上,记警但继续(分段会显形)
    if (lastY >= 0 && Math.abs(st2.y - lastY) < 2 && st2.tileY < 1600) console.log('  !! 滞停(未到 hell 带)');
    lastY = st2.y;
  }
  console.log('fall done, landed:', landed);
  const snapLand = await statsSnap('landed');

  // ---- 落地静止沉降:等 pendingQ 排干(时间盒臂),再收尾 ----
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  let drained = null;
  for (let i = 0; i < 8; i++) {
    drained = await page.evaluate(() => {
      const s = window.__shineStats;
      return s ? { pending: s.pending, bakes: s.bakes, catchupN: s.catchupN } : { pending: 0 };
    }).catch(() => null);
    if (!drained || drained.pending === 0) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log('drain:', JSON.stringify(drained));

  // ---- digests ①:落地点邻域盒(零 shine 保障面;灰/狱石不在 tileShine2 → 恒空) ----
  const endY = await page.evaluate(() => window.__swGame.player.y).catch(() => 0);
  const landTile = Math.round(endY / 16);
  const cy0 = Math.max(0, Math.floor(landTile / 16) - 3), cy1 = cy0 + 7;
  const cx0 = 99, cx1 = 103;
  const dumpDigests = async (box) => page.evaluate(async (b) => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    return m.shineDebugChunkDigests(g.chunks, b.cx0, b.cx1, b.cy0, b.cy1);
  }, box).catch((e) => ({ err: String(e).slice(0, 200) }));
  const digests = ARM === 'shineoff' ? null : await dumpDigests({ cx0, cx1, cy0, cy1 });

  // ---- digests ②:腐化带定点盒(真正非空对拍面)——回卷井筒中段钉住玩家
  //  (fixedUpdate 包裹钉位=物理后复位;渲染照常跑,pendingQ 就地排干) ----
  const PIN_TILE = Number(process.env.SW_PIN_TILE || 885);   // 腐化带 620-1150 中段(黑曜石墙=shine2 密集)
  const corrPin = await page.evaluate(({ pinTile, shaftX }) => {
    const g = window.__swGame;
    const pinY = pinTile * 16;
    g.player.x = shaftX * 16 + 8;
    g.player.y = pinY;
    g.player.vx = 0; g.player.vy = 0;
    g.player.statLife = g.player.statLifeMax2;
    if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    if (!window.__fuPinned) {
      window.__fuPinned = true;
      const fu0 = g.fixedUpdate.bind(g);
      g.fixedUpdate = (...a) => { const r = fu0(...a); g.player.y = pinY; g.player.vy = 0; g.player.vx = 0; return r; };
    }
    return { pinY, camY: g.camera.y };
  }, { pinTile: PIN_TILE, shaftX: setup.mouthX }).catch((e) => ({ err: String(e).slice(0, 200) }));
  console.log('corrPin:', JSON.stringify(corrPin));
  await new Promise((r) => setTimeout(r, 12000));   // 沉降:4ms 盒排干定点视界(§任务反伪影面)
  const corrDrain = await page.evaluate(() => {
    const s = window.__shineStats;
    return s && window.__pickStats ? window.__pickStats(s) : null;
  }).catch(() => null);
  const corrCy0 = Math.max(0, Math.floor(PIN_TILE / 16) - 4), corrCy1 = corrCy0 + 7;
  const corrDigests = ARM === 'shineoff' ? null
    : await dumpDigests({ cx0, cx1, cy0: corrCy0, cy1: corrCy1 });
  const nz = Array.isArray(corrDigests) ? corrDigests.filter((x) => x.sum > 0).length : 0;
  console.log(`corrDigests nonzero=${nz}/${Array.isArray(corrDigests) ? corrDigests.length : 'n/a'}`);

  const finalStats = await statsSnap('end');
  await page.evaluate(() => { window.__rec = false; });
  const rows = await page.evaluate(() => window.__rows);
  const statSamples = await page.evaluate(() => window.__stats);
  const camMeta = await page.evaluate(() => {
    const g = window.__swGame;
    return { viewW: g.camera.viewW, viewH: g.camera.viewH, zoom: g.camera.zoom };
  }).catch(() => null);

  const report = {
    arm: ARM, flag, landed, setup, camMeta, errs: errs.slice(0, 20),
    rows, statSamples, snaps: { preDrop, landed: snapLand, end: finalStats, corrDrain },
    digests, digestBox: { cx0, cx1, cy0, cy1 },
    corrDigests, corrBox: { cx0, cx1, cy0: corrCy0, cy1: corrCy1 }, pinTile: PIN_TILE,
    landTile, endY,
  };
  writeFileSync(`${OUT}/${ARM}.json`, JSON.stringify(report));
  console.log(`written ${OUT}/${ARM}.json rows=${rows.length} digestN=${Array.isArray(digests) ? digests.length : 'n/a'}`);
} finally {
  await browser.close().catch(() => {});
}

// ---- 分段分析(node 侧;单臂打印) ----
try {
  const rep = JSON.parse(readFileSync(`${OUT}/${ARM}.json`, 'utf8'));
  const rows = rep.rows;
  const pyEnd = rows[rows.length - 1][1];
  // 落地静止尾窗:从尾向前,|py-pyEnd|≤32px 的连续段
  let landIdx = rows.length - 1;
  while (landIdx > 0 && Math.abs(rows[landIdx - 1][1] - pyEnd) <= 32) landIdx--;
  // 校准:尾窗最小 gap(vsync 间隔)
  let vsync = Infinity;
  for (let i = Math.max(1, landIdx + 1); i < rows.length; i++) {
    const g2 = rows[i][0] - rows[i - 1][0];
    if (g2 > 0.5 && g2 < vsync) vsync = g2;
  }
  const SLOW = 12.5;
  const segs = [];
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i][0] - rows[i - 1][0];
    const tileY = rows[i - 1][1] / 16;
    let name;
    if (i >= landIdx) name = 'landed';
    else if (tileY >= 1700) name = 'hell';   // ★地狱底慢沉(vy=5→0)帧:tileY≥1700 归 hell(旧版落 'pre'=18.9s 膨胀伪影)
    else {
      const b = BANDS.find(([, a, b2]) => tileY >= a && tileY < b2);
      name = b ? b[0] : 'pre';
    }
    let s = segs.find((x) => x.name === name);
    if (!s) segs.push((s = { name, n: 0, slow: 0, sum: 0, gaps: [] }));
    s.n++; s.sum += gap; s.gaps.push(gap);
    if (gap > SLOW) s.slow++;
  }
  const order = [...BANDS.map((b) => b[0]), 'landed'];
  segs.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  console.log(`\n== [${ARM}] 分段慢帧对照(慢帧阈 ${SLOW}ms;尾窗 vsync≈${vsync.toFixed(2)}ms;落地帧 idx=${landIdx}/${rows.length}) ==`);
  console.log('段        帧数   时长(s)  慢帧  密度(/s)  均帧距(ms)  p95(ms)  均fps');
  for (const s of segs) {
    const dur = s.sum / 1000;
    const sorted = [...s.gaps].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    console.log(`${s.name.padEnd(9)} ${String(s.n).padStart(5)} ${dur.toFixed(1).padStart(8)} ${String(s.slow).padStart(5)} ${(s.slow / Math.max(dur, 0.001)).toFixed(1).padStart(8)} ${(s.sum / Math.max(s.n, 1)).toFixed(2).padStart(9)} ${p95.toFixed(2).padStart(8)} ${(s.n / Math.max(dur, 0.001)).toFixed(0).padStart(6)}`);
  }
  const st = rep.snaps.end?.stats;
  if (st) console.log(`shineStats: frames=${st.frames} bakes=${st.bakes} bakeMs=${st.bakeMs.toFixed(0)} hits=${st.hits} stale=${st.stale} skips=${st.skips} pending=${st.pending} memoHits=${st.memoHits} resume=${st.resumes}(${st.resumesStalled} stalled)`);
} catch (e) { console.log('analysis err:', String(e).slice(0, 200)); }
process.exit(0);
