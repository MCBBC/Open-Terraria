// 雪原 live 探针：进世界→传送雪面→强制夜→统计 Game 门与实际出怪
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
  await page.keyboard.type('雪原');
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
  await page.waitForSelector('.sw-list-panel .sw-item', { timeout: 120000 });
  await new Promise(r => setTimeout(r, 800));
}
await page.click('.sw-list-panel .sw-item');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2500));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const out = {};
  // 找雪面
  const st = w.store;
  const SNOW = (await import('/src/data/tiles.ts')).TILE_BY_KEY['snow'];
  let fx = -1, fy = -1;
  outer: for (let x = 60; x < st.w - 60; x += 40) {
    for (let y = Math.max(4, w.groundLevel - 40); y < w.groundLevel + 20; y++) {
      if (st.type[st.idx(x, y)] === SNOW && st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)) {
        fx = x; fy = y; break outer;
      }
    }
  }
  out.snowAt = [fx, fy];
  if (fx < 0) return out;
  // 传送玩家到雪面并强制夜
  g.player.x = fx * 16 + 8 - g.player.w / 2;
  g.player.y = (fy - 1) * 16 - g.player.h + 4;
  g.player.vx = 0; g.player.vy = 0;
  w.clock.timeOfDay = 0.9;
  await new Promise(r => setTimeout(r, 500));
  // Game 门：getSpawnRate + 场上敌数
  const p = g.player;
  out.nearby = g.entities.enemies.filter((e) => !e.dead).length;
  out.spawnRate = g.vanillaSpawner.getSpawnRate(
    p.cy, out.nearby, false, g.camera.viewH / (g.camera.zoom || 1), p.cx,
    false, false, false, false, g.entities.npcs.length, w.clock.isDay,
    !!g.scene?.zoneCorrupt || !!g.scene?.zoneCrimson, !!w.clock.bloodMoon).spawnRate;
  out.maxSpawns = g.vanillaSpawner.getSpawnRate(
    p.cy, out.nearby, false, g.camera.viewH / (g.camera.zoom || 1), p.cx,
    false, false, false, false, g.entities.npcs.length, w.clock.isDay,
    !!g.scene?.zoneCorrupt || !!g.scene?.zoneCrimson, !!w.clock.bloodMoon).maxSpawns;
  out.zoneSnow = g.renderer.scene?.zoneSnow;
  out.isDay = w.clock.isDay;
  // 等 40s 看实际出怪（夜间 tick 推进时 spawn 概率 1/spawnRate/帧）
  const t0 = g.entities.enemies.filter((e) => !e.dead).length;
  await new Promise(r => setTimeout(r, 40000));
  const ens = g.entities.enemies.filter((e) => !e.dead);
  out.enemiesAfter40s = ens.length;
  out.spawnedIds = [...new Set(ens.map((e) => e.vanillaId))];
  out.newCount = ens.length - t0;
  return out;
});
console.log(JSON.stringify({ res, errs: errs.slice(0, 3) }, null, 2));
await browser.close();
process.exit(0);
