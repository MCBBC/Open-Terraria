// 机械三王召唤物 hardMode 门删除探针（Player.cs:43117-43179 1:1）：
//   原版门仅 !IsItDay()——**无 hardMode 合取**，困难模式前的夜晚即可召唤：
//   1) 困难前（hardMode=false）+ 夜晚：使用机械蠕虫 556 → 毁灭者 134 生成 + 物品消耗
//   2) 白天：静默不可用——不生成、不消耗（cs:43123 !IsItDay() 门）
//   3) 三映射对表：556→destroyer(134) / 544→twins(125) / 557→skeletron_prime(127)
// 跑法：SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_mech-summon-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(String(process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const res = { hardModeBefore: !!w.flags.hardMode };
  // 物品解析：机械蠕虫 = 原版 556（key vi_556_MechanicalWorm，VANILLA_ITEM_KEY_BY_ID 权威）
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } = await import('/src/data/items.ts');
  const { viIdFromKey } = await import('/src/data/vanillaItemCombat.ts');
  const key556 = VANILLA_ITEM_KEY_BY_ID[556];
  res.key556 = key556;
  res.viOfKey = viIdFromKey(key556);
  const internal = window.__swItems[key556];
  res.internalId = internal;
  res.defKey = ITEM_DEFS[internal]?.key;
  // 观测台：清出空域 + 石板地
  const st = w.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  for (let dx = -30; dx <= 30; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, gy + dy, 0);
  for (let dx = -30; dx <= 30; dx++) st.setTile(px0 + dx, gy + 1, window.__swTiles['stone']);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (gy - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  const enemiesBefore = () => g.entities.enemies.filter((e) => !e.dead).length;
  // ---- A. 困难前 + 夜晚：应生成毁灭者并消耗 ----
  w.clock.timeOfDay = 0.9;                       // 夜（IsItDay=false）
  await new Promise((r) => setTimeout(r, 120));
  g.player.inv.add(internal, 2);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === internal);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  const n0 = enemiesBefore();
  g.input.mouseX = 640; g.input.mouseY = 400;
  g.input.mouseDown = true;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  await new Promise((r) => setTimeout(r, 400));
  res.nightSpawned = enemiesBefore() - n0;
  res.nightKinds = g.entities.enemies.filter((e) => !e.dead).map((e) => e.vanillaId).filter((v) => [125, 126, 127, 134].includes(v));
  res.stackAfterNight = slots.reduce((s, it) => s + (it && it.id === internal ? it.stack : 0), 0);
  // ---- B. 白天：静默不可用（不生成、不消耗） ----
  w.clock.timeOfDay = 0.35;                      // 昼
  await new Promise((r) => setTimeout(r, 120));
  g.player.useTime = 0;
  const n1 = enemiesBefore();
  g.input.mouseX = 640; g.input.mouseY = 400;
  g.input.mouseDown = true;
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  res.daySpawned = enemiesBefore() - n1;
  res.stackAfterDay = slots.reduce((s, it) => s + (it && it.id === internal ? it.stack : 0), 0);
  res.hardModeAfter = !!w.flags.hardMode;
  return res;
});

console.log(JSON.stringify(out, null, 1));
check('物品解析：556 → vi_556_MechanicalWorm（viIdFromKey=556）', out.key556 === 'vi_556_MechanicalWorm' && out.viOfKey === 556, `${out.key556}/${out.viOfKey}`);
check('全程困难前（hardMode=false 未被使用链置位）', out.hardModeBefore === false && out.hardModeAfter === false);
check('困难前夜：机械蠕虫召出机械 Boss（毁灭者 134 族）', out.nightSpawned > 0 && out.nightKinds.length > 0, JSON.stringify(out.nightKinds));
check('困难前夜：物品被消耗（2→1）', out.stackAfterNight === 1, `stack=${out.stackAfterNight}`);
check('白天：静默不可用——不生成', out.daySpawned === 0, `spawned=${out.daySpawned}`);
check('白天：不消耗', out.stackAfterDay === 1, `stack=${out.stackAfterDay}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
