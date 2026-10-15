// ★BJ686 定谳探针：飞行态天顶剑拖尾「圆弧变波浪」——TrailingMode 4 补偿时序
// 双相取证：
//   Phase A（纯逻辑,确定性）：直驱 ZenithSword.fixedUpdate（玩家逐 tick 平移 +10px),
//     step 包装捕获每次压栈值 → 逐条目「帧误差」（entry − pushed − Σ后续Δ）。
//     旧代码预期：每 tick 两条新条目中 sub-A 条目 frameErr = −Δ（交替错位）；
//     修复后预期：全部 ≈ 0。附 d 序列（相邻条目 x 差）交替幅度 A2。
//   Phase B（真实链,视觉）：fireZenithSword → g.frame 驱动飞行/静止,各即时截屏存证。
// 用法:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj686-zenith-trail-probe.mjs
//   BJ686_EXPECT=buggy|fixed （缺省 report-only,不断言判别面）
//   BJ686_INTERP=1 → ?interp=1 复验 interp 相位退回面
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger, freezeClock } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const EXPECT = process.env.BJ686_EXPECT || 'report';   // report|buggy|fixed
const INTERP = process.env.BJ686_INTERP === '1';
const DX = 10;            // 每 tick 玩家水平位移（翼飞量级 px/t）
const TICKS = 36;         // 驱动 tick 数（counter 120 ≈ 39t 耗尽,36t 内全程活体）
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + (INTERP ? '/?interp=1&cloudcache=0' : '/'));
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界就绪', gen.ok, JSON.stringify(gen).slice(0, 120));
// ★钉昼间钟面（0.345=8:16 白昼;探针真实耗时跨分钟,不冻结会漂进夜/暮=截图全暗）
await freezeClock(page, { tod: 0.345 });
await pump(page, 40);

