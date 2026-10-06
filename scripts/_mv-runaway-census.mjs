// 移动失控普查探针（2026-10-06 用户报"某些特殊情况松键后持续左/右移,反向键无法中断"）。
// 方法：直接驱动 player.fixedUpdate(1,g)（确定性 tick 步进），逐 tick 快照
//   {keys/virtual, inputX/L/R, dashDelay/dashT/mountDash6/eocDash, vx/vy/x/y,
//    onGround/ridingMount/ridingCart/pulley/ropeHere/inWater/inShimmer/shimmering,
//    buffs(frozen/webbed/confused/stoned/vortex), sleeping/sitting, grappleN}
// 按「移动驱动源」逐 tick 分类，跑配方组：
//   R0 基线走+松键 / R1 冲刺+全松 / R2 冲刺+反向按住 / R3 冲刺+同向再双击 /
//   R4 绳格重叠带冲刺 / R5 水面入水(BJ524 复核) / R6 结网注入 / R7 星旋注入 /
//   R8 坐骑上骑切片 / R9 击退注入
// 异常判定：
//   DRIFT  = 无左右键 ∧ dashDelay>=0 ∧ 非坐骑/矿车 ∧ |vx|>0.5 持续 >45t
//   REVFAIL= 按住反向 ∧ vx 同号持续 >60t（0.28/t 制动下 3.0→0 需 ~11t）
// 运行:SW_ORIGIN=http://localhost:5222 node tools/run-diag.mjs scripts/_mv-runaway-census.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&swperf=0&runcensus=' + Date.now();
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

