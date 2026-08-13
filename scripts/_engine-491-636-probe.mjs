// 引擎级三小项定点回归(2026-08-13):491 飞刀 / 636 太阳耀斑 经 Game 近战 shoot
// 单点分流的端到端(挥击链 → 实体 → 语义),vitest 只覆盖实体层,本探针覆盖接线。
// SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs --timeout=420000 scripts/_engine-491-636-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// ---- A. 3030 飞刀 → FlyingKnifeProj(AI_009_Old:40753) ----
const knife = await page.evaluate(async () => {
  const g = window.__swGame; const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_3030_/.test(k));
  if (!key) return { err: 'no vi_3030' };
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const cam = g.camera;
  g.input.mouseX = cam.viewW / 2 + 240; g.input.mouseY = cam.viewH / 2;   // 玩家右侧
  g.input.mouseDown = true; g.input.mouseHeld = true;
  // 120ms ≈ 7 tick:刀以 20px/t 逼近 240px 外光标,未到近距档,速度恒朝光标
  // (260ms 会越过光标开始回摆,vx 符号翻转为探针噪声)
  await new Promise((r) => setTimeout(r, 120));
  const k = g.entities.projectiles.find((e) => e.constructor?.name === 'FlyingKnifeProj');
  const heldSnap = k ? { ai0: k.ai0, vx: Math.round(k.vx), x: Math.round(k.cx - p.cx) } : null;
  g.input.mouseHeld = false;
  await new Promise((r) => setTimeout(r, 1400));                           // 松手 → 回收
  const after = g.entities.projectiles.find((e) => e.constructor?.name === 'FlyingKnifeProj');
  const strayArrow = g.entities.projectiles.filter((e) => e.constructor?.name === 'Arrow' && e.projId === 491).length;
  g.input.mouseDown = false;
  return { key, heldSnap, ai0After: after ? after.ai0 : null, deadAfter: !after, strayArrow };
});
check('3030→491:挥击链生成 FlyingKnifeProj 而非直飞 Arrow', !!knife.heldSnap && knife.strayArrow === 0, JSON.stringify(knife));
check('491 持按 = channel 操控态(ai0≤0 且朝光标前进)', !!knife.heldSnap && knife.heldSnap.ai0 <= 0 && knife.heldSnap.vx > 0 && knife.heldSnap.x > 0, JSON.stringify(knife.heldSnap));
check('491 松手 → ai0=1 回收并回手消亡', knife.ai0After === null && knife.deadAfter === true, JSON.stringify({ ai0After: knife.ai0After, deadAfter: knife.deadAfter }));

// ---- B. 3543 Daybreak 长矛 → DaybreakFlare(636 附着 + 层数) ----
const flare = await page.evaluate(async () => {
  const g = window.__swGame; const p = g.player;
  const wp = await import('/src/entities/WeaponProj.ts');
  const key = Object.keys(window.__swItems).find((k) => /^vi_3543_/.test(k));
  if (!key) return { err: 'no vi_3543' };
  // 靶:玩家右侧 130px 的僵尸,垫高 HP 防一击死(只验附着语义)
  const en = g.spawnEnemy('v_6', p.cx + 130, p.cy - 10);
  if (!en) return { err: 'no enemy' };
  en.hp = 100000; en.hpMax = 100000;
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0; p.useTime = 0;
  const cam = g.camera;
  const [wx, wy] = g.camera.screenToWorld ? [0, 0] : [0, 0];
  // 鼠标指向靶心(屏幕坐标 = 靶心世界 → 屏幕变换)
  g.input.mouseX = (en.x + en.w / 2 - cam.x) * cam.zoom + cam.viewW / 2;
  g.input.mouseY = (en.y + en.h / 2 - cam.y) * cam.zoom + cam.viewH / 2;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  await new Promise((r) => setTimeout(r, 120));                            // autoReuse 每挥一发
  g.input.mouseDown = false; g.input.mouseHeld = false;
  await new Promise((r) => setTimeout(r, 350));                            // 等附着稳定
  const f = g.entities.projectiles.find((e) => e.constructor?.name === 'DaybreakFlare');
  const stacks = wp.daybreakStacks(en.id);
  const strayArrow = g.entities.projectiles.filter((e) => e.constructor?.name === 'Arrow' && e.projId === 636).length;
  // 第二发:叠第二层(层数 2)
  p.useTime = 0;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  await new Promise((r) => setTimeout(r, 400));
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const stacks2 = wp.daybreakStacks(en.id);
  return {
    key, enId: en.id, daybreakT: Math.round((en.daybreakT ?? 0) * 10) / 10,
    stuck: f ? f.ai0 === 1 : false, hpLeft: en.hp, stacks, stacks2, strayArrow,
  };
});
check('3543→636:生成 DaybreakFlare 而非直飞 Arrow', flare.stuck === true && flare.strayArrow === 0, JSON.stringify(flare));
check('636 附着即授 Daybreak(189) 5s + 层数 1(NPC.cs:10691/:92813)', flare.daybreakT > 0 && flare.daybreakT <= 5 && flare.stacks >= 1, JSON.stringify(flare));
check('连发叠层:第二层生效(层数模型 :92826)', flare.stacks2 >= 2 && flare.stacks2 > flare.stacks, JSON.stringify({ stacks: flare.stacks, stacks2: flare.stacks2 }));
check('首击伤害=武器 150(3543 dmg,穿防后)', flare.hpLeft <= 100000 - 150, JSON.stringify({ hpLeft: flare.hpLeft }));

console.log(`\n${pass} PASS / ${fail} FAIL`);
console.log('page errors:', JSON.stringify(errors));
await browser.close();
process.exit(fail ? 1 : 0);
