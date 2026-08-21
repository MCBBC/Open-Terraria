// 训练假人 vs 子弹:霰弹枪(Onyx Blaster 575/凤凰 534 等)射假人应命中。
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
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  // 假人
  const dummy = Enemy.fromVanilla(488, pl.x + 120, pl.y - 10);
  dummy.id = g.entities.nextId++; g.entities.add(dummy, 'enemies');
  await new Promise((r) => setTimeout(r, 300));
  // 找一把霰弹枪(Onyx Blaster 575 / Shotgun 534)与火枪子弹 97
  const shotgun = idOf(/^vi_575_/) >= 0 ? idOf(/^vi_575_/) : idOf(/^vi_534_/);
  const bullet = idOf(/^vi_97_/);
  const results = { shotgun, bullet, dummyId: dummy.id };
  if (shotgun < 0 || bullet < 0) { results.err = 'gun/bullet missing'; return results; }
  pl.inv.slots[pl.inv.selected] = { id: shotgun, stack: 1 };
  pl.inv.slots[54] = { id: bullet, stack: 999 };
  g.cb.onInventoryChanged();
  const hpShake0 = dummy.dummyShake;
  g.camera.x = dummy.cx; g.camera.y = dummy.cy;
  await new Promise((r) => setTimeout(r, 250));
  g.input.mouseX = g.renderer.canvas.width / 2; g.input.mouseY = g.renderer.canvas.height / 2;
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 600));
  g.input.mouseDown = false;
  results.shakeAfter = dummy.dummyShake;
  results.hitDir = dummy.dummyHitDir;
  // 弹幕列表
  results.projs = g.entities.projectiles.filter((p) => !p.dead).slice(0, 6).map((p) => ({ cls: p.constructor.name, pid: p.projId ?? null }));
  dummy.dead = true;
  return results;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
