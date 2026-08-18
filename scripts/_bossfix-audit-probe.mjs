// 2026-08-18 召唤物审计四抽验探针（Player.cs 1:1 批修）：
//   T1 机械眼在场再放机械眼（544→twins 125/126）：SummonItemCheck 拦下 → 不消耗（stack 不减）
//   T2 天界印记 3601 石巨人前（!downedGolemBoss）静默不消耗；石巨人后过门 → 消耗+倒计时 720
//   T3 史后水晶 4988 白天+神圣可用（门仅 ZoneHallow，昼夜/hardMode 合取已删）
//   T4 EoW 首杀陨石 roll：写键前快照 boss2Already=false → spawnMeteor 必置位
// 跑法：SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs scripts/_bossfix-audit-probe.mjs
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
  const res = {};
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const internalOf = (vid) => window.__swItems[VANILLA_ITEM_KEY_BY_ID[vid]];
  const stackOf = (iid) => g.player.inv.slots.reduce((s, it) => s + (it && it.id === iid ? it.stack : 0), 0);
  const clearBoss = () => { for (const e of g.entities.enemies) e.dead = true; g.boss = null; };

  // 观测台：清出空域 + 石板地（同 _mech-summon-probe）
  const st = w.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  for (let dx = -30; dx <= 30; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, gy + dy, 0);
  for (let dx = -30; dx <= 30; dx++) st.setTile(px0 + dx, gy + 1, window.__swTiles['stone']);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (gy - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.player.hp = g.player.maxHp = 1000;

  const useHeld = (ticks = 8) => {
    g.input.mouseX = 640; g.input.mouseY = 400;
    g.input.mouseDown = true;
    for (let i = 0; i < ticks; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
  };
  const give = (vid, n) => { const iid = internalOf(vid); g.player.inv.add(iid, n); const slots = g.player.inv.slots; const bi = slots.findIndex((it) => it && it.id === iid); if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; } g.player.inv.selected = 0; g.player.useTime = 0; return iid; };

  // ---- T2 天界印记：石巨人前静默不消耗 ----
  clearBoss();
  w.flags['downed_245'] = false; w.flags.hardMode = false;
  w.lunarEvent.moonLordCountdown = 0; w.lunarEvent.moonLordCountdownMax = 0;
  w.moonEvent.kind = 0; w.invasionType = 0;
  const sigil = give(3601, 1);
  useHeld();
  res.t2a_stack = stackOf(sigil);
  res.t2a_countdown = w.lunarEvent.moonLordCountdown;
  // 正向对照：石巨人已败 + hardMode + 无危险 → 消耗 + 倒计时 720
  w.flags['downed_245'] = true; w.flags.hardMode = true;
  g.player.useTime = 0;
  useHeld();
  res.t2b_stack = stackOf(sigil);
  res.t2b_countdown = w.lunarEvent.moonLordCountdown;
  w.lunarEvent.moonLordCountdown = 0; w.lunarEvent.moonLordCountdownMax = 0;
  clearBoss();

  // ---- T3 史后水晶 4988：白天 + 神圣区可用 ----
  w.clock.timeOfDay = 0.35;               // 昼
  await new Promise((r) => setTimeout(r, 150));
  g.scene.zoneHallow = true; g.tickCount = 1;   // 避开 15tick 场景重扫覆写
  const crystal = give(4988, 1);
  const n3 = g.entities.enemies.filter((e) => !e.dead).length;
  useHeld();
  res.t3_stack = stackOf(crystal);
  res.t3_spawned = g.entities.enemies.filter((e) => !e.dead).length - n3;
  res.t3_queen = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 657);
  clearBoss();

  // ---- T1 机械眼在场再放机械眼：不消耗 ----
  w.clock.timeOfDay = 0.9;                // 夜（机械门 !IsItDay）
  await new Promise((r) => setTimeout(r, 150));
  g.scene.zoneHallow = false;
  const eye = give(544, 2);
  useHeld();
  res.t1_firstSpawn = g.entities.enemies.filter((e) => !e.dead && (e.vanillaId === 125 || e.vanillaId === 126)).length;
  res.t1_stackAfterFirst = stackOf(eye);
  for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);   // 等 useTime 45 归零
  g.player.useTime = 0;
  const n1 = g.entities.enemies.filter((e) => !e.dead).length;
  useHeld();
  res.t1_stackAfterSecond = stackOf(eye);
  res.t1_spawnDelta = g.entities.enemies.filter((e) => !e.dead).length - n1;
  clearBoss();

  // ---- T4 EoW 首杀陨石 roll（写键前快照） ----
  delete w.flags['downed_13']; delete w.flags['downed_266']; w.flags.spawnMeteor = false;
  const eow = (await import('/src/entities/Enemy.ts')).Enemy.fromVanilla(13, g.player.cx + 400, g.player.cy - 200);
  if (eow) { eow.id = g.entities.nextId++; g.entities.add(eow, 'enemies'); g.boss = eow; eow.dead = true; }
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  res.t4_spawnMeteor = !!w.flags.spawnMeteor;
  res.t4_downed13 = !!w.flags['downed_13'];
  clearBoss();
  return res;
});

console.log(JSON.stringify(out, null, 1));
check('T2a 天界印记石巨人前：静默不消耗', out.t2a_stack === 1, `stack=${out.t2a_stack}`);
check('T2a 石巨人前：倒计时不动', out.t2a_countdown === 0, `countdown=${out.t2a_countdown}`);
check('T2b 石巨人后：过门消耗', out.t2b_stack === 0, `stack=${out.t2b_stack}`);
check('T2b 石巨人后：倒计时 720（StartImpendingDoom）', out.t2b_countdown === 720, `countdown=${out.t2b_countdown}`);
check('T3 史后水晶白天神圣区：可用并消耗', out.t3_stack === 0 && out.t3_queen, `stack=${out.t3_stack} queen=${out.t3_queen} spawned=${out.t3_spawned}`);
check('T1 机械眼首用：双子生成 + 消耗一件', out.t1_firstSpawn >= 1 && out.t1_stackAfterFirst === 1, `twins=${out.t1_firstSpawn} stack=${out.t1_stackAfterFirst}`);
check('T1 双子在场再放机械眼：不消耗（stack 不减）', out.t1_stackAfterSecond === 1, `stack=${out.t1_stackAfterSecond}`);
check('T1 双子在场再放机械眼：无新怪（不双刷）', out.t1_spawnDelta === 0, `delta=${out.t1_spawnDelta}`);
check('T4 EoW 首杀：陨石 roll 必触发（spawnMeteor）', out.t4_spawnMeteor === true && out.t4_downed13 === true, `meteor=${out.t4_spawnMeteor} downed13=${out.t4_downed13}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
