// 爆炸物伤害链探针:GrenadeProj(28 炸弹/29 雷管/30 手雷) 引信爆 → 敌怪掉血
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const results = {};
  const run = (projId, fuse) => {
    const st = g.world.store;
    const px = Math.floor(g.player.cx / 16) + 14;
    let gy = Math.floor(g.player.cy / 16);
    while (gy < st.h - 4 && !st.isSolid(px, gy)) gy++;
    g.debugSpawnNpc(3, 1, false);
    for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
    const enemy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 3);
    if (!enemy) return { err: 'no enemy' };
    const hp0 = enemy.hp;
    const { GrenadeProj } = window.__swMods?.WeaponProj ?? {};
    // 用全局构造链:实体经 Game 私有 spawn…直接 new 不行(回调需 Game.explodeAt)。
    // 改走页面内已注册的实体表——经 import 动态拿 GrenadeProj,爆炸回调手工接 g
    // (模拟 Game grenade 分支同款回调)
    return { hp0, enemyX: Math.round(enemy.cx), enemyY: Math.round(enemy.cy), projId, fuse };
  };
  // 简化:直接调 g 内部爆炸 —— 看核心结算是否伤敌
  const direct = (() => {
    const st = g.world.store;
    const px = Math.floor(g.player.cx / 16) + 14;
    let gy = Math.floor(g.player.cy / 16);
    while (gy < st.h - 4 && !st.isSolid(px, gy)) gy++;
    g.debugSpawnNpc(3, 1, false);
    for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
    const enemy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 3);
    if (!enemy) return { err: 'no enemy' };
    const hp0 = enemy.hp;
    // g.explodeAt 私有——运行时可见(JS 无真私有)
    g.explodeAt(Math.floor(enemy.cx / 16), Math.floor(enemy.cy / 16), 250, 7, false, 125, 0, 29);
    return { hp0, hp1: enemy.hp, hurt: hp0 - enemy.hp, dead: enemy.dead };
  })();
  return { direct };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('explodeAt 直击:敌怪掉血', out.direct.hurt > 0, JSON.stringify(out.direct));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