// ---------- Phase A：纯逻辑确定性驱动 ----------
const phaseA = await page.evaluate(async ({ dx, ticks }) => {
  const g = window.__swGame;
  g.running = false;                    // 停主循环,手动步进（确定性）
  const p = g.player;
  const { ZenithSword } = await import('/src/entities/SwingArc.ts');
  // 天空开阔位（出生点上 700px——本相不动玩家物理,纯锚位移,无碰撞干扰）
  p.x = p.x; p.y = p.y - 700; p.vx = 0; p.vy = 0;

  // step 包装：记录每次 step 调用（前后位置 + 压入值 + tick/subInTick）;draw 计数。
  // ★压栈映射按 step 调用序（每子步恰一次;窗口内无死亡,60 cap 只裁存储头不影响序）
  const proto = Object.getPrototypeOf(new ZenithSword(p, p.cx, p.cy, 1, 4956));
  if (!proto.__bj686Wrapped) {
    proto.__bj686Wrapped = true;
    const orig = proto.step;
    proto.step = function (gg, ...rest) {
      const preCX = this.cx, preCY = this.cy;
      const r = orig.call(this, gg, ...rest);
      (window.__bj686Pushes ??= []).push({
        tick: window.__bj686Tick, sub: window.__bj686Sub,
        preCX, preCY, postCX: this.cx, postCY: this.cy,
        pushedX: this.trail[this.trail.length - 3], pushedY: this.trail[this.trail.length - 2],
      });
      window.__bj686Sub++;
      return r;
    };
    const origDraw = proto.draw;
    proto.draw = function (...a) { window.__bj686Draws = (window.__bj686Draws ?? 0) + 1; return origDraw.apply(this, a); };
  }

  const run = (label, stepDx) => {
    window.__bj686Pushes = [];
    const z = new ZenithSword(p, p.cx + 300, p.cy - 100, 190, 4956);
    const deltas = [];           // deltas[t-1] = 第 t tick 玩家位移（实测）
    const dumps = [];            // dumps[t-1] = 第 t tick 末 trail 快照
    for (let t = 1; t <= ticks && !z.dead; t++) {
      window.__bj686Tick = t; window.__bj686Sub = 0;
      const x0 = p.x;
      p.x += stepDx;             // 玩家先行（Game.fixedUpdate 序:player→projectiles）
      z.fixedUpdate(1 / 60, g);
      deltas.push({ dx: p.x - x0, dy: 0 });
      dumps.push(z.trail.slice());
    }
    // ---- 逐条目帧误差 ----
    // 每 tick 恰 2 次 step=2 次压栈:dump N 的 fromEnd j ↔ 全局第 (2N-1-j) 次压栈
    const pushes = window.__bj686Pushes;
    const stepCallOK = pushes.length === 2 * dumps.length;   // 窗口内无死亡=恒真
    const table = [];
    for (let N = 1; N <= dumps.length; N++) {
      const tr = dumps[N - 1];
      const n = tr.length / 3;
      const pc = 2 * N;
      const rows = [];
      for (let j = 0; j < n && pc - 1 - j >= 0; j++) {
        const pu = pushes[pc - 1 - j];
        // 帧归属检测:压入值==本子步末态中心 → frame=tick（锚 Q_tick）;==子步前态
        // 中心 → 该值产生于上一子步末（subA → tick-1 帧 / subB → 同 tick subA,仍 Q_tick）
        // （★比中心值:this.x 顶左与压入的 cx 恒差 w/2,曾致 fixed 码误判帧归属）
        const isPost = Math.abs(pu.pushedX - pu.postCX) < 1e-9 && Math.abs(pu.pushedY - pu.postCY) < 1e-9;
        const frameTick = isPost ? pu.tick : (pu.sub === 0 ? pu.tick - 1 : pu.tick);
        let ex = pu.pushedX, ey = pu.pushedY;
        for (let m = frameTick + 1; m <= N; m++) { ex += deltas[m - 1].dx; ey += deltas[m - 1].dy; }
        rows.push({
          j, pushTick: pu.tick, sub: pu.sub, frameTick,
          errX: +(tr[tr.length - 3 - 3 * j] - ex).toFixed(6),
          errY: +(tr[tr.length - 2 - 3 * j] - ey).toFixed(6),
        });
      }
      table.push({ N, n, rows });
    }
    // ---- d 序列（相邻条目 x 差,newest→older）与交替幅度 A2 ----
    const last = dumps[dumps.length - 1];
    const n = last.length / 3;
    const d = [];
    for (let j = 0; j + 1 < Math.min(n, 40); j++) d.push(+(last[last.length - 3 - 3 * j] - last[last.length - 3 - 3 * (j + 1)]).toFixed(3));
    const ev = d.filter((_, i) => i % 2 === 0), od = d.filter((_, i) => i % 2 === 1);
    const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const A2 = +(mean(ev) - mean(od)).toFixed(3);
    return { label, ticksRun: dumps.length, stepCallOK, deltaFirst: deltas[0]?.dx ?? 0, table, dHead: d.slice(0, 16), A2, trailLen: n };
  };

  const flight = run('flight', dx);
  const still = run('still', 0);
  return { flight, still };
}, { dx: DX, ticks: TICKS });

