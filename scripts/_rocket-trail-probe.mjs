// 火箭尾烟实机探针(2026-09-01 用户报"尾烟只有烟没有火"):
// 真世界生成 303 火箭(vx=12>8 速度门),步进 8 拍,断言 vanillaDust 池同时出现
// 尘 6 烟(scale×2+、noGravity)与尘 31 火(fadeIn 1-1.4、scale~0.5)。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!(window.__swGame?.world)) return { bootFail: true };
  await new Promise((r) => setTimeout(r, 1500));
  const g = window.__swGame;
  const { GrenadeProj } = await import('/src/entities/WeaponProj.ts');
  const X = (g.world.spawnX + 10) * 16, Y = (Math.floor(g.world.groundLevel) - 6) * 16;
  g.vanillaDust.pool.length = 0;
  // 玩家火箭发射器弹族:134 火箭 I(直飞无重力),onExplode 走 explodeAt 桩
  const d = new GrenadeProj(X, Y, 12, 0, 60, 3600, 134,
    () => {});
  d.fired = true;
  for (let i = 0; i < 8 && !d.dead; i++) d.fixedUpdate(1 / 60, g);
  let smoke = 0, flame = 0, flameFade = 0, smokeScale = 0, gravityFree = 0;
  for (const dd of g.vanillaDust.pool) {
    if (!dd.active) continue;
    if (dd.type === 6) { smoke++; smokeScale = Math.max(smokeScale, dd.scale); if (dd.noGravity) gravityFree++; }
    if (dd.type === 31) { flame++; flameFade = Math.max(flameFade, dd.fadeIn); }
  }
  return { smoke, flame, flameFade: +flameFade.toFixed(2), smokeScaleMax: +smokeScale.toFixed(2), gravityFree, vx: +d.vx.toFixed(2) };
});

console.log(JSON.stringify(out));
if (out.bootFail) { console.log('PROBE BLOCKED (worldgen)'); await browser.close(); process.exit(2); }
const ok = out.smoke > 0 && out.flame > 0 && out.flameFade >= 1 && out.flameFade <= 1.5
  && out.smokeScaleMax >= 2 && out.gravityFree > 0;
console.log(`smoke=${out.smoke}(scale_max=${out.smokeScaleMax},noGravity=${out.gravityFree}) flame=${out.flame}(fadeIn=${out.flameFade}) vx=${out.vx}`);
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
