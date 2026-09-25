// BJ351 探针 C：修正拍间等待后全链验证——清盾→等 tick(dTD 重算)→hurt→演出→自毁→
// 死亡管线→onTowerKilled→doom→倒计时→398。逐拍采样 ai1/ai2/dead/flags。
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj351-chain-full.mjs
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
await page.goto(ORIGIN + '/?play=small&bj351c' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
console.log('booted, pageerrors:', errors.length);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.evaluate(() => {
  const g = window.__swGame;
  window.__texts = [];
  const orig = g.newText.bind(g);
  g.newText = (t, r, gg, b) => { window.__texts.push([t, r, gg, b]); return orig(t, r, gg, b); };
  g.player.maxHp = 1e6; g.player.hp = 1e6;   // 防 398 出场杀玩家
  g.triggerLunarApocalypse();
});
await wait(500);

console.log('=== 1. 清盾 + 等 300ms（≥18 tick dTD 重算）===');
await page.evaluate(() => {
  const le = window.__swGame.world.lunarEvent;
  le.shield.solar = le.shield.vortex = le.shield.nebula = le.shield.stardust = 0;
});
await wait(300);
const pre = await page.evaluate(() => {
  const g = window.__swGame;
  return g.entities.enemies.filter((e) => [517, 422, 507, 493].includes(e.vanillaId))
    .map((e) => ({ vid: e.vanillaId, dTD: !!e.dontTakeDamage, hp: Math.round(e.hp) }));
});
console.log('hurt 前 dTD:', JSON.stringify(pre));

console.log('=== 2. 逐塔 hurt(1e9) → 应转 ai2=1 演出 ===');
await page.evaluate(() => {
  const g = window.__swGame;
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

console.log('=== 3. 演出期逐拍采样（ai1 → 180 自毁）===');
for (let i = 0; i < 7; i++) {
  await wait(600);
  const st = await page.evaluate(() => {
    const g = window.__swGame;
    const tw = g.entities.enemies.filter((e) => [517, 422, 507, 493].includes(e.vanillaId));
    return {
      towers: tw.map((e) => ({ vid: e.vanillaId, dead: e.dead, ai1: Math.round(e.ai1), ai2: e.ai2 })),
      active: g.world.lunarEvent.active,
      cd: g.world.lunarEvent.moonLordCountdown,
      flags: ['Solar', 'Vortex', 'Nebula', 'Stardust'].filter((k) => g.world.flags['downedTower' + k]).join('+') || 'none',
    };
  });
  console.log(`@+${(i + 1) * 600}ms:`, JSON.stringify(st));
  if (st.cd > 0 || st.active === false) break;
}

console.log('=== 4. 终态 + 倒计时快进 ===');
await page.evaluate(() => { window.__swGame.world.lunarEvent.moonLordCountdown = 40; });
await wait(1500);
const fin = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    ml: g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 398).length,
    bossVid: g.boss ? g.boss.vanillaId : null,
    cd: g.world.lunarEvent.moonLordCountdown,
    texts: window.__texts,
  };
});
console.log('终态:', JSON.stringify(fin));
console.log('pageerrors:', errors.length, errors.slice(0, 3));
await browser.close();
