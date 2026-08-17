// 登记项收口批抽验 4 项：QuickHeal 键 / noUseGraphic 数据表 / 食物粒子尘284 / dryad 光环。
// SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs --timeout=300000 scripts/_regclose-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&regprobe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const van = await page.evaluate(async () => (await (await fetch('sprites/vanilla.json')).json()).items ?? {});
const keyFor = (vid) => {
  for (const [idStr, m] of Object.entries(van)) {
    if (Number(idStr) === vid) return 'vi_' + vid + '_' + m.key.replace(/[^A-Za-z0-9]/g, '');
  }
  return null;
};

const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });

// ============ ① QuickHeal（H 键）============
const r1 = await page.evaluate(async (healKey) => {
  const g = window.__swGame, p = g.player;
  const id = window.__swItems[healKey];
  if (id === undefined) return { err: 'no item ' + healKey };
  p.inv.slots[5] = { id, stack: 5 };
  g.cb.onInventoryChanged?.();
  p.hp = 60; p.buffs.active.clear(); p.useTime = 0;
  const maxHp0 = p.maxHp;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }));
  await new Promise(r => setTimeout(r, 100));
  const sick = p.buffs.active.get(2);           // BuffType.Resistance = 2（药水病）
  return {
    hpAfter: p.hp, maxHp: maxHp0, stackAfter: p.inv.slots[5]?.stack ?? 0,
    sicknessSec: sick ?? 0, key: healKey,
  };
}, keyFor(188));
ok('quickheal-H', !r1.err && r1.hpAfter === Math.min(160, r1.maxHp)
  && r1.stackAfter === 4 && r1.sicknessSec >= 55, r1);

// ============ ② noUseGraphic 数据表消费（炸弹 166 vs 手里剑 47）============
const r2 = await page.evaluate(async (bombKey, shurikenKey) => {
  const g = window.__swGame, p = g.player;
  const out = {};
  for (const [name, key] of [['bomb', bombKey], ['shuriken', shurikenKey]]) {
    const id = window.__swItems[key];
    if (id === undefined) { out[name] = { err: 'no item' }; continue; }
    p.inv.slots[p.inv.selected] = { id, stack: 99 };
    g.cb.onInventoryChanged?.();
    p.useTime = 0; g.swing = null;
    g.input.mouseX = 640; g.input.mouseY = 200;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 4; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    out[name] = {
      swung: !!g.swing, noGraphic: g.swing?.noGraphic,
      item: g.swing?.item,
    };
    // 清场：移除刚生成的炸弹投射物
    for (const pr of [...g.entities.projectiles]) pr.dead = true;
  }
  return out;
}, keyFor(166), keyFor(47));
ok('noUseGraphic-bomb-table', r2.bomb?.noGraphic === true, r2);
ok('noUseGraphic-shuriken-false', r2.shuriken?.noGraphic === false, r2);

// ============ ③ 食物粒子（尘 284）============
const r3 = await page.evaluate(async (foodKey) => {
  const g = window.__swGame, p = g.player;
  const id = window.__swItems[foodKey];
  if (id === undefined) return { err: 'no item ' + foodKey };
  p.inv.slots[p.inv.selected] = { id, stack: 5 };
  g.cb.onInventoryChanged?.();
  p.useTime = 0; g.swing = null;
  g.input.mouseX = 640; g.input.mouseY = 200;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  let d284 = 0;
  for (let i = 0; i < 40; i++) {
    g.fixedUpdate(1 / 60);
    for (const d of g.vanillaDust.pool) if (d.active && d.type === 284) d284++;
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  return { d284, swingStyle: g.swing?.useStyle, key: foodKey };
}, keyFor(357));
ok('food-particle-dust284', !r3.err && r3.d284 > 0, r3);

// ============ ④ dryad 光环（buff 165 + 防御 +8）============
const r4 = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  // 动态 import TownNPC 类（避免 window 暴露缺失）
  const mod = await import('/src/entities/TownNPC.ts');
  const n = new mod.TownNPC('dryad', p.x - 40, p.y - 20);
  n.vanillaId = 20;
  g.entities.add(n, 'npcs');
  const def0 = p.defense;
  // 直接进入施法态（AI_007 ai[0]=14 树妖分支：弹 586 于 atkTick 24 出生）：
  // 探针跳过危险掷骰，直达态内推进
  n.atkState = 14; n.atkTimer = 600; n.atkTick = 23; n.wardT = 0; n.onGround = true;
  for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
  const wardSec = p.buffs.active.get(106);      // BuffType.DryadsWard = 106
  const def1 = p.defense;
  n.dead = true;
  return { wardSec: wardSec ?? 0, def0, def1, defGain: def1 - def0, atkState: n.atkState };
});
ok('dryad-ward-buff165', r4.wardSec > 0, r4);
ok('dryad-ward-defense8', r4.defGain >= 8, r4);

console.log(JSON.stringify({ results: A, errors: errors.slice(0, 3) }, null, 2));
const failed = A.filter((a) => !a.pass);
console.log(failed.length === 0 ? 'ALL PASS' : `FAIL ${failed.length}/${A.length}`);
await browser.close();
process.exit(failed.length === 0 ? 0 : 1);