// 判别面输出
const show = (r, tag) => {
  const lastTable = r.table[r.table.length - 1];
  const orbitTable = r.table[11];   // N=12:counter≈37=轨道旋转期（counter≥60 冻结为悬停期）
  console.log(`\n== PhaseA ${tag}: ticks=${r.ticksRun} stepCallOK=${r.stepCallOK} trailLen=${r.trailLen} A2(交替幅度)=${r.A2}`);
  console.log(`   d序列头16: ${JSON.stringify(r.dHead)}`);
  const agg = (tbl) => {
    if (!tbl) return null;
    const all = tbl.rows;
    const oddErrs = all.filter((q) => q.j % 2 === 1).map((q) => Math.hypot(q.errX, q.errY));
    const evenErrs = all.filter((q) => q.j % 2 === 0).map((q) => Math.hypot(q.errX, q.errY));
    const mx = (a) => a.length ? Math.max(...a) : 0;
    return { oddMax: mx(oddErrs), evenMax: mx(evenErrs), n: all.length };
  };
  for (const [name, tbl] of [['N=12(轨道期)', orbitTable], ['末拍(悬停期)', lastTable]]) {
    if (!tbl) continue;
    const head = tbl.rows.slice(0, 10).map((q) => `j${q.j}[t${q.pushTick}s${q.sub}f${q.frameTick}](${q.errX},${q.errY})`).join(' ');
    const a = agg(tbl);
    console.log(`   ${name} 逐条目帧误差: ${head}`);
    console.log(`     帧误差 max: odd(fromEnd)=${a.oddMax.toFixed(2)}  even=${a.evenMax.toFixed(2)}  条目数=${a.n}  (Δ=${DX})`);
  }
  const a = agg(lastTable);
  return a ? { oddMax: a.oddMax, evenMax: a.evenMax, orbit: agg(orbitTable) } : { oddMax: -1, evenMax: -1, orbit: null };
};
const fl = show(phaseA.flight, `flight(Δx=${DX})`);
const st = show(phaseA.still, 'still(Δ=0)');

if (EXPECT === 'buggy') {
  L.chk('飞行态交替错位复现(旧码预期): odd条目帧误差≈Δ、even≈0',
    fl.oddMax > DX * 0.9 && fl.evenMax < 0.5, `odd=${fl.oddMax} even=${fl.evenMax}`);
  L.chk('静止态零帧误差', st.oddMax < 0.5 && st.evenMax < 0.5, `odd=${st.oddMax} even=${st.evenMax}`);
  L.chk('d序列交替幅度 A2 ≈ 2Δ（波浪源）', Math.abs(phaseA.flight.A2 - 2 * DX) < DX * 0.6, `A2=${phaseA.flight.A2}`);
} else if (EXPECT === 'fixed') {
  L.chk('飞行态帧误差全零(修复后)', fl.oddMax < 0.5 && fl.evenMax < 0.5, `odd=${fl.oddMax} even=${fl.evenMax}`);
  L.chk('静止态零帧误差', st.oddMax < 0.5 && st.evenMax < 0.5, `odd=${st.oddMax} even=${st.evenMax}`);
  L.chk('d序列交替幅度 A2 ≈ 0（波浪消失）', Math.abs(phaseA.flight.A2) < 2.5, `A2=${phaseA.flight.A2}`);
}

