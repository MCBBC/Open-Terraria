// 石巨人本体死亡 → 头/拳联动自灭 探针(用户报"本体死头悬空+血条还在")。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  // 生成石巨人本体(部件自动生成)
  const body = g.spawnNpcByVanilla(245, pl.x / 16 + 8, pl.y / 16 - 2);
  if (!body) return { err: 'spawn 245 fail' };
  await new Promise((r) => setTimeout(r, 300));
  const fam = () => (g.entities.enemies || []).filter((n) => !n.dead && [245,246,247,248,249].includes(n.vanillaId));
  const fam0 = fam().map((n) => ({ vid: n.vanillaId, hp: n.hp, ai3: n.ai3, dont: n.dontTakeDamage }));
  // 场景A:直接杀本体(模拟用户绕过无敌?先解除 dontTakeDamage 模拟头已失)
  body.dontTakeDamage = false;
  body.hurt(99999, 1, 0, g);
  await new Promise((r) => setTimeout(r, 600));
  const famA = fam().map((n) => ({ vid: n.vanillaId, hp: n.hp, ai3: n.ai3 }));
  // 场景B:头转自由态后杀本体
  const body2 = g.spawnNpcByVanilla(245, pl.x / 16 + 16, pl.y / 16 - 2);
  await new Promise((r) => setTimeout(r, 300));
  const head2 = fam().find((n) => n.vanillaId === 246);
  if (head2) { head2.hp = 1; head2.hurt(9999, 1, 0, g); }   // 打头 → 转自由
  await new Promise((r) => setTimeout(r, 200));
  const midState = fam().map((n) => ({ vid: n.vanillaId, hp: n.hp, ai3: n.ai3, dont: n.dontTakeDamage }));
  if (body2) { body2.dontTakeDamage = false; body2.hurt(99999, 1, 0, g); }
  await new Promise((r) => setTimeout(r, 600));
  const famB = fam().map((n) => ({ vid: n.vanillaId, hp: n.hp, ai3: n.ai3 }));
  return { fam0, afterKillBody_A: famA, midState_B: midState, afterKillBody_B: famB,
    bossRef: g.boss ? { vid: g.boss.vanillaId, dead: g.boss.dead, hp: g.boss.hp } : null };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
