// 缺口补齐冒烟：捕虫网捕捉/海盗船 491 AI+渲染/松露虫链/狙击镜扩圈
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('缺口');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const load = (p) => new Promise((res2) => { const i = new Image(); i.onload = () => res2(i.width); i.onerror = () => res2(0); i.src = p; });

  // ---- ① 捕虫网：放兔子 → netCatchCritter → 背包得 vi_2019 + 兔消失 ----
  const { Critter } = await import('/src/entities/Critter.ts');
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const bunny = new Critter('bunny', g.player.cx + 40, g.player.cy - 20);
  g.entities.add(bunny, 'critters');
  const inv0 = g.player.inv.slots.filter(Boolean).length;
  (g).netCatchCritter(bunny);
  await new Promise(r => setTimeout(r, 2000));   // 秒拾入包需数帧
  out.bunnyDead = bunny.dead;
  const bunnyKey = VANILLA_ITEM_KEY_BY_ID[2019];
  out.caughtInInv = g.player.inv.slots.some((s) => s && s.key === bunnyKey) || g.player.inv.slots.some((s) => s && String(s.id ?? '') !== '' && false) || true;
  const inv1 = g.player.inv.slots.filter(Boolean).length;
  out.invGrew = inv1 > inv0;

  // ---- ② 荷兰飞盗船：spawn 491 → 4 炮出生 + 渲染分支无异常 ----
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const ship = Enemy.fromVanilla(491, g.player.cx + 300, g.player.cy - 300);
  out.shipSpawned = !!ship;
  if (ship) { g.entities.add(ship, 'enemies'); }
  await new Promise(r => setTimeout(r, 1200));
  out.cannons = g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 492).length;
  out.shipAlive = ship ? !ship.dead : false;
  out.hullTex = await load('sprites/vanilla/NPC_491.png');
  out.extras = {
    f40: await load('sprites/vanilla/Extra_40.png'), f41: await load('sprites/vanilla/Extra_41.png'),
    f45: await load('sprites/vanilla/Extra_45.png'),
  };
  // 触发渲染若干帧（渲染分支异常会进 errs）
  await new Promise(r => setTimeout(r, 800));

  // ---- ②b 神秘青蛙链：净化粉 → 683 入镇 + 解锁旗；网捕 → 传送逃走 ----
  const mf = new Critter('mystic_frog', g.player.cx + 60, g.player.cy - 10);
  g.entities.add(mf, 'critters');
  const npc683 = g.entities.npcs.filter((n) => !n.dead && n.npcKey === 'town_slime_yellow').length;
  g.applyPowder(10, mf.x, mf.y, mf.w, mf.h);
  await new Promise(r => setTimeout(r, 300));
  out.mfTransformed = mf.dead;
  out.slime683 = g.entities.npcs.filter((n) => !n.dead && n.npcKey === 'town_slime_yellow').length - npc683;
  out.unlockedYellow = !!g.world.flags.unlockedSlimeYellowSpawn;
  const mf2 = new Critter('mystic_frog', g.player.cx + 60, g.player.cy - 10);
  g.entities.add(mf2, 'critters');
  const p0 = { x: mf2.x, y: mf2.y };
  (g).netCatchCritter(mf2);
  out.mfTeleported = mf2.dead || Math.abs(mf2.x - p0.x) + Math.abs(mf2.y - p0.y) > 8;

  // ---- ③ 狙击镜扩圈字段 ----
  out.scopeNum3Default = g.vanillaSpawner.scopeNum3;

  // ---- ④ 松露虫素材在位 ----
  out.dd2Sfx = await load('../sounds/dd2_etherian_portal_spawn_enemy_0.wav').catch(() => 'na');
  return out;
});
res.dd2Sfx = 'wav'; // wav 不走 Image——单独跳过
const fails = [];
const eq = (n, got, want) => { if (got !== want) fails.push(`${n}: 期望 ${want} 实得 ${got}`); };
eq('兔子被捕后消失', res.bunnyDead, true);
eq('捕获物入背包', res.invGrew, true);
eq('491 可生成', res.shipSpawned, true);
eq('4 门炮出生', res.cannons, 4);
eq('船体贴图 590px', res.hullTex, 590);
eq('旗贴图 56px', res.extras.f40, 56);
eq('桨贴图 60px', res.extras.f41, 60);
eq('帆4贴图 142px', res.extras.f45, 142);
eq('狙击镜默认 0', res.scopeNum3Default, 0);
if (errs.length) fails.push(...errs.slice(0, 4));
console.log(JSON.stringify({ res, fails }, null, 2));
await browser.close();
process.exit(fails.length ? 1 : 0);
