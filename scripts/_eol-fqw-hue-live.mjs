// ★债2 活机取证：932 月总矢发射点 hue 通道（暮夕 4953 → fairyQueenShotHue 注入）
// run: SW_ORIGIN=http://localhost:5215 node tools/run-diag.mjs scripts/_eol-fqw-hue-live.mjs
// 判据：
//  ① 真实输入射一轮暮夕（5 连发）→ 场上出现 projId 932 弹；
//  ② 每发 p.empressHue ≠ 0 缺省档（登记债病灶=恒 0 青蓝），且 =
//     fairyQueenShotHue(m)（m ∈ 射击窗 [m0-1, m1+1] 内某 tick 的 miscCounter）；
//  ③ 多发 hue 互异（锯齿 0.04/tick 步进,useTime=2 连发 → 相邻发差 ~0.08）= 彩虹染色活性；
//  ④ 截图：932 在视野内画出（像素证据存 /tmp/eol932-hue.png）
import { launchBrowser, openPage, bootstrap, giveItems } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5215';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e.message).slice(0, 160)));
await bootstrap(page, ORIGIN + '/');
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('[data-act=sp]')).catch(() => false)) break;
  await sleep(2000);
}
await sleep(1200);
await page.evaluate(() => window.__swFlow.newWorld('eol932' + (Date.now() % 10000), 4200, 1200));
for (let i = 0; i < 240; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.world && window.__swGame.running === true && window.__swGame.player)).catch(() => false)) break;
  await sleep(500);
}
await sleep(2000);

// 净夹具：清背包 → 暮夕 4953（格 0 选中）+ 木箭 100（弹药槽 54）
const give = await giveItems(page, [
  { vid: 4953, slot: 0 },
  { vid: 40, stack: 100, slot: 54 },   // 本仓 vid 域木箭=40（vi_40_wooden_arrow;useAmmo 40 匹配）
], { select: 0 });
if (!give.ok) { console.log(JSON.stringify({ ok: false, why: 'give-failed', give })); process.exit(1); }

// 传射前 miscCounter 窗口采样函数进页面
const fire = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/data/vanillaItemCombat.ts');
  const p = g.player;
  // 清场（防残留弹干扰）
  g.entities.projectiles.length = 0;
  // 生成面钩子：记录 add() 进池的实体类名/kind（射不出弹时定位断点）
  // 弹药解析钩子：pickAmmoSlot 入参/回执（no-shot 断点定位）
  if (!g.__psLog) {
    g.__psLog = [];
    const origPs = g.player.pickAmmoSlot.bind(g.player);
    g.player.pickAmmoSlot = (...args) => {
      const r = origPs(...args);
      if (g.__psLog.length < 10) {
        g.__psLog.push({ slot: r, useAmmo: args[1],
          slots54: [54, 55, 56, 57].map((i) => g.player.inv.slots[i]) });
      }
      return r;
    };
  }
  if (!g.__addLog) {
    g.__addLog = [];
    const orig = g.entities.add.bind(g.entities);
    g.entities.add = (e, kind) => {
      if (g.__addLog.length < 40) g.__addLog.push({ cls: e?.constructor?.name ?? '?', kind, pid: e?.projId ?? null });
      return orig(e, kind);
    };
  } else {
    g.__addLog.length = 0;
  }
  const m0 = p.miscCounter;
  return { m0, fqn: m.fairyQueenShotHue.toString().length };
});
const m0 = fire.m0;

