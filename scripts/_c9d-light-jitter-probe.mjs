// ★C9d 探针:光照格移动抖动复现/验证。
// 场景:地下挖一条横向坑道,内置稳定发光矿(非闪烁源)形成水平光梯度;玩家在其正上方
// 地表高速往复。rAF 逐帧采样坑道内一排固定世界格的 lightAt:
//   · 静止基线(先站定 90 帧)= 光源闪烁/扫描周期噪声下限 stillSpread;
//   · 移动相 = 同一批格子的散布 moveSpread。
// 成对采样 ⇒ moveSpread ≈ stillSpread(世界静止,读数恒=上 tick 计算值);
// 拆对(区域 fresh_N + 数组 fresh_{N-1})⇒ 采样索引随每 tick 相机平移 2-3 格,
// 梯度带格子读数大幅翻转 ⇒ moveSpread ≫ stillSpread =「光照格一抖一抖」。
// 天空光按 groundLevel 深度门控(TileLightScanner:924),地表竖墙无影 ⇒ 场景必须地下。
// 用法:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_c9d-light-jitter-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5231';
const SEED = process.env.SW_SEED ?? '20260927';
const W = 4200, H = 1200;

const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1024, height: 640 },
  args: ['--disable-gpu-sandbox'],
});
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
const gen = await p.evaluate(async (seed, w, h) => {
  await window.__swGame.newWorld(seed, w, h, () => {});
  return 'ok';
}, SEED, W, H).catch((e) => String(e));
console.log('worldgen:', gen);
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await p.evaluate(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player?.x > 0).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 2500));

// ---- 布景:白天/禁刷怪 → 地下坑道 + 发光矿 ----
const setup = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const glowId = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 17);   // 熔炉(稳定发射 212,153,128;非 localRand 闪烁族)
  g.world.clock.timeOfDay = 0.5;
  const wc = g.world.clock;
  if ('isDay' in wc) wc.isDay = true;
  if ('enemySpawnEnabled' in g) g.enemySpawnEnabled = false;
  const surfY = (tx) => { for (let y = 2; y < st.h - 2; y++) if (st.isSolid(tx, y)) return y; return -1; };
  const p0 = Math.floor(g.player.cx / 16);
  let x0 = -1;
  for (let x = Math.max(20, p0 - 200); x < st.w - 200; x++) {
    const s = surfY(x); if (s < 0) continue;
    let flat = true;
    for (let dx = 0; dx < 70; dx++) if (Math.abs(surfY(x + dx) - s) > 1) { flat = false; break; }
    if (flat) { x0 = x; break; }
  }
  if (x0 < 0 || glowId < 0) return { err: 'no flat strip or glow tile', x0, glowId };
  const surf = surfY(x0 + 10);
  const gy = surf + 14;                       // 坑道底层 y
  // 挖坑道:x0+16..x0+60,y=surf+11..gy(4 高)
  for (let x = x0 + 16; x <= x0 + 60; x++) {
    for (let y = surf + 11; y <= gy; y++) {
      const i = y * st.w + x;
      st.type[i] = 0; st.flags[i] = 0; st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
    }
  }
  // 熔炉墙:坑道左端壁 x0+15..16 两列,y=surf+11..gy(稳定发射光源)
  for (let y = surf + 11; y <= gy; y++) {
    for (let dx = 0; dx < 2; dx++) {
      const i = y * st.w + (x0 + 15 + dx);
      st.type[i] = glowId; st.flags[i] = 1; st.frameX[i] = 0; st.frameY[i] = 0;
    }
  }
  // 采样排:坑道中层 y=surf+13,x=x0+18..x0+50(光衰减梯度带)
  const tiles = [];
  for (let x = x0 + 18; x <= x0 + 50; x++) tiles.push([x, surf + 13]);
  return { x0, surf, gy, glowId, tiles, playerTile: p0 };
});
console.log('setup:', JSON.stringify(setup));
if (setup.err) { await b.close(); process.exit(1); }

