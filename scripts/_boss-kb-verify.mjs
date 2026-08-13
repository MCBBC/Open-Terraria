// 一次性验证:boss(EoC)击退免疫——def.knockbackResist 应为 0,受击后 vx 不变
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=500000 scripts/_boss-kb-verify.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  g.debugSpawnNpc(4, 1, false);
  await new Promise((r) => setTimeout(r, 500));
  const eye = g.entities.all().filter((e) => e.vanillaId === 4).pop();
  if (!eye) return { err: 'no eye' };
  const kbBefore = eye.def.knockbackResist;
  const vx0 = eye.vx, vy0 = eye.vy;
  // 直接 hurt:铜短剑量级 imp(伤害 7、kb 4 的一次武器打击路径 kby=0)
  eye.hurt?.(7, 4, 0, g);
  await new Promise((r) => setTimeout(r, 200));
  return {
    kb: kbBefore, boss: !!eye.def.boss,
    vxBefore: +vx0.toFixed(2), vxAfter: +eye.vx.toFixed(2),
    vyBefore: +vy0.toFixed(2), vyAfter: +eye.vy.toFixed(2),
    hp: eye.hp,
  };
});
console.log(JSON.stringify(out));
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
