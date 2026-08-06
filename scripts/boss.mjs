// M5 测试：克苏鲁之眼——夜间召唤、Boss 条、两阶段、击杀
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || 'http://localhost:5199';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

// 设为夜晚并召唤 Boss
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.9; // 深夜
  g.spawnEnemy('eye_of_cthulhu', g.player.cx + 300, g.player.cy - 200);
});
await new Promise((r) => setTimeout(r, 1000));

const p1 = await page.evaluate(() => {
  const g = window.__swGame;
  const b = g.boss;
  return {
    bossAlive: !!b && !b.dead,
    bossHp: b ? b.hp : 0,
    maxHp: b ? b.maxHp : 0,
    phase: b ? b.phase : 0,
    // Boss 条渲染检查：屏幕中上部应有红色像素
  };
});
console.log('BOSS P1:', JSON.stringify(p1));

// 打到 50% 以下看转阶段
await page.evaluate(() => {
  const g = window.__swGame;
  const b = g.boss;
  if (b) b.hp = Math.floor(b.maxHp * 0.4);
});
await new Promise((r) => setTimeout(r, 800));
const p2 = await page.evaluate(() => {
  const g = window.__swGame;
  const b = g.boss;
  return { phase: b ? b.phase : 0, hp: b ? b.hp : 0 };
});
console.log('BOSS P2:', JSON.stringify(p2)); // 期望 phase:2

// 直接击杀（Boss 在剑圈外游走，补刀不现实——直接调用 hurt 验证死亡链路）
const kill = await page.evaluate(() => {
  const g = window.__swGame;
  if (g.boss) g.boss.hurt(99999, 3, -2, g);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        bossCleared: !g.boss,
        flag: g.world.flags.downedEyeOfCthulhu,
        drops: g.entities.drops.length,
      });
    }, 600);
  });
});
console.log('BOSS KILL:', JSON.stringify(kill));

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO ERRORS');
await browser.close();