// ---- 静止基线 → 往复走查,同一采样器(+采样对锚直测) ----
// 拆对到达机制:正常 1-tick 延迟下 compute 内 applyPending 以最近到达结果修复拆对,
// 渲染不可见;结果晚到 >1 tick(渲染压力大=大视口高延迟)时 compute 处 pending 空,
// 拆对直抵渲染=用户所报抖动。探针以缩小视口(zoom 0.35 → 区域 ~3 万格)把 worker
// 延迟推过 1 tick 进入该机制域,并以 (rx,ry,rw,rh) vs 最近应用结果锚 的逐帧直测
// 度量拆对帧数(机制级判据,不依赖场景梯度)。
const result = await p.evaluate(async (tiles) => {
  const g = window.__swGame, st = g.world.store;
  window.__c9d = { rows: [], tiles, phase: 'settle' };
  // 缩小视口 → 区域/worker 帧成本增大 → 延迟 >1 tick(高负载机制域)
  g.camera.zoom = 0.35; g.camera.zoomTarget = 0.35;
  const L = g.lighting, lw = L._lw;
  // 锚直测:包一层 onResult/applyPending,记录最近一次应用到公共面的结果区域
  const lastApplied = { rx: -1, ry: -1, rw: -1, rh: -1 };
  if (lw) {
    const origResult = lw.onResult;
    lw.onResult = (m) => {
      lastApplied.rx = m.rx; lastApplied.ry = m.ry; lastApplied.rw = m.rw; lastApplied.rh = m.rh;
      if (origResult) origResult(m);
    };
    const origAP = lw.applyPending.bind(lw);
    lw.applyPending = (t) => {
      const r = origAP(t);
      if (r) { lastApplied.rx = t.rx; lastApplied.ry = t.ry; lastApplied.rw = t.rw; lastApplied.rh = t.rh; }
      return r;
    };
  }
  const groundTopPx = (px) => {
    const tx = Math.max(1, Math.min(st.w - 2, Math.floor(px / 16)));
    for (let y = 2; y < st.h; y++) if (st.isSolid(tx, y)) return y * 16;
    return (g.world.groundLevel + 10) * 16;
  };
  window.__c9dSample = () => {
    const row = tiles.map(([tx, ty]) => L.lightAt(tx, ty)[0]);
    window.__c9d.rows.push({
      phase: window.__c9d.phase,
      rx: L.rx, ry: L.ry, rw: L.rw, rh: L.rh,
      aRx: lastApplied.rx, aRy: lastApplied.ry, aRw: lastApplied.rw, aRh: lastApplied.rh,
      cam: Math.floor(g.camera.x / 16),
      px: Math.round(g.player.x),
      row,
      pairOk: L.r.length === L.rw * L.rh,
    });
  };
  window.__c9dRaf = requestAnimationFrame(function loop() {
    window.__c9dSample();
    window.__c9dRaf = requestAnimationFrame(loop);
  });
  // 等 worker live(粘性门入场)
  let liveWait = 0;
  try {
    const { lightGateDiag } = await import('/src/lighting/LightingEngine.ts');
    while (!lightGateDiag.live && liveWait < 300) { await new Promise((r) => setTimeout(r, 100)); liveWait++; }
  } catch { /* 本地路径时代 */ }
  window.__c9d.liveWaitTicks = liveWait;
  // 结果晚到注入(高负载机制域复现):真机「渲染压力大」=lag p50 ≤25ms(live 入场)
  // 但逐帧到达时刻跨过 compute 窗口 → 部分 tick pending 空 → 拆对直抵渲染。
  // 此处把 worker 回喂延迟 SW_LAG_MS(缺省 18ms):lag p50≈23ms 仍过粘性门进场,
  // 而到达节奏 18ms+worker ≈ >1 tick → 每 ~2 tick 一次 pending 空=确定性拆对帧。
  // 注:worker 惰性生成,live 入场后必非空;注入在 live 入场后生效。
  const LAG_MS = Number(window.__c9dLagMs ?? 18);
  let injected = false;
  if (lw && lw.worker && LAG_MS > 0) {
    const origHandler = lw.worker.onmessage;
    lw.worker.onmessage = (ev) => { setTimeout(() => origHandler(ev), LAG_MS); };
    injected = true;
  }
  // settle 60 帧(光场收敛,不计入基线) → 静止基线 60 帧
  window.__c9d.phase = 'settle';
  for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
  window.__c9d.phase = 'still';
  for (let i = 0; i < 60; i++) await new Promise((r) => requestAnimationFrame(r));
  // 移动相:地表往复 4 趟(坑道正上方)
  window.__c9d.phase = 'move';
  const SPEED = 12;   // px/rAF ≈ 0.75 格/tick(疾跑级)
  const xa = (tiles[0][0] - 2) * 16, xb = (tiles[tiles.length - 1][0] + 2) * 16;
  let dir = 1, x = g.player.x;
  if (x < xa || x > xb) x = xa;
  for (let pass = 0; pass < 4; pass++) {
    while ((dir > 0 && x < xb) || (dir < 0 && x > xa)) {
      x += dir * SPEED;
      g.player.x = x;
      g.player.y = groundTopPx(x) - g.player.h - 1;
      g.player.vx = dir * SPEED; g.player.vy = 0;
      await new Promise((r) => requestAnimationFrame(r));
    }
    dir = -dir;
  }
  cancelAnimationFrame(window.__c9dRaf);
  const mod = await import('/src/lighting/LightingEngine.ts').catch(() => null);
  const diag = mod ? { live: mod.lightGateDiag.live, p50: +mod.lightGateDiag.p50Ms.toFixed(1), lag: +mod.lightGateDiag.lastLagMs.toFixed(1) } : null;
  return {
    liveWaitTicks: window.__c9d.liveWaitTicks,
    injected,
    diag,
    hasWorker: !!(g.lighting && g.lighting._lw),
    isLive: !!(g.lighting && g.lighting._lw && g.lighting._lw.isLive && g.lighting._lw.isLive()),
    pairOkAll: window.__c9d.rows.every((r) => r.pairOk),
    rows: window.__c9d.rows,
  };
}, setup.tiles);
const stillRows = result.rows.filter((r) => r.phase === 'still');
const moveRows = result.rows.filter((r) => r.phase === 'move');
console.log('meta:', JSON.stringify({
  still: stillRows.length, move: moveRows.length,
  hasWorker: result.hasWorker, isLive: result.isLive, pairOkAll: result.pairOkAll,
  injected: result.injected,
  diag: result.diag, liveWait: result.liveWaitTicks, errors: errors.length,
}));
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));

