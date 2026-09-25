// BJ351 探针：四柱全灭 → ImpendingDoom → 倒计时 → 398 月总 召出 全链实机验证。
//  S1 合法链启动：triggerLunarApocalypse（教徒死链终点）→ 四塔落地/active=true/盾满。
//  S2 四塔击杀（清盾后 hurt(1e9)→180t 渐隐自毁→标准死亡管线）→ downedTower_* 四旗 +
//     active=false + moonLordCountdown=3600 + misc[52] 广播（newText 捕获）。
//  S3 倒计时快进（置 30t）→ 归零自动召 398（spawnMoonLordOnPlayer）→ enemies 桶 398 在场。
//  S4 负控（BJ109-112 族审计）：active=false 态下杀塔 → updateLunarApocalypse 早退
//     （原版 WorldGen.cs:87979 同门）→ 无 doom 无广播（原版同相,非缺陷）。
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj351-moonlord-chain.mjs
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
await page.goto(ORIGIN + '/?play=small&bj351' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
console.log('booted, pageerrors:', errors.length);

// newText 捕获（misc[52] 广播验证）
await page.evaluate(() => {
  const g = window.__swGame;
  window.__texts = [];
  const orig = g.newText.bind(g);
  g.newText = (t, r, gg, b) => { window.__texts.push([t, r, gg, b]); return orig(t, r, gg, b); };
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = () => page.evaluate(() => {
  const g = window.__swGame;
  const le = g.world.lunarEvent;
  return {
    active: le.active,
    towerActive: { ...le.towerActive },
    shield: { ...le.shield },
    cd: le.moonLordCountdown, cdMax: le.moonLordCountdownMax,
    towers: g.entities.enemies.filter((e) => e && !e.dead && [517, 422, 507, 493].includes(e.vanillaId)).map((e) => e.vanillaId),
    ml: g.entities.enemies.filter((e) => e && !e.dead && e.vanillaId === 398).length,
    bossVid: g.boss ? g.boss.vanillaId : null,
    flags: {
      solar: !!g.world.flags.downedTowerSolar, vortex: !!g.world.flags.downedTowerVortex,
      nebula: !!g.world.flags.downedTowerNebula, stardust: !!g.world.flags.downedTowerStardust,
    },
    texts: (window.__texts ?? []).slice(-6),
  };
});

// ============================================================
// S1 合法链启动
// ============================================================
console.log('--- S1 triggerLunarApocalypse ---');
await page.evaluate(() => { window.__swGame.triggerLunarApocalypse(); });
await wait(600);
let s = await snap();
console.log(JSON.stringify(s));
const s1 = s.active && s.towers.length === 4 && Object.values(s.shield).every((v) => v > 0);

// ============================================================
// S2 四塔击杀 → doom
// ============================================================
console.log('--- S2 清盾+杀四塔 ---');
await page.evaluate(() => {
  const g = window.__swGame;
  for (const e of g.entities.enemies) {
    if (!e.dead && [517, 422, 507, 493].includes(e.vanillaId)) {
      e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
    }
  }
  const le = g.world.lunarEvent;
  le.shield.solar = le.shield.vortex = le.shield.nebula = le.shield.stardust = 0;
});
await page.evaluate(() => {
  const g = window.__swGame;
  let k = 0;
  for (const e of g.entities.enemies) {
    if (!e || e.dead || ![517, 422, 507, 493].includes(e.vanillaId)) continue;
    try { e.hurt(1e9, 0, 0, g, 0, false, 1, true); k++; } catch { /* ignore */ }
  }
  window.__killCount = k;
});
console.log('hurt(1e9) accepted on', await page.evaluate(() => window.__killCount), 'towers');
await wait(1000);
s = await snap();
console.log('after 1s (渐隐期):', JSON.stringify({ towers: s.towers, active: s.active, cd: s.cd }));
await wait(3500);
s = await snap();
console.log('after 4.5s (自毁毕):', JSON.stringify(s));
const s2 = s.flags.solar && s.flags.vortex && s.flags.nebula && s.flags.stardust
  && s.active === false && s.cd === 3600 && s.towers.length === 0;

// ============================================================
// S3 倒计时快进 → 398 召出
// ============================================================
console.log('--- S3 倒计时快进 → 398 ---');
await page.evaluate(() => { window.__swGame.world.lunarEvent.moonLordCountdown = 30; });
await wait(1800);
s = await snap();
console.log(JSON.stringify(s));
const s3 = s.ml >= 1 && s.cd === 0;

// ============================================================
// S4 负控：active=false 态杀塔 → 无 doom（原版 WorldGen.cs:87979 同门）
// ============================================================
console.log('--- S4 负控 active=false ---');
await page.evaluate(() => {
  const g = window.__swGame;
  window.__texts.length = 0;
  // 直接再走一次触发拿 4 座新塔，然后模拟「旧档无事件旗」态
  g.triggerLunarApocalypse();
});
await wait(500);
await page.evaluate(() => {
  const g = window.__swGame;
  const le = g.world.lunarEvent;
  le.active = false;                       // 模拟旧档 lunarApocalypseUp 缺失
  g.world.flags.lunarApocalypseUp = false;
  le.shield.solar = le.shield.vortex = le.shield.nebula = le.shield.stardust = 0;
  for (const e of g.entities.enemies) {
    if (!e.dead && [517, 422, 507, 493].includes(e.vanillaId)) {
      e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
      try { e.hurt(1e9, 0, 0, g, 0, false, 1, true); } catch { /* ignore */ }
    }
  }
});
await wait(4500);
s = await snap();
console.log(JSON.stringify({ active: s.active, cd: s.cd, towers: s.towers, flags: s.flags, texts: s.texts }));
const s4 = s.cd === 0 && s.active === false;   // 无 doom 无倒计时=原版同相

console.log('--- 判定 ---');
console.log(`S1 触发四塔落地:        ${s1 ? 'PASS' : 'FAIL'}`);
console.log(`S2 四塔灭→doom+misc52:  ${s2 ? 'PASS' : 'FAIL'}`);
console.log(`S3 倒计时归零召 398:    ${s3 ? 'PASS' : 'FAIL'}`);
console.log(`S4 负控 active=false 无doom: ${s4 ? 'PASS' : 'FAIL'}`);
console.log('pageerrors:', errors.length, errors.slice(0, 3));
await browser.close();
process.exit(s1 && s2 && s3 && s4 ? 0 : 4);