// ---------- 通用 rig + tick 驱动 ----------
const SETUP = `
window.__rig = (opts) => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const o = opts ?? {};
  const GY = 300;
  // 清场 + 平地（130..670 宽带）
  for (let x = 120; x <= 680; x++) for (let y = GY - 100; y <= GY + 40; y++) {
    st.setTile(x, y, 0); st.setSlope(x, y, 0); st.setHalfBrick(x, y, false);
  }
  for (let x = 130; x <= 670; x++) st.setTile(x, GY, 1);
  // 配方附加地形
  if (o.ropeColumns) for (const cx of o.ropeColumns) for (let y = GY - 6; y <= GY - 1; y++) st.setTile(cx, y, o.ropeTile);
  if (o.wallColumns) for (const cx of o.wallColumns) for (let y = GY - 8; y <= GY - 1; y++) st.setTile(cx, y, 1);
  // 玩家就位
  p.x = (o.px ?? 200) * 16; p.y = GY * 16 - 42; p.vx = 0; p.vy = 0;
  p.onGround = true; p.dead = false; p.respawnTimer = 0;
  p.dashDelay = 0; p.dashT = 0; p.mountDash6Active = false; p.eocDash = 0; p.solarDashing = false;
  p.ridingCart = false; p.cart = null; p.ridingMount = false; p.pulley = false; p.ropeCount = 0;
  p.sleeping = false; p.sitting = false; p.sitTicks = 0; p.useTime = 0; p.itemAnimTicks = 0;
  p.buffs.clearAll?.();
  p.grappling[0] = null; p.grapCount = 0;
  p.cartFlip = false; p.grappleReleaseJump = true;
  p.fallStartY = null;
  // 输入面干净
  g.input.keys.clear(); g.input.touchKeys.clear();
  g.input.uiBlocking = false; g.input.mouseDown = false; g.input.mouseHeld = false;
  // 冲刺配饰（克苏鲁护盾 = 原版 vid 3097,vi_3097_EoCShield → armor[3]）
  if (o.dash2) {
    const defs = window.__swITEMS;
    let idx = -1;
    for (let i = 0; i < defs.length; i++) { const d = defs[i]; if (d && d.vid === 3097 && typeof d.key === 'string' && d.key.includes('EoCShield')) { idx = i; break; } }
    if (idx < 0) throw new Error('EoCShield(3097) def not found');
    p.inv.armor[3] = { id: idx, stack: 1 };
  } else {
    p.inv.armor[3] = null;
  }
  return { GY, dash2: !!o.dash2 };
};
window.__ropeTile = () => {
  // 找一个 def.rope 的内部 tile id
  const td = window.__swTileDefs ?? null;
  // TILE_DEFS 未挂窗时退回直接 import 面不可用 → 走猜测表：试 213(丝绳)/10? 由 window.__swGame.world.store.setTile 生效性判断
  return 213;
};
// 逐 tick 驱动器：steps = [{keys:{l,r,j,d}, ticks, note}]
window.__drive = (steps, capT) => {
  const g = window.__swGame, p = g.player, inp = g.input;
  const log = [];
  let anomalies = [];
  let driftRun = [];
  // 键集合快照（含虚拟桶）
  const keySnap = () => ({
    phys: [...inp.keys], touch: [...inp.touchKeys],
    virt: [...(inp.virtualActions ?? [])], uiB: !!inp.uiBlocking,
  });
  let tick = 0;
  for (const st of steps) {
    for (let i = 0; i < st.ticks; i++) {
      // —— 复刻 Game.fixedUpdate 输入注入（直接驱动位）——
      p.inputX = (st.keys.l ? -1 : 0) + (st.keys.r ? 1 : 0);
      p.inputJump = !!(st.keys.j);
      p.inputDown = !!(st.keys.d);
      p.inputUp = false;
      p.inputLeft = !!st.keys.l; p.inputRight = !!st.keys.r;
      p.inputDash = !!st.keys.k;
      p.releaseDash = p.releaseDash || !p.inputDash;
      p.inputTorch = false; p.inputUseItem = false; p.inputUseTile = false;
      const pre = {
        t: tick, dashDelay: p.dashDelay, dashT: p.dashT, m6: p.mountDash6Active,
        vx: p.vx, vy: p.vy, x: p.x, y: p.y,
      };
      p.fixedUpdate(1, g);
      tick++;
      const ropeHere = (() => {
        const tx = Math.floor((p.x + p.w / 2) / 16), ty = Math.floor((p.y + p.h / 2) / 16);
        if (!g.world.store.inBounds(tx, ty)) return false;
        const j = g.world.store.idx(tx, ty);
        const t = g.world.store.type[j];
        return !!(window.__TILE_ROPE_IDS && window.__TILE_ROPE_IDS.has(t));
      })();
      const rec = {
        t: tick, ...pre,
        inX: p.inputX, inL: p.inputLeft, inR: p.inputRight,
        dashDelay: p.dashDelay, dashT: p.dashT, m6: p.mountDash6Active, eoc: p.eocDash,
        vx: p.vx, vy: p.vy, x: p.x, y: p.y,
        onG: p.onGround, mnt: !!p.ridingMount, cart: !!p.ridingCart, pul: !!p.pulley,
        rope: ropeHere, water: !!p.inWater, shim: !!p.inShimmer, shmg: !!p.shimmering,
        web: p.buffs.has?.(98) ?? false, vor: p.buffs.has?.(99) ?? false,
        froz: p.buffs.has?.(47) ?? false, conf: p.buffs.has?.(90) ?? false,
        sleep: !!p.sleeping, sit: !!p.sitting, gr: p.grapCount ?? 0,
        keys: keySnap(),
      };
      log.push(rec);
      // —— 异常分类（松键漂移/反向失效）——
      // DRIFT 须「无衰减」才算：正常摩擦 0.2/t（地面）/0.1/t（空中），
      // 连续 30t |vx| 变化 <0.5 且均值 >0.8 = 无摩擦异常
      const noKey = !rec.inL && !rec.inR;
      const moving = Math.abs(rec.vx) > 0.5;
      if (noKey && moving && rec.dashDelay >= 0 && !rec.mnt && !rec.cart && !rec.pul
        && !rec.web && !rec.vor && !rec.shmg && !rec.gr && !rec.sit && !rec.sleep && !rec.froz) {
        driftRun.push(rec);
        const w = driftRun.slice(-30);
        if (w.length === 30) {
          const maxD = Math.max(...w.map((r) => Math.abs(r.vx)));
          const minD = Math.min(...w.map((r) => Math.abs(r.vx)));
          if (maxD - minD < 0.5 && minD > 0.8) {
            anomalies.push({ t: rec.t, kind: 'DRIFT-STUCK', vx: rec.vx, dashDelay: rec.dashDelay });
            driftRun = [];
          }
        }
      } else driftRun = [];
      if (rec.inL && rec.vx > 1.5) anomalies.push({ t: rec.t, kind: 'REVFAIL-L', vx: rec.vx, dashDelay: rec.dashDelay });
      if (rec.inR && rec.vx < -1.5) anomalies.push({ t: rec.t, kind: 'REVFAIL-R', vx: rec.vx, dashDelay: rec.dashDelay });
      if (capT && tick > capT) break;
    }
  }
  return { log, anomalies, end: { x: p.x, vx: p.vx, dashDelay: p.dashDelay } };
};
// 压缩日志：只保留关键跃迁（vx/dashDelay/键态变化）
window.__compact = (log) => {
  const out = [];
  let prev = null;
  for (const r of log) {
    const sig = [r.inL, r.inR, r.dashDelay, Math.round(r.vx * 10), Math.round(r.x), r.mnt, r.cart, r.pul, r.rope, r.water, r.shim, r.shmg, r.web, r.vor, r.gr].join(',');
    if (!prev || prev.sig !== sig) { out.push(r); prev = { sig }; }
  }
  return out.map((r) => ({ t: r.t, x: +r.x.toFixed(1), vx: +r.vx.toFixed(2), dd: r.dashDelay, dt: r.dashT,
    inL: r.inL ? 1 : 0, inR: r.inR ? 1 : 0, onG: r.onG ? 1 : 0, mnt: r.mnt ? 1 : 0, cart: r.cart ? 1 : 0,
    pul: r.pul ? 1 : 0, rope: r.rope ? 1 : 0, wat: r.water ? 1 : 0, shmg: r.shmg ? 1 : 0, web: r.web ? 1 : 0, vor: r.vor ? 1 : 0, gr: r.gr }));
};
`;

