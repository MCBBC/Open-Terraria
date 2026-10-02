// Z3 清偿刀实机探针：矿脉门（NPC.cs:49258-49278 ±3×±3 同类计数<40 → 剔除）
// + 优先级表 236/702=810（Main.cs:6570-6571）。
// 三幕（每幕直调 fairyTreasureCoords 硬断言 + 仙灵行为采样 + 截图留档）：
//   A 单块金矿 → 不引路（直调 null,永不及 ai2=3/4）
//   B 7×7 金矿脉 → 引路（2→3→4,ai0/ai1=矿脉候选格）
//   C 矿脉+生命果并存 → 生命果胜（810>260,ai0/ai1=果格）
// 运行:SW_ORIGIN=http://localhost:5841 node tools/run-diag.mjs --timeout=300000 scripts/_z3-fairy-vein-lure-probe.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const EV = new URL('../docs/evidence/bj434/', import.meta.url).pathname;
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));

const res = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const { Enemy, fairyTreasureCoords } = await import('/src/entities/Enemy.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const GOLD = TILE_BY_KEY['ore_gold'], FRUIT = TILE_BY_KEY['v_236_life_fruit_plant'];
  const out = { scenes: {} };

  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;   // 夜（仙灵活性窗）
  for (const e of g.entities.enemies) if (e.vanillaId >= 583 && e.vanillaId <= 585) e.dead = true;

  // ---- 选净化锚点：地表某列,直调搜索窗天然零候选（防 worldgen 天然宝箱/水晶/矿脉干扰）----
  const surfaceY = (tx) => { let gy = 0; while (gy < st.h - 2 && !st.isSolid(tx, gy)) gy++; return gy; };
  let anchorTx = -1, anchorGy = -1;
  for (let tx = 120; tx < st.w - 90 && anchorTx < 0; tx += 4) {
    const gy = surfaceY(tx);
    if (gy < 8 || gy > st.h - 120) continue;
    const pl = g.player;
    pl.x = tx * TILE + 8 - pl.w / 2; pl.y = gy * TILE - pl.h;
    pl.vx = 0; pl.vy = 0;
    if (fairyTreasureCoords(st, pl.cx, pl.cy) === null) { anchorTx = tx; anchorGy = gy; }
  }
  if (anchorTx < 0) { out.error = 'no clean anchor'; return out; }
  const pl = g.player;
  pl.x = anchorTx * TILE + 8 - pl.w / 2; pl.y = anchorGy * TILE - pl.h; pl.vx = 0; pl.vy = 0;
  const cx = pl.cx, cy = pl.cy, px = Math.floor(cx / TILE), py = Math.floor(cy / TILE);
  window.__z3shot = { cx, cy, px, py };
  out.anchor = { tx: anchorTx, gy: anchorGy, cx, cy };

  // ★不 clearWindow（曾把玩家脚下地面一并清空 → 玩家坠落 → 态 2 永不接触锚盒）：
  //   锚点天然零候选 + 布景单调累加（A 单矿 ∈ B 矿脉足迹,C 果+脉并存）即零污染

  // ---- 植仙灵采样：记录 (ai2, ai0, ai1) 变化沿 + 终态 ----
  const sampleFairy = async (frames) => {
    const f = Enemy.fromVanilla(583, cx - 8, cy - 8);
    if (!f) return { error: 'spawn failed' };
    f.ai2 = 2; f.ai3 = 0;
    g.entities.enemies.push(f);
    const rows = [];
    let key = '';
    await new Promise((resolve) => {
      let n = 0;
      const step = () => {
        const cur = g.entities.enemies.find(e => e.vanillaId >= 583 && e.vanillaId <= 585 && !e.dead);
        const s = cur ? { ai2: cur.ai2, ai0: cur.ai0, ai1: cur.ai1 } : { ai2: -1, ai0: -1, ai1: -1 };
        const k = JSON.stringify(s);
        if (k !== key) { key = k; rows.push({ frame: n, ...s }); }
        if (++n >= frames) resolve(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    f.dead = true;
    return { transitions: rows, final: rows[rows.length - 1] };
  };
  const reached = (bh) => !!bh.transitions?.some(t => t.ai2 === 3 || t.ai2 === 4);

  // ---- 幕 A：单块金矿 → 不引路 ----
  const atx = px + 6, aty = py;
  st.setTileSilent(atx, aty, GOLD, 0, 0);
  const directA = fairyTreasureCoords(st, cx, cy);
  const behaviorA = await sampleFairy(480);
  out.scenes.A = { singleOreAt: [atx, aty], direct: directA, reachedLure: reached(behaviorA), ...behaviorA };

  // ---- 幕 B：7×7 金矿脉（右 6..12 格）→ 引路 ----
  const v0x = px + 3, v0y = py - 3;
  for (let i = v0x; i < v0x + 7; i++) for (let j = v0y; j < v0y + 7; j++) st.setTileSilent(i, j, GOLD, 0, 0);
  const directB = fairyTreasureCoords(st, cx, cy);
  const behaviorB = await sampleFairy(480);
  out.scenes.B = { vein: [v0x, v0y, v0x + 6, v0y + 6], direct: directB, reachedLure: reached(behaviorB), ...behaviorB };
  window.__z3shot.v0x = v0x; window.__z3shot.v0y = v0y;

  // ---- 幕 C：矿脉（右）+ 生命果（左 10 格）并存 → 生命果胜 ----
  for (let i = v0x; i < v0x + 7; i++) for (let j = v0y; j < v0y + 7; j++) st.setTileSilent(i, j, GOLD, 0, 0);
  const ftx = px - 10, fty = py;
  st.setTileSilent(ftx, fty, FRUIT, 0, 0);
  const directC = fairyTreasureCoords(st, cx, cy);
  const behaviorC = await sampleFairy(480);
  out.scenes.C = { fruitAt: [ftx, fty], direct: directC, reachedLure: reached(behaviorC), ...behaviorC };
  window.__z3shot.ftx = ftx; window.__z3shot.fty = fty;
  return out;
});

// ---- 判读 ----
const latchedAt = (sc, tx, ty) => !!sc?.transitions?.some(t => (t.ai2 === 3 || t.ai2 === 4) && t.ai0 === tx && t.ai1 === ty);
const ok = [];
ok.push(['A 直调 null（单块矿剔除）', res.scenes.A?.direct === null]);
ok.push(['A 行为不引路', res.scenes.A?.reachedLure === false]);
ok.push(['B 直调命中矿脉', Array.isArray(res.scenes.B?.direct)]);
ok.push(['B 行为引路（达态 3/4）', res.scenes.B?.reachedLure === true]);
ok.push(['B 锁定格=直调格', res.scenes.B && latchedAt(res.scenes.B, res.scenes.B.direct?.[0], res.scenes.B.direct?.[1])]);
ok.push(['C 直调=生命果格（810 胜 260）', res.scenes.C?.direct &&
  res.scenes.C.direct[0] === res.scenes.C.fruitAt[0] && res.scenes.C.direct[1] === res.scenes.C.fruitAt[1]]);
ok.push(['C 行为引路至生命果', res.scenes.C?.reachedLure === true &&
  latchedAt(res.scenes.C, res.scenes.C.fruitAt[0], res.scenes.C.fruitAt[1])]);
for (const [n, v] of ok) console.log(`${v ? 'PASS' : 'FAIL'}  ${n}`);
console.log(JSON.stringify(res, null, 1));

// ---- 截图留档（重摆布景 + 状态 4 带路仙灵定妆）----
// 先 ack 欢迎覆层（曾挡镜头=截图全被「欢迎来到 SandboxWorld」弹窗覆盖）
try {
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /我已知晓/.test(b.textContent ?? ''));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
} catch { /* 覆层不存在则直过 */ }
if (window_check(res)) {
  await p.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    const a = window.__z3shot;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const GOLD = TILE_BY_KEY['ore_gold'], FRUIT = TILE_BY_KEY['v_236_life_fruit_plant'];
    for (const e of g.entities.enemies) if (e.vanillaId >= 583 && e.vanillaId <= 585) e.dead = true;
    for (let i = a.v0x; i < a.v0x + 7; i++) for (let j = a.v0y; j < a.v0y + 7; j++) st.setTileSilent(i, j, GOLD, 0, 0);
    const f1 = Enemy.fromVanilla(583, a.cx - 8, a.cy - 8);
    f1.ai2 = 4; f1.ai0 = a.v0x + 5; f1.ai1 = a.v0y + 3; f1.ai3 = 40;
    g.entities.enemies.push(f1);
  });
  await new Promise(r => setTimeout(r, 2500));   // 飞抵矿脉入态 5 圆舞（ai3 40+150<200 不终演）
  await p.screenshot({ path: EV + 'z3-sceneB-vein-lure.png' });
  await p.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    const a = window.__z3shot;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const FRUIT = TILE_BY_KEY['v_236_life_fruit_plant'];
    st.setTileSilent(a.ftx, a.fty, FRUIT, 0, 0);
    const f2 = Enemy.fromVanilla(583, a.cx - 8, a.cy - 8);
    f2.ai2 = 4; f2.ai0 = a.ftx; f2.ai1 = a.fty; f2.ai3 = 40;
    g.entities.enemies.push(f2);
  });
  await new Promise(r => setTimeout(r, 2500));   // 飞抵生命果入态 5 圆舞
  await p.screenshot({ path: EV + 'z3-sceneC-lifefruit-lure.png' });
}
function window_check() { return true; }   // 截图无条件尝试（__z3shot 缺失时 evaluate 自抛,由上方日志兜底）

await b.close();
console.log('PROBE-DONE');
