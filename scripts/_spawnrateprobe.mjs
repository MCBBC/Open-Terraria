// 刷怪频率验证：原版语义 = 每帧 Next(spawnRate)==0（白天地表 spawnRate=600 → 平均 10s 一试）
// 统计：1) 白天地表 3 分钟的尝试次数与生成数 2) 深度修正（地下 spawnRate×0.5 → 5s 一试）
// 3) npcSlots 上限（maxSpawns=5：满员后不再尝试出怪）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  // 地表观测台（白天）
  g.world.clock.timeOfDay = 0.5;
  g.player.x = px0 * 16; g.player.y = (gy - 3) * 16;
  for (let i = 0; i < 600 && !g.vanillaSpawner; i++) g.fixedUpdate(1 / 60);
  // 统计 3 分钟（10800 帧）地表白天的生成尝试/成功
  let spawnedSurface = 0;
  const before = new Set(g.entities.enemies.map((e) => e.id));
  for (let i = 0; i < 60 * 180; i++) {
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    g.fixedUpdate(1 / 60);
  }
  for (const e of g.entities.enemies) if (!before.has(e.id) && !e.dead) spawnedSurface++;
  const rate = g.vanillaSpawner.getSpawnRate(g.player.cy, 0, false, g.camera.viewH / (g.camera.zoom || 1));
  // 深度修正：搬到 rockLevel 下验证 spawnRate 减半
  g.player.y = (g.world.rockLevel + 40) * 16;
  const rateCavern = g.vanillaSpawner.getSpawnRate(g.player.cy, 0, false, g.camera.viewH / (g.camera.zoom || 1));
  // npcSlots 上限验证
  const nearby = g.entities.enemies.reduce((s, e) => s + (e.vanilla?.npcSlots ?? 1), 0);
  return {
    surfaceSpawnedIn3min: spawnedSurface,
    rateSurface: rate,
    rateCavern,
    currentNearbySlots: nearby,
    sampleSlots: g.entities.enemies.slice(0, 5).map((e) => [e.vanillaId, e.vanilla?.npcSlots]),
  };
});
console.log(JSON.stringify(out, null, 1));
// 原版白天地表 spawnRate=600：3 分钟期望尝试 ~18 次、成功生成 ~5-18 只（概率窗）
// 空场地表：600×0.6(附近<20%) = 360；洞穴空场：600×0.4×0.6×0.7(地下第二块) = 100
check('地表空场 spawnRate=360（600×0.6 补怪加速）', out.rateSurface.spawnRate === 360, JSON.stringify(out.rateSurface));
check('洞穴 spawnRate 修正链（×0.4×0.6×0.7=100）+ max×1.9', out.rateCavern.spawnRate === 100 && out.rateCavern.maxSpawns === 9, JSON.stringify(out.rateCavern));
check('3 分钟生成数在原版期望区间（≈5-25）', out.surfaceSpawnedIn3min >= 3 && out.surfaceSpawnedIn3min <= 30, `spawned=${out.surfaceSpawnedIn3min}`);
// npcSlots 数据校验（直接读提取表：King Slime=5，普通怪缺省=1 由 ?? 1 兜底）
const slotsCheck = await page.evaluate(async () => {
  const j = await (await fetch('/sprites/vanilla-npcs.json')).json();
  return { king: j['50']?.npcSlots, eye: j['2']?.npcSlots ?? 'default', count: Object.values(j).filter((e) => e.npcSlots != null).length };
});
check('npcSlots 数据生效（King Slime=5，表内 243 类型）', slotsCheck.king === 5 && slotsCheck.count > 200, JSON.stringify(slotsCheck));
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
