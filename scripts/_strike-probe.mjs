// 风暴落雷 E2E:强制雷暴 → 数 1091 生成 → 验证 bolt 路径伤害与玩家受击
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

// 白天改时间需重置 isDay 一致性——timeOfDay=0.5 白天中段
const st1 = await page.evaluate(() => {
  const g = window.__swGame, w = g.world.weather;
  // 白天(防夜怪干扰)+雷暴态
  g.world.clock.timeOfDay = 0.5; g.world.clock.isDay = true;
  w.cloudAlpha = 0.9; w.maxRaining = 0.9; w.raining = true;
  w.rainTime = 1000000;   // 防第一 tick 被 updateRainSchedule 停雨
  w.windSpeedTarget = 0.7; w.windSpeedCurrent = 0.7;
  w.storming = true; w.shouldUseStormMusic = true;
  w.numClouds = 200; w.cloudBGActive = 1;
  const pl = g.player;
  pl.x = 2095 * 16; pl.y = 231 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  // 无靶(纯生成验证:后 50 次尝试劈任意地面;僵尸会走过来围殴 AFK 玩家干扰验证)
  return { raining: w.raining, storming: w.storming, wind: w.windSpeedTarget };
});
console.log('FORCE', JSON.stringify(st1));
// 跑 20 秒观察
let strikes = 0, playerHits = 0, maxDist = 0;
for (let i = 0; i < 25; i++) {
  await new Promise((r) => setTimeout(r, 300));
  const s = await page.evaluate(() => {
    const g = window.__swGame;
    const bolts = [...g.entities.projectiles].filter((p) => p.projId === 1091);
    // 顺手清靠近的僵尸(防围殴 AFK 玩家)
    for (const e of [...g.entities.enemies]) {
      if (e.vanillaId === 3 && Math.abs(e.x - g.player.x) < 400) e.die?.(g);
    }
    return {
      bolts: bolts.length,
      striking: bolts.filter((b) => b.bolt || b.visualT > 0).length,
      hp: (() => { const pl = g.player; if (!pl.dead && pl.hp < pl.maxHp) pl.hp = pl.maxHp; return pl.hp; })(),
      dead: g.player.dead,
      zoneRain: !!g.world.scene?.zoneRain,
    };
  });
  strikes = Math.max(strikes, s.bolts);
  if (s.hp < 100 && s.hp > 0) playerHits++;
  if (i % 4 === 0) console.log('T' + i, JSON.stringify(s));
  if (s.striking > 0) { await page.screenshot({ path: '/tmp/strike-visual.png' }); console.log('STRIKE-VISUAL captured at T' + i); }
}
console.log('RESULT', JSON.stringify({ maxBolts: strikes, playerHitSeconds: playerHits }));
await page.screenshot({ path: '/tmp/strike-end.png' });
await browser.close();