// 真实鼠标输入：画布中央偏右上按下（约 1 挥击=5 连发窗）
const cv = await page.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
// 玩家在画布中心;光标移到中心右上 250,−180
await page.mouse.move(cv.x + cv.w / 2 + 250, cv.y + cv.h / 2 - 180);
await page.mouse.down();
await sleep(300);
const dbg = await page.evaluate(() => {
  const g = window.__swGame;
  const held = g.player.inv.heldItem();
  return {
    mouseDown: g.input.mouseDown, mouseHeld: g.input.mouseHeld,
    mouseX: g.input.mouseX, mouseY: g.input.mouseY,
    heldId: held?.id, heldStack: held?.stack,
    useTime: g.player.useTime, swingItem: g.swing?.item ?? null, swingT: g.swing?.t ?? null,
    selected: g.player.inv.selected,
    paused: g.paused, running: g.running,
  };
});
console.error('[dbg]', JSON.stringify(dbg));
console.error('[addLog@300ms]', JSON.stringify(await page.evaluate(() => window.__swGame.__addLog)));
console.error('[psLog@300ms]', JSON.stringify(await page.evaluate(() => window.__swGame.__psLog)));
// 逐拍采样弹幕池（防"射出又即死"观察盲区）
for (let k = 0; k < 10; k++) {
  const snap = await page.evaluate(() => {
    const g = window.__swGame;
    const ids = {};
    for (const q of g.entities.projectiles) ids[q.projId] = (ids[q.projId] ?? 0) + 1;
    return { n: g.entities.projectiles.length, ids, swingT: g.swing?.t ?? null };
  });
  console.error(`[poll ${k}]`, JSON.stringify(snap));
  await sleep(150);
}
await sleep(500);
await page.mouse.up();
const m1 = await page.evaluate(() => window.__swGame.player.miscCounter);

// 收弹：932 全量 + hue 校验 + 截图
const collect = await page.evaluate(async (win) => {
  const g = window.__swGame;
  const m = await import('/src/data/vanillaItemCombat.ts');
  const m0v = win.m0, m1v = win.m1;
  const rows = [];
  for (const q of g.entities.projectiles) {
    if (q.projId !== 932) continue;
    // 匹配：p.empressHue 是否等于窗口内某 tick 的 fairyQueenShotHue(m)
    let matchM = -1;
    for (let mm = Math.max(0, m0v - 2); mm <= m1v + 2; mm++) {
      if (m.fairyQueenShotHue(mm) === q.empressHue) { matchM = mm; break; }
    }
    rows.push({ hue: q.empressHue, matchM, age: q.age, dead: !!q.dead,
      x: q.cx - g.camera.x, y: q.cy - g.camera.y });
  }
  return { n932: rows.length, rows, counter: [m0v, m1v] };
}, { m0, m1 }).catch((e) => ({ err: String(e).slice(0, 200) }));

// 截图（932 若仍在视野内）
await page.screenshot({ path: '/tmp/eol932-hue.png' });

const hues = (collect.rows ?? []).map((r) => r.hue);
const distinct = new Set(hues).size;
const allMatch = (collect.rows ?? []).every((r) => r.matchM >= 0);
// 锯齿步进判据：hue 值 mod 1 全部落在 0.04 网格上（f32 链步进 0.04/tick,
// useTime=2 连发 → 相邻发差 0.08）——缺省 0 病灶 = 全部恒 0 不可能落出多档
const onGrid = hues.every((h) => {
  const q = Math.round(h / 0.04);
  return Math.abs(h - q * 0.04) < 2e-6 || Math.abs(Math.abs(h - q * 0.04) - 1) < 2e-6;
});
// 缺省 0 档的症状判据 = distinct==1 且全 0;锯齿合法值含 0（m%25==0）→ 用
// distinct 多档 + 网格判据替代「≠0」
const notAllZero = !(hues.length > 0 && hues.every((h) => h === 0));
const verdict = {
  ok: (collect.n932 ?? 0) >= 5 && allMatch && distinct >= 5 && notAllZero && onGrid,
  n932: collect.n932,
  counterWindow: collect.counter,
  hues,
  distinctHues: distinct,
  allMatchFormula: allMatch,
  on004Grid: onGrid,
  notAllZero,
  errs,
};
console.log(JSON.stringify(verdict, null, 1));
process.exit(verdict.ok ? 0 : 2);
