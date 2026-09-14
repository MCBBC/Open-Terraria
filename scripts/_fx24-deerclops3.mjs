// FX24c 一次性探针：第二只鹿角怪来源定性——
//  ① 召唤面板单击 1 行 → 3s 内逐 500ms 数 668 实体（查面板双发）
//  ② Deer Thing(5120) 物品使用链 → 数实体（查召唤链双发/门）
//  ③ 自然生成门状态快照（raining/nightTicks/maxHp/defense/this.boss）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&fx24c=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const count668 = () => page.evaluate(() => {
  const g = window.__swGame;
  return [...g.entities.enemies].filter((n) => n.vanillaId === 668 && !n.dead).map((e) => ({ id: e.id, ai0: e.ai0, lai3: Math.round(e.lai3), x: Math.round(e.x) }));
});
const R = {};
R.gate = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  return {
    raining: w?.weather?.raining, nightTicks: g.nightTicks ?? g.world?.nightTicks, time: w?.clock?.time,
    maxHp: g.player?.maxHp, defense: g.player?.defense, boss: !!g.boss, zoneSnow: g.scene?.zoneSnow,
  };
});

// ① 召唤面板单击一次
await page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  const row = document.querySelector('[data-role=list] > div');
  row.click();
  g.summonPanel?.close();
});
for (let i = 0; i < 6; i++) {
  const c = await count668();
  R[`panel_t${i}`] = { n: c.length, c };
  await wait(500);
}

// ② 清场 → Deer Thing 物品链（直接调 summonBoss 双保险 + 物品路径一次）
await page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  g.boss = null;
  window.__fx24c_calls = 0;
  const orig = g.summonBoss.bind(g);
  g.summonBoss = (key, opts) => { window.__fx24c_calls++; return orig(key, opts); };
});
await page.evaluate(() => {
  const g = window.__swGame;
  g.summonBoss('deerclops', { onPlayer: true });
});
for (let i = 0; i < 4; i++) {
  const c = await count668();
  R[`item_t${i}`] = { n: c.length, c };
  await wait(500);
}
R.itemCalls = await page.evaluate(() => window.__fx24c_calls);

// ③ 自然生成门直测：把门条件全凑齐（raining+zoneSnow+boss 在场）→ 手动跑 spawnDeerclopsOnPlayer 等价体
await page.evaluate(() => {
  const g = window.__swGame;
  g.boss = null;   // 模拟 boss 槽被清的极端态
});
await page.evaluate(() => {
  const g = window.__swGame;
  // 走私有方法名约定：直接从 Game 原型调（若可及）
  const anyG = g;
  if (typeof anyG.spawnDeerclopsOnPlayer === 'function') anyG.spawnDeerclopsOnPlayer();
});
await wait(400);
R.afterForceNatural = await count668();

console.log(JSON.stringify(R, null, 1));
if (errors.length) console.error('PAGEERRORS:', errors.slice(0, 5));
await browser.close();
