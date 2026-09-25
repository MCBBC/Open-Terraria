// BJ351 探针 B：塔死亡演出细粒度状态追踪——ai1/ai2/iframes/dontTakeDamage 逐拍演化。
// 判别问题：hurt(1e9) 后塔是否进入 ai2=1 演出？ai1 是否在涨（towerAI 是否在 tick）？
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj351-tower-state.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
await page.goto(ORIGIN + '/?play=small&bj351b' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
console.log('booted, pageerrors:', errors.length);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.evaluate(() => { window.__swGame.triggerLunarApocalypse(); });
await wait(500);

const towerState = () => page.evaluate(() => {
  const g = window.__swGame;
  return g.entities.enemies
    .filter((e) => e && [517, 422, 507, 493].includes(e.vanillaId))
    .map((e) => ({
      vid: e.vanillaId, dead: e.dead, hp: Math.round(e.hp), maxHp: Math.round(e.maxHp),
      ai0: Math.round(e.ai0), ai1: Math.round(e.ai1), ai2: e.ai2, ai3: Math.round(e.ai3 ?? 0),
      ifr: e.iframes, dTD: !!e.dontTakeDamage,
      px: Math.round(e.cx / 16), playerPx: Math.round(g.player.cx / 16),
      dist: Math.round(Math.hypot(e.cx - g.player.cx, e.cy - g.player.cy)),
    }));
});

console.log('=== 塔初始态 ===');
console.log(JSON.stringify(await towerState(), null, 1));

console.log('=== 清盾+逐塔 hurt(1e9) ===');
await page.evaluate(() => {
  const g = window.__swGame;
  const le = g.world.lunarEvent;
  le.shield.solar = le.shield.vortex = le.shield.nebula = le.shield.stardust = 0;
  window.__hurtRes = [];
  for (const e of g.entities.enemies) {
    if (!e.dead && [517, 422, 507, 493].includes(e.vanillaId)) {
      try {
        const r = e.hurt(1e9, 0, 0, g, 0, false, 1, true);
        window.__hurtRes.push({ vid: e.vanillaId, ret: r, ai2: e.ai2, ai1: e.ai1, hp: Math.round(e.hp), ifr: e.iframes });
      } catch (err) { window.__hurtRes.push({ vid: e.vanillaId, err: String(err) }); }
    }
  }
});
console.log('hurt 返回:', JSON.stringify(await page.evaluate(() => window.__hurtRes)));

for (const ms of [500, 1000, 2000, 3500, 5000]) {
  await wait(ms === 500 ? 500 : 1500);
  const st = await towerState();
  console.log(`@+${ms}ms:`, JSON.stringify(st));
}

// 最终事件面
const fin = await page.evaluate(() => {
  const g = window.__swGame;
  const le = g.world.lunarEvent;
  return {
    active: le.active, cd: le.moonLordCountdown,
    flags: ['Solar', 'Vortex', 'Nebula', 'Stardust'].map((k) => 'downedTower' + k + '=' + !!g.world.flags['downedTower' + k]).join(','),
    enemiesTotal: g.entities.enemies.length,
  };
});
console.log('终态:', JSON.stringify(fin));
console.log('pageerrors:', errors.length, errors.slice(0, 3));
await browser.close();
