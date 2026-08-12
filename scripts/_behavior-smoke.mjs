// 行为型配饰冒烟：多段跳/火箭靴/岩浆免疫/击退免疫/恐慌/落星（scripts/_behavior-smoke.mjs）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('行为测试');
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
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const res = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const out = {};
  // 传送到出生点下方干净地表
  const st = g.world.store;
  p.x = g.world.spawnX * 16; p.y = (g.world.spawnY - 4) * 16; p.vx = 0; p.vy = 0;

  // ===== 1. 多段跳（气球束 1164：Cloud+Sandstorm+Blizzard 三段）=====
  p.inv.armor[3] = { id: g.itemId('vi_1164_BundleofBalloons'), stack: 1 };
  out.jumpOpts = p.equipStats.jumpOpts;
  p.onGround = true;
  p.inputJump = true;
  p.fixedUpdate(1, g); // 地面帧：基础跳 + 段数重置
  out.afterBaseJumpVy = Math.round(p.vy);
  p.inputJump = false;
  p.vy = 0; // 模拟上升到顶点（vy 截断后悬停）
  p.inputJump = true;
  const jumpsBefore = p.extraJumps.length;
  for (let k = 0; k < 12; k++) p.fixedUpdate(1, g); // 走完 8 tick 冷却+再段
  out.cloudJumpConsumed = p.extraJumps.length < jumpsBefore;
  out.extraJumpsLeft = p.extraJumps.length;

  // ===== 2. 火箭靴（仙灵靴 3993 档 2）=====
  p.inv.armor[3] = null;
  p.inv.armor[4] = { id: g.itemId('vi_3993_FairyBoots'), stack: 1 };
  out.rocketBoots = p.equipStats.rocketBoots;
  p.onGround = true;
  p.rocketRelease = false;
  p.fixedUpdate(1, g); // 落地重置：units=7 + release=true
  out.rocketRefill = { units: p.rocketUnits, release: p.rocketRelease };
  p.onGround = false; p.vy = 2; p.inputJump = true;
  for (let k = 0; k < 10; k++) p.fixedUpdate(1, g);
  out.rocketFlying = { vy: Math.round(p.vy), units: p.rocketUnits };

  // ===== 3. 岩浆免疫（熔岩护身符 906：420t）=====
  p.inv.armor[4] = null;
  p.inv.armor[5] = { id: g.itemId('vi_906_LavaCharm'), stack: 1 };
  out.lavaMax = p.equipStats.lavaMax;
  out.lavaImmuneInit = p.lavaImmuneTicks; // 装上后由 fixedUpdate 离浆回满

  // ===== 4. 钴护盾击退免疫 =====
  p.inv.armor[6] = { id: g.itemId('vi_156_CobaltShield'), stack: 1 };
  p.hp = 100; p.iframes = 0; p.vx = 0;
  p.damage(10, p.cx - 100, 0);
  out.noKnockback = p.vx === 0;

  // ===== 5. 恐慌项链（受击移速）=====
  p.inv.armor[7] = { id: g.itemId('vi_1290_PanicNecklace'), stack: 1 };
  p.hp = 100; p.iframes = 0;
  p.damage(10, 0, 0, false);
  out.panicMoveMult = p.equipStats.moveMult;

  // ===== 6. 马掌摔伤免疫 =====
  p.inv.armor[8] = { id: g.itemId('vi_158_LuckyHorseshoe'), stack: 1 };
  out.noFallDmg = p.equipStats.noFallDmg;
  return out;
});
console.log('BEHAVIOR', JSON.stringify(res));
console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
await browser.close();
