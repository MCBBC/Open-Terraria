// ★四柱事件掉帧定谳探针（2026-09-25;用户实报柱阶段帧率下降,怀疑渲染 v2 优化互打）。
// 任务：分档采帧耗（基线/柱远/柱近盾在/破盾风暴/死亡演出/击杀后）× 链路 A/B
// （缺省 v2 全开 / ?bgl=0 / ?sfxgl=0 / ?bgl=0&sfxgl=0=近似 pre-v2 旧链）+
// 帧内分段计时（fixedUpdate/光照/滤镜链/尘/盾泡/波场/acc 管线）+ 账本读数 +
// cpuprofile 短采样 top 自耗时。只读探针——零生产码改动。
//
// 运行（先起私有 vite，见 CLAUDE.md 并行会话约定）：
//   SW_PORT=5217 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5217 nohup npx vite > /tmp/vite-5217.log 2>&1 &
//   SW_ORIGIN=http://localhost:5217 node tools/run-diag.mjs --timeout=2400000 scripts/_pillar-fps-probe.mjs
//
// 场景构造：4 塔（422 星旋/517 日耀/507 星云/493 星尘）spawn 在玩家东侧 4200px 起步
// 逐塔 +700px（塔间距>4000px Zone=同时至多一塔在滤镜区——对齐原版塔分布语义）;
// 盾 100（downedMoonlord 前=ShieldStrengthTowerMax）。「近塔」取塔 0（星旋,玩家 640px）。
// 风暴相补种星旋族小怪（425×1/426×5/429×3/427×2——MINION_TOWER vortex 组典型战斗负载）。
// 计量纪律：帧耗=同步驱动 g.frame(vnow+16.67)（_b2b-world-ab GG 同款,确定论 CPU 帧价,
// 不受 headless rAF 节流影响）;rAF 只用于 soak（种群积聚）与 cpuprofile 段。
import { launchBrowser, openPage, bootstrap, createGame, front } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { armPerfInstrumentation, installFrameProbe, createPerfRecorder, sleep } from '../tools/probe/lib/perf.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const CHAINS = (process.env.PILLAR_CHAINS || 'default,bgl0,sfxgl0,pre2').split(',').map((s) => s.trim()).filter(Boolean);
const NFRAMES = Number(process.env.PILLAR_FRAMES || 100);
const OUT_DIR = process.env.PILLAR_OUT || '/tmp/probe-out/pillar-fps';
const DO_PROFILE = process.env.PILLAR_PROFILE !== '0';

const CHAIN_URL = {
  default: `${ORIGIN}/?cloudcache=0`,                    // 渲染 v2 全缺省开
  bgl0: `${ORIGIN}/?bgl=0&cloudcache=0`,                 // 世界层 2D 全链（B1/B2/B2b 逃生门）
  sfxgl0: `${ORIGIN}/?sfxgl=0&cloudcache=0`,             // 滤镜链回旧「GL→2D→GL」乒乓（A1 逃生门）
  pre2: `${ORIGIN}/?bgl=0&sfxgl=0&cloudcache=0`,         // 两者同关 ≈ pre-v2 旧链参照
};

const report = { chains: {}, env: { origin: ORIGIN, chains: CHAINS, nframes: NFRAMES } };
mkdirSync(OUT_DIR, { recursive: true });

const browser = await launchBrowser({});

