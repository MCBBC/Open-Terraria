// BJ351 探针 D：破不变式态（旧档/F6 同构：塔在场 + lunarEvent.active=false）实机验证——
//  D1 每帧回填：active/towerActive/盾满 恢复触发终态。
//  D2 四塔击杀 → doom 落地（cd=3600 + misc[52]「月亮末日慢慢逼近……」）。
//  D3 倒计时快进 → 398 月总召出 + 占 Boss 槽。
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj351-anomaly-verify.mjs
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
await page.goto(ORIGIN + '/?play=small&bj351d' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  g.player.maxHp = 1e6; g.player.hp = 1e6;
  g.triggerLunarApocalypse();
});
await wait(500);

console.log('--- 破不变式：塔在场 + active=false（旧档/F6 同构）---');
await page.evaluate(() => {
  const g = window.__swGame;
  const le = g.world.lunarEvent;
  le.active = false;
  g.world.flags.lunarApocalypseUp = false;
});
await wait(400);   // ≥24 tick：每帧 updateLunarApocalypse → 回填
const d1 = await page.evaluate(() => {
  const g = window.__swGame;
  const le = g.world.lunarEvent;
  return {
    active: le.active,
    towerActive: { ...le.towerActive },
    shield: { ...le.shield },
    flagsUp: !!g.world.flags.lunarApocalypseUp,
  };
});
console.log('D1 回填态:', JSON.stringify(d1));
const s1 = d1.active && Object.values(d1.towerActive).every(Boolean)
  && Object.values(d1.shield).every((v) => v === 100) && d1.flagsUp;

console.log('--- D2 清盾+杀四塔（拍间等待）---');
await page.evaluate(() => {
  const le = window.__swGame.world.lunarEvent;
  le.shield.solar = le.shield.vortex = le.shield.nebula = le.shield.stardust = 0;
});
await wait(300);
await page.evaluate(() => {
  const g = window.__swGame;
  for (const e of g.entities.enemies) {
    if (!e.dead && [517, 422, 507, 493].includes(e.vanillaId)) {
      try { e.hurt(1e9, 0, 0, g, 0, false, 1, true); } catch { /* ignore */ }
    }
  }
});
await wait(4000);
const d2 = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    active: g.world.lunarEvent.active,
    cd: g.world.lunarEvent.moonLordCountdown,
    towers: g.entities.enemies.filter((e) => !e.dead && [517, 422, 507, 493].includes(e.vanillaId)).length,
    flags: ['Solar', 'Vortex', 'Nebula', 'Stardust'].filter((k) => g.world.flags['downedTower' + k]).join('+'),
    misc52: window.__texts.filter((t) => t[0] === '月亮末日慢慢逼近……').length,
  };
});
console.log('D2 doom 态:', JSON.stringify(d2));
const s2 = d2.active === false && d2.cd > 0 && d2.cd <= 3600 && d2.towers === 0
  && d2.flags === 'Solar+Vortex+Nebula+Stardust' && d2.misc52 >= 1;

console.log('--- D3 倒计时快进 → 398 ---');
await page.evaluate(() => { window.__swGame.world.lunarEvent.moonLordCountdown = 30; });
await wait(1500);
const d3 = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    ml: g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 398).length,
    bossVid: g.boss ? g.boss.vanillaId : null,
  };
});
console.log('D3:', JSON.stringify(d3));
const s3 = d3.ml >= 1 && d3.bossVid === 398;

console.log('--- 判定 ---');
console.log(`D1 不变式回填:          ${s1 ? 'PASS' : 'FAIL'}`);
console.log(`D2 四塔灭→doom+misc52:  ${s2 ? 'PASS' : 'FAIL'}`);
console.log(`D3 倒计时归零召 398:    ${s3 ? 'PASS' : 'FAIL'}`);
console.log('pageerrors:', errors.length, errors.slice(0, 3));
await browser.close();
process.exit(s1 && s2 && s3 ? 0 : 4);