// ---- 分析:逐固定格散布 + 采样对锚直测(拆对帧数) ----
function analyze(rows) {
  const n = rows[0].row.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    let mn = 255, mx = 0, jumps = 0;
    for (const r of rows) { const v = r.row[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    for (let k = 1; k < rows.length; k++) if (Math.abs(rows[k].row[i] - rows[k - 1].row[i]) > 30) jumps++;
    out.push({ tile: setup.tiles[i], mn, mx, spread: mx - mn, jumps });
  }
  return out;
}
const desyncOf = (r) => (r.rx !== r.aRx || r.ry !== r.aRy || r.rw !== r.aRw || r.rh !== r.aRh) ? 1 : 0;
const still = analyze(stillRows).sort((a, b2) => b2.spread - a.spread);
const move = analyze(moveRows).sort((a, b2) => b2.spread - a.spread);
const stillSpread = still[0]?.spread ?? 0;
const moveSpread = move[0]?.spread ?? 0;
const moveJumps = move.reduce((s, t) => s + t.jumps, 0);
const stillJumps = still.reduce((s, t) => s + t.jumps, 0);
const desyncFrames = moveRows.reduce((s, r) => s + desyncOf(r), 0);
const rowMax = Math.max(...move.map((t) => t.mx), 0);
console.log('静止基线最重 3 格:', JSON.stringify(still.slice(0, 3)));
console.log('移动相最重 6 格:', JSON.stringify(move.slice(0, 6)));
if (rowMax < 10) {
  console.log(`VERDICT: SCENE DEGENERATE(采样排无光,rowMax=${rowMax})——场景未形成光梯度`);
  await b.close();
  process.exit(3);
}
const jittered = (moveSpread - stillSpread > 30 || moveJumps > 5 || desyncFrames > 5);
console.log(`VERDICT: stillSpread=${stillSpread} moveSpread=${moveSpread} jumps still/move=${stillJumps}/${moveJumps} desyncFrames=${desyncFrames}/${moveRows.length} → ${jittered ? 'JITTER(抖)' : 'STABLE(稳)'}`);
await b.close();
process.exit(jittered ? 2 : 0);