// ---------------- 页内仪器（一次性装,全链路共用） ----------------
async function installInstruments(page) {
  // 分段计时包（prototype 包裹=探针侧,零生产码）
  await page.evaluate(() => {
    const g = window.__swGame;
    const R = g.renderer;
    const bag = {};
    const wrap = (obj, name, label) => {
      const orig = obj[name];
      if (typeof orig !== 'function' || orig.__swPfp) return false;
      const w = function (...a) {
        const t0 = performance.now();
        try { return orig.apply(this, a); }
        finally {
          const d = performance.now() - t0;
          const e = bag[label] ?? (bag[label] = { ms: 0, n: 0, max: 0 });
          e.ms += d; e.n++; if (d > e.max) e.max = d;
        }
      };
      w.__swPfp = true;
      obj[name] = w;
      return true;
    };
    const RP = Object.getPrototypeOf(R);
    wrap(RP, 'render', 'renderTotal');
    wrap(RP, 'updateWaterWaves', 'waves');
    wrap(RP, 'drawScreenFilterChain', 'screenFx');
    wrap(RP, 'drawVanillaDustPass', 'dustDraw');
    wrap(RP, 'drawTowerShield', 'towerShield');
    wrap(RP, 'drawAnimatedTileLayer', 'animTiles');
    wrap(RP, 'drawAnimatedWallLayer', 'animWalls');
    wrap(RP, 'drawLiquids', 'liquids');
    wrap(RP, 'drawLiquidBehindSolidTiles', 'liquidsBehind');
    wrap(RP, 'finishAccFrame', 'accFinish');
    wrap(RP, 'accReadbackImageData', 'accReadback');
    wrap(RP, 'presentPendingSky', 'presentSky');
    wrap(RP, 'raiseSelfLuminousProjLight', 'lumRaise');     // 嫌疑①:SELF_LUMINOUS 抬光
    wrap(RP, 'restoreSelfLuminousProjLight', 'lumRestore');
    const GP = Object.getPrototypeOf(g);
    wrap(GP, 'fixedUpdate', 'fixedUpdate');
    if (g.lighting) {
      const LP = Object.getPrototypeOf(g.lighting);
      wrap(LP, 'compute', 'lightCompute');
      const origAdd = LP.addLight;
      if (origAdd && !origAdd.__swPfp) {
        const w = function (x, y, r, gg, b) {
          window.__pfpLightN = (window.__pfpLightN || 0) + 1;
          return origAdd.call(this, x, y, r, gg, b);
        };
        w.__swPfp = true; LP.addLight = w;
      }
    }
    // lumRaise 触格数注入面（读 _lumFloorTouched 长度/4=格数,嫌疑①量化）
    if (bag.lumRaise) {
      const cur = RP.raiseSelfLuminousProjLight;
      const w = function (...a) {
        const v = cur.apply(this, a);
        const n = (this._lumFloorTouched?.length ?? 0) / 4;
        bag.__lumCellsSum = (bag.__lumCellsSum || 0) + n;
        if (n > (bag.__lumCellsMax || 0)) bag.__lumCellsMax = n;
        return v;
      };
      w.__swPfp = true; RP.raiseSelfLuminousProjLight = w;
    }
    window.__pfpBag = bag;
    window.__pfpSegReset = () => { for (const k of Object.keys(bag)) delete bag[k]; window.__pfpLightN = 0; window.__pfpLightMax = 0; };
  });
}

// ---------------- 页内读数 ----------------
async function readCounts(page) {
  return page.evaluate(() => {
    const g = window.__swGame;
    const R = g.renderer;
    const em = g.entities;
    const projIds = {};
    for (const p of em.projectiles) { const id = p.projId ?? -1; projIds[id] = (projIds[id] || 0) + 1; }
    const topProj = Object.entries(projIds).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const npcIds = {};
    for (const e of em.enemies) { const id = e.vanillaId ?? -1; npcIds[id] = (npcIds[id] || 0) + 1; }
    const topNpc = Object.entries(npcIds).sort((a, b) => b[1] - a[1]).slice(0, 14);
    let dustActive = 0, dustPool = 0;
    try { const pool = R.vanillaDust?.['pool'] ?? []; dustPool = pool.length; for (const d of pool) if (d.active) dustActive++; } catch { /* 读面缺 */ }
    return {
      enemies: em.enemies.length, projectiles: em.projectiles.length,
      drops: em.drops.length, critters: em.critters?.length ?? 0,
      towers: em.enemies.filter((e) => e.vanillaId != null && [517, 422, 507, 493].includes(e.vanillaId) && !e.dead).length,
      topNpc, topProj, dustActive, dustPool: dustPool || null,
      lightsPerFrame: window.__pfpLightN || 0,
      lightMax: window.__pfpLightMax || 0,
      lumCellsLast: window.__pfpBag?.__lumCellsSum != null ? Math.round(window.__pfpBag.__lumCellsSum) : null,
      gfxQ: typeof window.__gfxQGet === 'function' ? window.__gfxQGet() : null,
      shield: g.world.lunarEvent ? { ...g.world.lunarEvent.shield } : null,
      playerXY: [Math.round(g.player.x), Math.round(g.player.y)],
      towOpacity: R._towerFilterOpacity ?? null,
    };
  });
}

