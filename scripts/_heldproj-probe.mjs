// 一次性探针:heldProj 持物指向(渲染层,src/render/heldProj.ts)
// 场景 = 食人鱼枪 1156→190(唯一"原版画持物"的 AI_Adjust 消费族,见模块头注)。
// 断言:
//  ① 按住期间 drawUseItem 收到的持物 aim = 玩家→食人鱼指向角(容差 0.01rad)
//  ② 真实 swing 过期(g.swing=null)后仍被调用 = SetDummyItemTime 渲染侧合成 swing
//  ③ 食人鱼位置变化 → aim 跟随(非恒定)
//  ④ 松手且食人鱼全灭后不再合成(swing=null 时 drawUseItem 停止收到该物品)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&heldproj=' + Date.now(),
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const A = [];
const ok = (n, c, x) => { A.push({ name: n, pass: !!c, ...x }); };

// 装备 + 记录器 + tick 驱动
const gunId = await page.evaluate(() => {
  const g = window.__swGame;
  const id = window.__swItems['vi_1156_piranha_gun'];
  if (id === undefined) return -1;
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb.onInventoryChanged?.();
  const r = g.renderer;
  window.__heldSwings = [];
  const orig = r.drawUseItem.bind(r);
  r.drawUseItem = function (ctx, p, swing, flicker) {
    // 同拍快照全部活体食人鱼:消除"读样本后实体又走了一 tick"的时序差;
    // 多弹时记全量(账本取 y 序最后一条,原版 heldProj 多弹共存也是任取其一)
    const live = window.__swGame.entities.projectiles.filter((e) => e.projId === 190 && !e.dead);
    window.__heldSwings.push({
      item: swing?.item ?? -1, useStyle: swing?.useStyle ?? null,
      aim: typeof swing?.aim === 'number' ? swing.aim : null, t: swing?.t ?? null, dur: swing?.dur ?? null,
      pcx: p?.cx, pcy: p?.cy,
      projs: live.map((e) => [e.x + e.w / 2, e.y + e.h / 2]),
      live: live.length,
    });
    return orig(ctx, p, swing, flicker);
  };
  return id;
});
ok('equip-piranha-gun', gunId > 0, { gunId });
if (gunId < 0) { console.log(JSON.stringify(A)); await browser.close(); process.exit(1); }

const waitFrames = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (ticks, mouse = null) => page.evaluate((t, m) => {
  const g = window.__swGame;
  for (let i = 0; i < t; i++) {
    if (m) { g.input.mouseX = m.x; g.input.mouseY = m.y; }
    g.fixedUpdate(1 / 60);
  }
}, ticks, mouse);
const piranha = () => page.evaluate(() => {
  const g = window.__swGame;
  const live = g.entities.projectiles.filter((e) => e.projId === 190 && !e.dead);
  const p = g.player;
  return {
    n: live.length,
    cx: live.length ? live[live.length - 1].x + live[live.length - 1].w / 2 : null,
    cy: live.length ? live[live.length - 1].y + live[live.length - 1].h / 2 : null,
    pcx: p.cx, pcy: p.cy,
  };
});
const clearSwings = () => page.evaluate(() => { window.__heldSwings = []; });
const swingsFor = (itemId) => page.evaluate((id) => window.__heldSwings.filter((s) => s.item === id), itemId);

/** aim 与同拍快照中【任一】活体食人鱼的指向角差(容差内) */
function aimErr(s) {
  if (!s || s.aim === null || !s.projs || s.projs.length === 0) return null;
  let best = Infinity;
  for (const [cx, cy] of s.projs) {
    const exp = Math.atan2(cy - s.pcy, cx - s.pcx);
    const d = Math.abs(((s.aim - exp + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < best) best = d;
  }
  return best;
}

// ---- ① 按住:食人鱼出生,持物 aim 指向它 ----
// ★channel 吃 mouseHeld 电平(非 mouseDown 边沿,memory: input.mouseDown 边沿vs电平);
//  且非 autoReuse 武器需 _prevMouseDown 归 false 才有点击沿 → 先空 tick 再按下
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseDown = false;
  g.input.mouseHeld = false;
  g.fixedUpdate(1 / 60);
  g.input.mouseX = g.player.cx + 260; g.input.mouseY = g.player.cy - 60;
  g.input.mouseDown = true;
  g.input.mouseHeld = true;
  g.swing = null; g.player.useTime = 0;
});
await step(12);
await waitFrames(250);
const st1 = await piranha();
const s1 = await swingsFor(gunId);
const a1 = s1.length ? s1[s1.length - 1] : null;
ok('piranha-spawned', st1.n > 0, { live: st1.n });
ok('held-item-drawn-while-channel', s1.length > 0, { samples: s1.length });
ok('aim-points-at-piranha', aimErr(a1) !== null && aimErr(a1) < 0.01,
  { aim: a1?.aim, err: aimErr(a1), live: a1?.live });

// ---- ② 真实 swing 过期 → 合成(渲染侧 SetDummyItemTime) ----
await page.evaluate(() => { window.__swGame.swing = null; });
await step(1);
await clearSwings();
await waitFrames(250);
const s2 = await swingsFor(gunId);
const a2 = s2.length ? s2[s2.length - 1] : null;
ok('synth-swing-after-expiry',
  s2.length > 0 && a2.useStyle === 5 && a2.aim !== null && a2.t === 1 && a2.dur === 1,
  { samples: s2.slice(0, 2) });
ok('synth-aim-points-at-piranha', aimErr(a2) !== null && aimErr(a2) < 0.01,
  { aim: a2?.aim, err: aimErr(a2) });

// ---- ③ 60t 后仍在跟随(同拍快照,逐样本匹配) ----
await step(60);
await waitFrames(250);
const s3 = await swingsFor(gunId);
const a3 = s3.length ? s3[s3.length - 1] : null;
ok('aim-follows-moving-piranha', aimErr(a3) !== null && aimErr(a3) < 0.01,
  { aim: a3?.aim, err: aimErr(a3), live: a3?.live });

// ---- ④ 松手 + 食人鱼全灭 → 不再合成 ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseDown = false;
  g.input.mouseHeld = false;   // channel 电平归零 → 食人鱼转返回段(:26093-26096)
  g.swing = null; g.player.useTime = 0;
});
await step(240);         // 返回段 <70px 回收(:26276-26279)→ 全灭
await waitFrames(250);
const st4 = await piranha();
await clearSwings();
await waitFrames(250);
const s4 = await swingsFor(gunId);
ok('piranha-all-dead-after-release', st4.n === 0, { live: st4.n });
ok('no-synth-when-no-live-proj', s4.length === 0, { samples: s4.slice(0, 2) });

const failed = A.filter((a) => !a.pass);
for (const a of A) console.log(`${a.pass ? 'PASS' : 'FAIL'} ${a.name} ${JSON.stringify(a)}`);
console.log(failed.length === 0 ? `__HELDPROJ_ALL_PASS(${A.length})` : `__HELDPROJ_FAIL(${failed.length}/${A.length})`);
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
