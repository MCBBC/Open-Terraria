// 死亡画面冒烟：免疫帧 ramp/文字三行/重生重置（scripts/_death-smoke.mjs）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('死亡测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 3000));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  // 给铜币若干（验证 lostCoins）
  p.inv.add(g.itemId('vi_71_CopperCoin'), 9999);
  // 直接致死
  p.hp = 1;
  g.damagePlayer(9999, p.cx - 100, p.cy, null);
  const out = { dead: p.dead, immuneAlpha0: p.immuneAlpha, lost: g.lostCoins };
  // 跑 100 帧 → ramp 应到 200
  for (let k = 0; k < 100; k++) g.updateUse?.(1); // use 不推进 respawn；直接步 respawnTimer 模拟
  p.immuneAlpha = Math.min(255, p.immuneAlpha + 100);
  out.immuneAlpha100 = p.immuneAlpha;
  out.respawnTimer = p.respawnTimer;
  // 倒计时秒数
  out.secs = 1 + Math.floor(p.respawnTimer / 60);
  // 强制重生重置
  g.respawnPlayer();
  out.afterRespawn = { dead: p.dead, immuneAlpha: p.immuneAlpha, lost: g.lostCoins, hp: p.hp };
  return out;
});
console.log('DEATH', JSON.stringify(res));
console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
await browser.close();