// ---------- Phase B：真实链视觉（fireZenithSword → 渲染 → 定位裁剪截屏）----------
const driveB = (dx, tag) => page.evaluate(async (stepDx) => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.paused = false;
  const p = g.player;
  for (const e of g.entities.projectiles) e.dead = true;
  g.entities.projectiles.length = 0;
  // 天空走廊:飞行走廊(x 46..100 tile)各列地表行(自上而下首个 tile)取中位数,
  // 玩家悬其上 6 tile——仍在大气层(太空层背景近黑对比差)
  const st = g.world.store;
  const surf = [];
  for (let tx = 46; tx <= 100; tx++) {
    for (let ty = 8; ty < st.h; ty++) { if (st.hasTile(tx, ty)) { surf.push(ty); break; } }
  }
  surf.sort((a, b) => a - b);
  const topRow = surf.length ? surf[Math.floor(surf.length / 2)] : 400;
  p.x = 50 * 16; p.y = (topRow - 6) * 16; p.vx = 0; p.vy = 0;
  g.camera.x = p.cx; g.camera.y = p.cy;
  window.__bj686Draws = 0;
  let vnow = performance.now();
  const fireAt = [30, 36, 42, 47];   // 末帧前 22/16/10/5 tick 发剑:全程/悬停/轨道各态
  for (let f = 0; f < 52; f++) {
    p.x += stepDx; p.vx = 0; p.vy = 0;
    if (fireAt.includes(f)) {
      g.input.mouseX = 700; g.input.mouseY = 380;   // 屏中偏右=飞行前方
      g.fireZenithSword(0, { useTime: 10, fired: 0, vid: 4956, dmg: 190, pen: 2 });
    }
    vnow += 1000 / 60;
    g.frame(vnow);
    await wait(1);
  }
  await wait(150);
  // 定位:取最新活剑屏幕位（trail 最长者）
  const zs = g.entities.projectiles.filter((e) => !e.dead && e.constructor.name === 'ZenithSword');
  const target = zs.slice().sort((a, b) => b.trail.length - a.trail.length)[0] ?? null;
  const cam = g.camera;
  const scr = target ? cam.worldToScreen(target.cx, target.cy) : cam.worldToScreen(p.cx, p.cy);
  // 画布自证:present 画布剑区亮像素计数（判「渲染有/截屏无」二义）
  let presentZone = null;
  {
    const cvs = [...document.querySelectorAll('#game-root canvas')].filter((c) => c.width === 1280);
    const pc2 = cvs[cvs.length - 1];
    const c2 = pc2?.getContext('2d');
    if (c2 && target) {
      const x0 = Math.max(0, Math.round(scr[0]) - 120), y0 = Math.max(0, Math.round(scr[1]) - 120);
      try {
        const img = c2.getImageData(x0, y0, 240, 240);
        const d = img.data;
        let cnt = 0, mx = 0;
        for (let i = 0; i < d.length; i += 4) {
          const v = Math.max(d[i], d[i + 1], d[i + 2]);
          if (v > mx) mx = v;
          if (v > 200) cnt++;
        }
        presentZone = { mx, cnt };
      } catch { presentZone = { err: 'getImageData' }; }
    }
  }
  return {
    draws: window.__bj686Draws, playerX: +p.x.toFixed(1), skyRow: topRow,
    sword: target ? { cx: +target.cx.toFixed(0), cy: +target.cy.toFixed(0), scrX: +scr[0].toFixed(0), scrY: +scr[1].toFixed(0), trailLen: target.trail.length / 3 } : null,
    aliveCount: zs.length, presentZone, tod: g.world.clock?.timeOfDay ?? null,
  };
}, dx).then(async (info) => {
  // ★canvas dataURL 通道取图（page.screenshot 走合成层,headless 多画布叠层下
  //   与 renderer.canvas 内容不一致——以渲染器真值画布为准）
  const cap = await page.evaluate((c) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    if (!cv) return null;
    const cc = document.createElement('canvas');
    cc.width = 480; cc.height = 380;
    const cx = cc.getContext('2d');
    const x = Math.max(0, Math.min(cv.width - 480, c.scrX - 240));
    const y = Math.max(0, Math.min(cv.height - 380, c.scrY - 190));
    cx.drawImage(cv, x, y, 480, 380, 0, 0, 480, 380);
    const full = document.createElement('canvas');
    full.width = cv.width; full.height = cv.height;
    full.getContext('2d').drawImage(cv, 0, 0);
    return {
      crop: cc.toDataURL('image/png'),
      full: full.toDataURL('image/png'),
      cvW: cv.width, cvH: cv.height, cropAt: [x, y],
    };
  }, info.sword ?? { scrX: 640, scrY: 400 });
  if (cap) {
    const fs = await import('node:fs');
    fs.writeFileSync(`/tmp/bj686-${tag}.png`, Buffer.from(cap.crop.split(',')[1], 'base64'));
    fs.writeFileSync(`/tmp/bj686-${tag}-full.png`, Buffer.from(cap.full.split(',')[1], 'base64'));
    info.cropAt = cap.cropAt;
  }
  return info;
});

const flightInfo = await driveB(DX, 'flight');
const stillInfo = await driveB(0, 'still');
console.log('\nPhaseB(视觉):', JSON.stringify({ flight: flightInfo, still: stillInfo, interp: INTERP }),
  '\n  截屏: /tmp/bj686-flight.png (裁剪) /tmp/bj686-flight-full.png /tmp/bj686-still.png /tmp/bj686-still-full.png');
L.chk('PhaseB draw 链活跃（zsDraw>0）', (flightInfo.draws ?? 0) > 0, JSON.stringify(flightInfo));

await browser.close();
L.print();
process.exit(L.exitCode());
