// 秃鹫行为探针:远离玩家处生成 61,追踪 ai0/位置;再模拟玩家靠近观察唤醒
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let ok = false;
for (let att = 0; att < 12 && !ok; att++) {
  try {
    await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const r = await page.evaluate(() => new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(async () => {
        if (window.__swGame?.player) {
          clearInterval(iv);
          const g = window.__swGame;
          const { Enemy } = await import('/src/entities/Enemy.ts');
          const st = g.world.store;
          // 平沙台 + 玩家远处
          const STONE = g.tileByKey['stone'];
          for (let x = 60; x < 120; x++) g.world.store.setTile(x, 200, STONE, 0, 0);
          g.player.x = 60 * 16; g.player.y = 198 * 16; g.player.vx = 0; g.player.vy = 0;
          const v = Enemy.fromVanilla(61, 100 * 16, 200 * 16);
          v.y = 200 * 16 - v.h;
          g.entities.add(v, 'enemies');
          res('ok');
        } else if (Date.now() - t0 > 120000) { clearInterval(iv); res('timeout'); }
      }, 300);
    }));
    console.log('setup:', r);
    ok = true;
  } catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }
const sample = async (ms) => {
  await new Promise((r2) => setTimeout(r2, ms));
  return page.evaluate(() => {
    const g = window.__swGame;
    const v = g.entities.enemies.find((e) => e.vanillaId === 61);
    return v ? { ai0: v.ai0, x: Math.round(v.x), y: Math.round(v.y), vx: +v.vx.toFixed(2), vy: +v.vy.toFixed(2), onGround: v.onGround } : 'gone';
  });
};
console.log('远离玩家 2s:', JSON.stringify(await sample(2000)));
console.log('远离玩家 4s:', JSON.stringify(await sample(2000)));
await page.evaluate(() => { const g = window.__swGame; g.player.x = 99 * 16; g.player.y = 198 * 16; });
console.log('玩家靠近 1s:', JSON.stringify(await sample(1000)));
console.log('玩家靠近 2s:', JSON.stringify(await sample(1000)));
await browser.close();