async function readLedger(page) {
  return page.evaluate(() => {
    const R = window.__swGame.renderer;
    return {
      sfxPathStats: { ...R.sfxPathStats }, opresentStats: { ...R.opresentStats },
      composePathStats: { ...R.composePathStats }, cloudPathStats: { ...R.cloudPathStats },
      bglPathStats: { ...R.bglPathStats }, cloudMergeStats: { ...R.cloudMergeStats },
      paths: { sfx: R.sfxPathUsed, compose: R.composePathUsed, cloud: R.cloudPathUsed, bgl: R.bglPathUsed, merge: R.cloudMergeUsed },
      bglShim: R.bglShimStats?.() ?? null,
      worldCanvasNull: R.worldCanvas === null,
      b2bCreations: R.b2bWorldCanvasCreations ?? null,
    };
  });
}

// 同步驱动 N 帧（模式 'sim'=unpaused 含 fixedUpdate / 'render'=paused 仅渲染）。
// 逐帧采 ms + 帧内路径分布（sfx/bgl/compose/cloud used）。
// ★__vnow 每次【重锚 performance.now()】——soak(rAF) 推进真实时钟后,旧合成时基
//   会给出负 dt → acc 倒扣 → steps=0 → frameSkipMode='subtle' SuppressDraw
//   整帧早退（帧耗 0.002ms 伪影,smoke run 实锤）。
async function framesN(page, n, mode) {
  return page.evaluate(({ n, mode }) => {
    const g = window.__swGame;
    const R = g.renderer;
    const prevPaused = g.paused;
    g.paused = mode === 'render';
    const times = [];
    const paths = { sfx: {}, bgl: {}, compose: {}, cloud: {} };
    const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
    window.__pfpLightN = 0; window.__pfpLightMax = 0;
    window.__vnow = performance.now();   // 重锚真实时钟（见头注）
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      window.__vnow = window.__vnow + 16.6667;
      window.__pfpLightN = 0;
      const f0 = performance.now();
      g.frame(window.__vnow);
      times.push(performance.now() - f0);
      if (window.__pfpLightN > window.__pfpLightMax) window.__pfpLightMax = window.__pfpLightN;
      bump(paths.sfx, R.sfxPathUsed || '-'); bump(paths.bgl, R.bglPathUsed || '-');
      bump(paths.compose, R.composePathUsed || '-'); bump(paths.cloud, R.cloudPathUsed || '-');
    }
    const wall = performance.now() - t0;
    g.paused = prevPaused;
    const sorted = [...times].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(n - 1, Math.floor(n * p))];
    return {
      n, mean: +(wall / n).toFixed(3), p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3),
      max: +sorted[n - 1].toFixed(3), fpsEquiv: +(1000 / (wall / n)).toFixed(1),
      lightMax: window.__pfpLightMax || 0, paths,
      lumCellsMean: window.__pfpBag?.__lumCellsSum ? +(window.__pfpBag.__lumCellsSum / n).toFixed(1) : 0,
    };
  }, { n, mode });
}

/** gfxQuality 钉 1（headless rAF 59.4fps vs 阈值 30+30q≈59.9 → 每秒 -0.1 漂移
 *  =探针伪影;逐档测量前钉值,免降档螺旋污染 A/B） */
