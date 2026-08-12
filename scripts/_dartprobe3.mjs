// 弹幕探针2:诊断哈比为何不射击(ai0/canSee/位置)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let r = null;
for (let att = 0; att < 12 && r === null; att++) {
  try {
    await page.goto('http://localhost:5377/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
    r = await page.evaluate(() => new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (window.__swGame?.player && window.__swGame.entities) {
          clearInterval(iv);
          const g = window.__swGame;
          const p = g.player;
          const shell = g.spawnEnemy('slime_green', -9999, -9999);
          const EnemyCls = shell?.constructor;
          shell.dead = true;
          const harpy = EnemyCls.fromVanilla(48, p.cx - 200, p.cy - 20);
          g.entities.add(harpy, 'enemies');
          const shots = [];
          const oa = g.entities.add.bind(g.entities);
          g.entities.add = (e, b) => { if (b === 'projectiles') shots.push([e.constructor?.name, e.projId, Object.keys(e).slice(0,12), e.w, e.h, e.life]); return oa(e, b); };
          setTimeout(() => {
            g.entities.add = oa;
            res(JSON.stringify({
              ai0: harpy.ai0, dead: harpy.dead,
              hp: harpy.hp, x: Math.round(harpy.x), y: Math.round(harpy.y),
              px: Math.round(p.x), py: Math.round(p.y),
              see: harpy.canSeePlayer ? harpy.canSeePlayer(g.world.store, p) : 'no-method',
              vanilla: !!harpy.vanilla, aiStyle: harpy.vanilla?.aiStyle,
              shots: shots.slice(0, 10),
              solidAtHarpy: g.world.store.isSolid(Math.floor(harpy.cx / 16), Math.floor(harpy.cy / 16)),
            }));
          }, 2500);
        } else if (Date.now() - t0 > 60000) { clearInterval(iv); res('timeout'); }
      }, 300);
    }));
  } catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
console.log(r);
await browser.close();
