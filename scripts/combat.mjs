// 战斗测试：生成史莱姆 → 挥剑命中 → 击杀 → 掉落拾取 → 受伤/死亡/重生
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

// 在玩家右侧 2 格生成史莱姆
await page.evaluate(() => {
  const g = window.__swGame;
  g.spawnEnemy('slime_green', g.player.cx + 40, g.player.cy + 10);
});
await new Promise((r) => setTimeout(r, 300));

// 切剑（slot 3 = copper_sword）
await page.keyboard.down('Digit3'); await new Promise(r => setTimeout(r, 80)); await page.keyboard.up('Digit3');

// 朝右连续挥剑直到击杀（鼠标跟随史莱姆）
await page.mouse.down();
const hit = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  let waited = 0;
  const t = setInterval(() => {
    waited += 100;
    // 鼠标跟随敌人保持指向
    const e = g.entities.enemies.find((x) => !x.dead);
    if (e) {
      const [sx, sy] = g.camera.worldToScreen(e.cx, e.cy);
      g.input.mouseX = sx; g.input.mouseY = sy;
    }
    const target = g.entities.enemies[0];
    if (!target || target.dead || waited > 8000) {
      clearInterval(t);
      resolve({
        killed: !target || target.dead,
        hp: target ? target.hp : 0,
        playerHp: g.player.hp,
        dmgNumbers: g.dmgNumbers.length,
      });
    }
  }, 100);
}));
await page.mouse.up();
console.log('COMBAT HIT:', JSON.stringify(hit));

// 等掉落（凝胶）被拾取
await new Promise((r) => setTimeout(r, 2000));
const loot = await page.evaluate(() => {
  const g = window.__swGame;
  const inv = {};
  for (const s of g.player.inv.slots) if (s) inv[s.id] = (inv[s.id] || 0) + s.stack;
  return { inv, drops: g.entities.drops.length };
});
console.log('LOOT:', JSON.stringify(loot)); // 期望 id 12 (gel) 出现

// 玩家受伤测试：生成僵尸贴脸
await page.evaluate(() => {
  const g = window.__swGame;
  g.spawnEnemy('zombie', g.player.cx + 14, g.player.cy);
});
const hurt = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  let waited = 0;
  const t = setInterval(() => {
    waited += 200;
    if (g.player.hp < 100 || waited > 4000) {
      clearInterval(t);
      resolve({ hp: g.player.hp, iframes: g.player.iframes });
    }
  }, 200);
}));
console.log('PLAYER HURT:', JSON.stringify(hurt));

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO ERRORS');
await browser.close();