async function pinGfxQ(page) {
  await page.evaluate(() => import('/src/core/GfxQuality.ts').then((m) => {
    m.gfxQuality.value = 1; m.gfxQuality.rate = 0.005; m.gfxQuality.drawsThisSecond = 0;
  })).catch(() => {});
}

async function segRead(page) {
  return page.evaluate(() => {
    const bag = window.__pfpBag ?? {};
    const out = {};
    for (const [k, v] of Object.entries(bag)) {
      if (k.startsWith('__')) continue;
      out[k] = { ms: +v.ms.toFixed(2), n: v.n, mean: +(v.ms / Math.max(1, v.n)).toFixed(3), max: +v.max.toFixed(3) };
    }
    return out;
  });
}

// rAF soak（真实时间种群积聚;perf 互斥纪律只在无 segment 时用）
async function soak(page, ms) {
  await front(page);
  await page.evaluate(() => { window.__swGame.start(); });
  await sleep(ms);
  await page.evaluate(() => { window.__swGame.running = false; });
  await sleep(60);
}

// ---------------- 单链路全流程 ----------------
async function runChain(chain) {
  const errors = [];
  const page = await openPage(browser, { errors });
  const res = { tiers: {}, seg: {}, counts: {}, ledger: {}, errors };

  await armPerfInstrumentation(page, {});
  const boot = await bootstrap(page, CHAIN_URL[chain]);
  if (!boot.ok) { res.bootFail = boot.why; report.chains[chain] = res; await page.close(); return; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  if (!gen?.ok) { res.bootFail = 'gen:' + (gen?.why ?? '?'); report.chains[chain] = res; await page.close(); return; }
  await installFrameProbe(page).catch(() => {});

  // 确定性降噪（_b2b-world-ab 同款:云停/天气关/钟面冻结/风摆关）
  await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer, sky = r.sky;
    Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
    sky.maintainClouds = () => {}; sky.drawAmbience = () => {};
    r.biomeBg.update = () => {};
    const w = g.world.weather;
    if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; }
    try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
    g.enemySpawnEnabled = false;   // 受控种群:自然刷怪关,风暴相手工补种
  });
  await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; }));
  await freezeClock(page, { tod: 0.5 });
  await installInstruments(page);
  await page.evaluate(() => import('/src/core/GfxQuality.ts').then((m) => {
    window.__gfxQGet = () => m.gfxQuality.value;
  }));

  await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
  await page.evaluate(() => { window.__vnow = performance.now(); });
  // 页内辅助:列真实地表行（世界顶部首个实心/活动格）——防出生点以东地形起伏把
  // 玩家埋进山体（smoke run 实锤:全屏 dirt wall=柱全离屏）
  await page.evaluate(() => {
    window.__surfaceYAt = (wx) => {
      const g = window.__swGame; const st = g.world.store;
      const tx = Math.max(0, Math.min(st.w - 1, Math.floor(wx / 16)));
      for (let ty = 20; ty < st.h; ty++) { if (st.isSolid(tx, ty) || st.isActive(tx, ty)) return ty; }
      return Math.floor(g.world.groundLevel);
    };
    window.__placePlayerNear = (wx, dy = 0) => {
      const g = window.__swGame;
      const sy = window.__surfaceYAt(wx);
      g.player.x = wx; g.player.y = sy * 16 - g.player.h - 2 + dy;
      g.player.vx = 0; g.player.vy = 0;
      g.camera.x = g.player.x + g.player.w / 2; g.camera.y = g.player.y + g.player.h / 2;
      return [Math.round(g.player.x), Math.round(g.player.y), sy];
    };
  });

  // ---- Tier baseline:无塔空场 ----
  await pinGfxQ(page);
  await page.evaluate(() => window.__pfpSegReset());
  res.tiers.baseline = await framesN(page, NFRAMES, 'sim');
  res.seg.baseline = await segRead(page);
  res.counts.baseline = await readCounts(page);

  // ---- 造 4 塔（盾 100）+ 塔间距 700px（Zone 不重叠）----
  await page.evaluate(async () => {
    const g = window.__swGame;
    const flow = window.__swFlow;
    const px = g.player.x;
    const gy = g.world.groundLevel * 16;
    const ids = [422, 517, 507, 493];
    window.__pfpTowers = [];
    for (let i = 0; i < 4; i++) {
      const meta = await flow.spawnVanillaEnemy(ids[i], px + 4200 + i * 700, gy - 320);
      window.__pfpTowers.push(meta);
    }
    const le = g.world.lunarEvent;
    le.active = true;
    le.towerActive = { solar: true, vortex: true, nebula: true, stardust: true };
    le.shield = { solar: 100, vortex: 100, nebula: 100, stardust: 100 };
    g.enemySpawnEnabled = false;
  });
  await soak(page, 2500);   // 塔落位贴地

  // ---- Tier far:玩家在出生点,塔在 4200px 外（Zone 外,滤镜区无塔）----
  await pinGfxQ(page);
  await page.evaluate(() => window.__pfpSegReset());
  res.tiers.far = await framesN(page, NFRAMES, 'sim');
  res.seg.far = await segRead(page);
  res.counts.far = await readCounts(page);
  try { await page.screenshot({ path: `${OUT_DIR}/far-${chain}.png` }); } catch { /* 无妨 */ }

  // ---- Tier near-shield:玩家贴塔 0（星旋;Zone 内 FilterTower 激活+盾泡+柱体在屏）----
  await page.evaluate(() => {
    const g = window.__swGame;
    const t0 = window.__pfpTowers[0];
    window.__pfpNearX = (t0?.x ?? g.player.x + 4200) + 340;   // 塔 0 前方 340px（柱 640px 半宽内贴脸）
    window.__placePlayerNear(window.__pfpNearX);
  });
  await soak(page, 3500);
  await pinGfxQ(page);
  await page.evaluate(() => window.__pfpSegReset());
  res.tiers.nearShield = await framesN(page, NFRAMES, 'sim');
  res.seg.nearShield = await segRead(page);
  res.counts.nearShield = await readCounts(page);
  try { await page.screenshot({ path: `${OUT_DIR}/near-${chain}.png` }); } catch { /* 无妨 */ }

  // ---- Tier storm:破盾 + 补种星旋族小怪 + soak 积聚弹幕/尘 ----
  await page.evaluate(async () => {
    const g = window.__swGame;
    const flow = window.__swFlow;
    g.world.lunarEvent.shield.vortex = 0;
    const nx = window.__pfpNearX;
    const gy = g.world.groundLevel * 16;
    const plan = [[425, 1], [426, 5], [429, 3], [427, 2]];
    window.__pfpMinions = [];
    for (const [id, n] of plan) {
      for (let i = 0; i < n; i++) {
        const m = await flow.spawnVanillaEnemy(id, nx + (Math.random() * 1200 - 600), gy - 140 - Math.random() * 300);
        if (m) window.__pfpMinions.push(m.id);
      }
    }
    g.enemySpawnEnabled = false;
  });
  await soak(page, 10000);
  // cpuprofile 段（真实 rAF,8s;仅 default 链风暴稳态）
  if (DO_PROFILE && chain === 'default') {
    const rec = createPerfRecorder(page, {
      outDir: OUT_DIR, scenario: 'pillar',
      channels: { profile: true, trace: false, metrics: true }, topN: 16,
    });
    await page.evaluate(() => { window.__swGame.start(); });
    await rec.startSegment('storm-rAF');
    await sleep(8000);
    await page.evaluate(() => { window.__swGame.running = false; });
    const seg = await rec.endSegment();
    await rec.settled().catch(() => {});
    res.profile = {
      wallMs: seg.wallMs, fps: seg.fps, sim: seg.sim,
      top: (seg.profile?.funcs ?? []).slice(0, 16),
      longtasks: seg.longtasks?.top ?? [],
    };
  }
  await pinGfxQ(page);
  await page.evaluate(() => window.__pfpSegReset());
  res.tiers.storm = await framesN(page, NFRAMES, 'sim');
  res.seg.storm = await segRead(page);
  res.counts.storm = await readCounts(page);
  res.tiers.stormRenderOnly = await framesN(page, NFRAMES, 'render');
  res.seg.stormRenderOnly = await segRead(page);
  await page.evaluate(() => window.__pfpSegReset());
  // 留证截图（风暴相）
  try { await page.screenshot({ path: `${OUT_DIR}/storm-${chain}.png` }); } catch { /* headless 无妨 */ }

  // ---- Tier dying:击杀近塔（死亡演出 180t,前 100 tick 内采帧=爆散尘风暴中段）----
  await page.evaluate(() => {
    const g = window.__swGame;
    const t = (g.entities.enemies ?? []).find((e) => e.vanillaId === 422 && !e.dead);
    if (t) { g.world.lunarEvent.shield.vortex = 0; t.dontTakeDamage = false; t.hurt(1e9, 0, 0, g); }
  });
  await pinGfxQ(page);
  await page.evaluate(() => window.__pfpSegReset());
  res.tiers.dying = await framesN(page, NFRAMES, 'sim');
  res.seg.dying = await segRead(page);
  res.counts.dying = await readCounts(page);
  try { await page.screenshot({ path: `${OUT_DIR}/dying-${chain}.png` }); } catch { /* 无妨 */ }

  // ---- Tier after:演出收尾+尘衰减 soak 后采帧 ----
  await soak(page, 4000);
  await pinGfxQ(page);
  await page.evaluate(() => window.__pfpSegReset());
  res.tiers.after = await framesN(page, NFRAMES, 'sim');
  res.seg.after = await segRead(page);
  res.counts.after = await readCounts(page);
  try { await page.screenshot({ path: `${OUT_DIR}/after-${chain}.png` }); } catch { /* 无妨 */ }

  res.ledger.final = await readLedger(page);
  await page.close();
  report.chains[chain] = res;
}