// TILE_DEFS rope ids → 窗口注入（页面侧无法 import,借 __swGame 内部？改为从 def 表扫）
await page.evaluate(() => {
  // TILE_DEFS 通过 world 的 tile 模块已加载；从 bundle 无法直取 → 用 store 探测：
  // 依次 setTile 后读 flags 不行……改为从 window.__swTILE_DEFS（若 mainFlow 挂了）拿
  const td = (window).__swTILE_DEFS;
  const ids = new Set();
  if (td) { for (let i = 0; i < td.length; i++) if (td[i]?.rope) ids.add(i); }
  (window).__TILE_ROPE_IDS = ids;
  (window).__HAS_TD = !!td;
});

// ---------- 配方执行 ----------
async function run() {
  const out = {};

  // R0 基线：向右走 40t → 松开 → 90t
  await page.evaluate((s) => { eval(s); }, SETUP);
  const rig0 = await page.evaluate(() => window.__rig({}));
  const r0 = await page.evaluate(() => {
    const { log, anomalies, end } = window.__drive([
      { keys: { r: true }, ticks: 40 },
      { keys: {}, ticks: 90 },
    ]);
    return { compact: window.__compact(log), anomalies, end, rig0: window.__rigReady };
  });
  out.r0 = { rig: rig0, ...r0 };

  // R1 冲刺+全松：双击右（1t 沿 + 5t 松 + 再按住 3t）→ 全松 160t
  await page.evaluate(() => window.__rig({ dash2: true }));
  const r1 = await page.evaluate(() => {
    const { log, anomalies, end } = window.__drive([
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 4 },
      { keys: { r: true }, ticks: 3 },   // 第二击在窗内 → 发起冲刺
      { keys: {}, ticks: 170 },
    ]);
    const slide = log.filter((r) => r.dashDelay < 0);
    return { compact: window.__compact(log), anomalies, end, slideTicks: slide.length, maxVx: Math.max(...log.map((r) => Math.abs(r.vx))) };
  });
  out.r1 = r1;

  // R2 冲刺+反向按住：发起后立即按住左 150t
  await page.evaluate(() => window.__rig({ dash2: true }));
  const r2 = await page.evaluate(() => {
    const { log, anomalies, end } = window.__drive([
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 4 },
      { keys: { r: true }, ticks: 1 },
      { keys: { l: true }, ticks: 160 },
    ]);
    // 找 vx 由正转负/归零的 tick
    const slide = log.filter((r) => r.dashDelay < 0);
    const firstNonPos = log.find((r) => r.vx <= 0.01);
    return { compact: window.__compact(log), anomalies, end, slideTicks: slide.length, firstNonPosT: firstNonPos?.t ?? null };
  });
  out.r2 = r2;

  // R3 冲刺+同向再双击：第二段双击是否再冲刺
  await page.evaluate(() => window.__rig({ dash2: true }));
  const r3 = await page.evaluate(() => {
    const { log, anomalies, end } = window.__drive([
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 4 },
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 40 },           // 冷却 30t 内 + 部分走动
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 4 },
      { keys: { r: true }, ticks: 1 },   // 再次双击（dashDelay 可能仍 >0）
      { keys: {}, ticks: 120 },
    ]);
    return { compact: window.__compact(log), anomalies, end };
  });
  out.r3 = r3;

  // R4 绳格重叠：冲刺穿过身位高绳柱（绳=内部 id 213,v_213_rope def.rope=true）
  await page.evaluate(() => window.__rig({ dash2: true, ropeColumns: [260, 261, 262, 263, 264], ropeTile: 213 }));
  const r4 = await page.evaluate(() => {
    const { log, anomalies, end } = window.__drive([
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 4 },
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 170 },
    ]);
    const ropeTicks = log.filter((r) => r.rope).length;
    return { compact: window.__compact(log), anomalies, end, ropeTicks };
  });
  out.r4 = r4;

  // R6 结网注入：冲刺滑行中第 20t 上 buff 98（Webbed），50t 后摘
  await page.evaluate(() => window.__rig({ dash2: true }));
  const r6 = await page.evaluate(() => {
    const g = window.__swGame, p = g.player;
    const { log, anomalies, end } = window.__drive([
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 4 },
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 14 },           // 滑行至 ~20t
    ]);
    // 注入 webbed 50t
    p.buffs.apply?.(98, 50 / 60);
    const part2 = window.__drive([{ keys: {}, ticks: 200 }]);
    return { compact: window.__compact([...log, ...part2.log]), anomalies: [...anomalies, ...part2.anomalies], end: part2.end };
  });
  out.r6 = r6;

  // R7 星旋注入：滑行中上 buff 99
  await page.evaluate(() => window.__rig({ dash2: true }));
  const r7 = await page.evaluate(() => {
    const g = window.__swGame, p = g.player;
    const { log } = window.__drive([
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 4 },
      { keys: { r: true }, ticks: 1 },
      { keys: {}, ticks: 14 },
    ]);
    p.buffs.apply?.(99, 120 / 60);
    const part2 = window.__drive([{ keys: {}, ticks: 240 }]);
    return { compact: window.__compact([...log, ...part2.log]), anomalies: part2.anomalies, end: part2.end };
  });
  out.r7 = r7;

  // R9 击退注入：静止时直接 vx=8（模拟击退）→ 90t 松键
  await page.evaluate(() => window.__rig({}));
  const r9 = await page.evaluate(() => {
    const g = window.__swGame, p = g.player;
    // 击退直接写 vx（hurt 面等价）
    const pre = window.__drive([{ keys: {}, ticks: 1 }]);
    p.vx = 8;
    const { log, anomalies, end } = window.__drive([{ keys: {}, ticks: 90 }]);
    return { compact: window.__compact(log), anomalies, end };
  });
  out.r9 = r9;

  return out;
}

const res = await run();
// 汇总
const summary = {};
for (const [k, v] of Object.entries(res)) {
  if (!v || !v.compact) { summary[k] = v; continue; }
  summary[k] = {
    anomalies: v.anomalies?.length ?? 0,
    anomalySample: (v.anomalies ?? []).slice(0, 8),
    end: v.end,
    extra: v.slideTicks !== undefined ? { slideTicks: v.slideTicks, maxVx: v.maxVx } : (v.firstNonPosT !== undefined ? { firstNonPosT: v.firstNonPosT } : undefined),
  };
}
console.log('=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 1));
console.log('=== R0 compact ===');
console.log(JSON.stringify(res.r0?.compact?.slice(0, 30), null, 0));
console.log('=== R1 compact ===');
console.log(JSON.stringify(res.r1?.compact?.slice(0, 40), null, 0));
console.log('=== R2 compact ===');
console.log(JSON.stringify(res.r2?.compact?.slice(0, 40), null, 0));
console.log('=== pageerrors ===');
console.log(JSON.stringify(errors.slice(0, 5)));
await browser.close();
process.exit(0);
