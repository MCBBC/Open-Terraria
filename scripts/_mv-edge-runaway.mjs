// 状态切换沿 × 冲刺滑行失控普查（probe #2，页面内整体执行——inject 回调不可序列化）。
// 定谳目标：dashDelay=-1（滑行中）进入 仓内独占分支（绳/微光/微光化/星旋/坐椅）
//  → dashMovement 跳过 → vx 冻结无阻尼 → 松键持续漂移、反向键失效。
// 运行:SW_ORIGIN=http://localhost:5222 node tools/run-diag.mjs scripts/_mv-edge-runaway.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&swperf=0&edge2=' + Date.now();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn')].find((e) => /我已知晓|已知/.test(e.textContent ?? ''));
    if (b) b.click();
  });
} catch { /* 无弹窗 */ }

const OUT = await page.evaluate(() => {
  const g0 = window.__swGame, p0 = g0.player, st0 = g0.world.store;

  const rig = (opts) => {
    const g = window.__swGame, p = g.player, st = g.world.store;
    const o = opts ?? {};
    const GY = 300;
    for (let x = 120; x <= 680; x++) for (let y = GY - 100; y <= GY + 40; y++) {
      st.setTile(x, y, 0); st.setSlope(x, y, 0); st.setHalfBrick(x, y, false);
      st.setLiquid(x, y, 0, 0);
    }
    for (let x = 130; x <= 670; x++) st.setTile(x, GY, 1);
    if (o.ropeColumns) for (let cx = o.ropeColumns[0]; cx <= o.ropeColumns[1]; cx++)
      for (let y = GY - 4; y <= GY - 1; y++) st.setTile(cx, y, o.ropeTile ?? 263);
    if (o.shimmerPool) {
      for (let x = 208; x <= 238; x++) for (let y = GY; y <= GY + 5; y++) st.setTile(x, y, 0);
      for (let x = 208; x <= 238; x++) for (let y = GY; y <= GY + 4; y++) st.setLiquid(x, y, 255, 4);
    }
    p.x = (o.px ?? 200) * 16; p.y = GY * 16 - 42; p.vx = 0; p.vy = 0;
    p.onGround = true; p.dead = false; p.respawnTimer = 0;
    p.dashDelay = 0; p.dashT = 0; p.mountDash6Active = false; p.eocDash = 0; p.solarDashing = false;
    p.ridingCart = false; p.cart = null; p.ridingMount = false; p.pulley = false; p.ropeCount = 0;
    p.sleeping = false; p.sitting = false; p.sitTicks = 0; p.useTime = 0; p.itemAnimTicks = 0;
    p.cartFlip = false; p.grappleReleaseJump = true; p.fallStartY = null;
    for (const k of [47, 90, 98, 99, 353]) p.buffs.remove?.(k);
    g.input.keys.clear(); g.input.touchKeys.clear();
    g.input.uiBlocking = false; g.input.mouseDown = false; g.input.mouseHeld = false;
    if (o.dash2) {
      const defs = window.__swITEMS;
      let idx = -1;
      for (let i = 0; i < defs.length; i++) { const d = defs[i]; if (d && d.vid === 3097 && typeof d.key === 'string' && d.key.includes('EoCShield')) { idx = i; break; } }
      if (idx < 0) throw new Error('EoCShield(3097) def not found');
      p.inv.armor[3] = { id: idx, stack: 1 };
    } else p.inv.armor[3] = null;
    return { ok: true };
  };

  const drive = (steps) => {
    const g = window.__swGame, p = g.player;
    const log = [];
    let tick = 0;
    for (const st of steps) {
      for (let i = 0; i < st.ticks; i++) {
        if (st.inject) st.inject(p, g);
        p.inputX = (st.keys.l ? -1 : 0) + (st.keys.r ? 1 : 0);
        p.inputJump = !!(st.keys.j);
        p.inputDown = !!(st.keys.d); p.inputUp = false;
        p.inputLeft = !!st.keys.l; p.inputRight = !!st.keys.r;
        p.inputDash = false; p.releaseDash = true;
        p.inputTorch = false; p.inputUseItem = false; p.inputUseTile = false;
        p.fixedUpdate(1, g);
        tick++;
        const tx = Math.floor((p.x + p.w / 2) / 16), ty = Math.floor((p.y + p.h / 2) / 16);
        let ropeHere = false;
        if (g.world.store.inBounds(tx, ty)) {
          const t = g.world.store.type[g.world.store.idx(tx, ty)];
          ropeHere = t === 130 || t === 263 || t === 271 || t === 505 || t === 506;   // TILE_DEFS rope 族内部 id
        }
        log.push({
          t: tick, inL: p.inputLeft ? 1 : 0, inR: p.inputRight ? 1 : 0,
          dd: p.dashDelay, vx: +p.vx.toFixed(3), x: +p.x.toFixed(1), y: +p.y.toFixed(1),
          onG: p.onGround ? 1 : 0, mnt: p.ridingMount ? 1 : 0, cart: p.ridingCart ? 1 : 0,
          pul: p.pulley ? 1 : 0, rope: ropeHere ? 1 : 0,
          wat: p.inWater ? 1 : 0, shim: p.inShimmer ? 1 : 0, shmg: p.shimmering ? 1 : 0,
          web: p.buffs.has?.(98) ? 1 : 0, vor: p.buffs.has?.(99) ? 1 : 0,
          froz: p.buffs.has?.(63) ? 1 : 0, sit: p.sitting ? 1 : 0, sleep: p.sleeping ? 1 : 0,
        });
      }
    }
    return log;
  };

  const analyze = (log) => {
    let driftTicks = 0, driftStart = null, driftDist = 0, driftRun = null;
    for (const r of log) {
      if (r.inL === 0 && r.inR === 0 && r.dd >= 0 && Math.abs(r.vx) > 0.5 && !r.mnt && !r.cart && !r.pul) {
        driftTicks++;
        if (driftStart === null) driftStart = r.x;
        driftDist = Math.abs(r.x - driftStart);
        if (!driftRun) driftRun = [r.t, r.t]; else driftRun[1] = r.t;
      } else driftStart = null;
    }
    const slideTicks = log.filter((r) => r.dd < 0).length;
    const maxAbsVx = Math.max(...log.map((r) => Math.abs(r.vx)));
    return { driftTicks, driftDist: +driftDist.toFixed(0), slideTicks, maxAbsVx: +maxAbsVx.toFixed(2),
      driftRun, endX: log[log.length - 1]?.x, endVx: log[log.length - 1]?.vx, endDD: log[log.length - 1]?.dd };
  };

  const compact = (log) => {
    const out = []; let prev = null;
    for (const r of log) {
      const sig = [r.inL, r.inR, r.dd, Math.round(r.vx * 4), Math.round(r.x / 8), r.rope, r.wat, r.shim, r.shmg, r.web, r.vor, r.froz, r.sit].join(',');
      if (!prev || prev.sig !== sig) { out.push(r); prev = { sig }; }
    }
    return out;
  };

  const dashSeq = () => ([
    { keys: { r: true }, ticks: 1 }, { keys: {}, ticks: 4 }, { keys: { r: true }, ticks: 1 },
  ]);

  const res = {};
  const run = (name, rigOpts, steps) => {
    rig(rigOpts);
    const log = drive(steps);
    res[name] = { ...analyze(log), compact: compact(log) };
  };

  run('A_rope', { dash2: true, ropeColumns: [204, 214], ropeTile: 263 },
    [...dashSeq(), { keys: {}, ticks: 180 }]);

  // B 结网：repo 内 webbed buff 单 tick 即被清（探针实测）→ 逐 tick 续注模拟持续结网
  run('B_webbed', { dash2: true },
    [...dashSeq(),
      { keys: {}, ticks: 50, inject: (p) => { p.buffs.apply?.(98, 50 / 60); } },
      { keys: {}, ticks: 220 }]);

  // C 星旋：原版星锥敌持续在场=每帧续注 → 逐 tick 续注 120t
  run('C_vortex', { dash2: true },
    [...dashSeq(),
      { keys: {}, ticks: 120, inject: (p) => { p.buffs.apply?.(99, 120 / 60); } },
      { keys: {}, ticks: 260 }]);

  run('D_shimmer', { dash2: true, shimmerPool: true },
    [...dashSeq(), { keys: {}, ticks: 260 }]);

  run('F_sit', { dash2: true },
    [...dashSeq(),
      { keys: {}, ticks: 4, inject: (p) => { p.sitting = true; p.sitTicks = 0; } },
      { keys: {}, ticks: 30 },
      { keys: {}, ticks: 1, inject: (p) => { p.sitting = false; } },
      { keys: {}, ticks: 150 }]);

  run('G_frozen', { dash2: true },
    [...dashSeq(),
      { keys: {}, ticks: 60, inject: (p) => { p.buffs.apply?.(63, 60 / 60); } },
      { keys: {}, ticks: 200 }]);

  run('H_nodash', { dash2: false },
    [...dashSeq(), { keys: {}, ticks: 180 }]);

  run('C2_vortex_nodash', { dash2: false },
    [{ keys: { r: true }, ticks: 6 },
      { keys: {}, ticks: 120, inject: (p) => { p.buffs.apply?.(99, 120 / 60); } },
      { keys: {}, ticks: 200 }]);

  // C3 星旋+滑行中按住反向：修后应正常制动（vx 由正转负）
  run('C3_vortex_reverse', { dash2: true },
    [...dashSeq(),
      { keys: { l: true }, ticks: 120, inject: (p) => { p.buffs.apply?.(99, 120 / 60); } },
      { keys: {}, ticks: 120 }]);

  return res;
});

console.log('=== ANALYSIS ===');
const summary = {};
for (const [k, v] of Object.entries(OUT)) { const { compact, ...a } = v; summary[k] = a; }
console.log(JSON.stringify(summary, null, 1));
for (const [k, v] of Object.entries(OUT)) {
  console.log(`=== ${k} compact (${v.compact.length}) ===`);
  console.log(JSON.stringify(v.compact.slice(0, 60)));
}
console.log('=== pageerrors ===', JSON.stringify(errors.slice(0, 5)));
await browser.close();
process.exit(0);