// ---------------- 主流程 ----------------
try {
  for (const chain of CHAINS) {
    console.log(`\n===== chain ${chain} =====`);
    await runChain(chain);
    const r = report.chains[chain];
    if (r.bootFail) { console.log('BOOT FAIL: ' + r.bootFail); continue; }
    for (const [tier, t] of Object.entries(r.tiers)) {
      console.log(`[${tier}] mean=${t.mean}ms p50=${t.p50} p95=${t.p95} max=${t.max} (~${t.fpsEquiv}fps) lights/frame≤${t.lightMax} lumCells/frame=${t.lumCellsMean}`);
      console.log(`   paths.sfx=${JSON.stringify(t.paths.sfx)} bgl=${JSON.stringify(t.paths.bgl)} compose=${JSON.stringify(t.paths.compose)}`);
    }
    console.log('seg.storm =', JSON.stringify(r.seg.storm));
    console.log('counts.storm =', JSON.stringify(r.counts.storm));
    if (r.profile) {
      console.log(`[profile] fps=${r.profile.fps?.mean?.toFixed?.(1)} sim=${r.profile.sim?.msPerFrame}ms wall=${r.profile.wallMs}ms`);
      for (const f of r.profile.top ?? []) {
        console.log(`  self=${String(f.selfMs ?? '').padStart(9)}ms  ${String(f.selfPct ?? '').padStart(6)}%  ${f.fn}@${f.url}:${f.line}`);
      }
    }
  }
} finally {
  writeFileSync(`${OUT_DIR}/report.json`, JSON.stringify(report, null, 1));
  await browser.close().catch(() => {});
}
console.log(`\nreport → ${OUT_DIR}/report.json`);
