// 假人命中隔离:单弹枪 vs 霰弹枪;并记录弹幕轨迹。
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
  const bullet = idOf(/^vi_97_/);   // 火枪子弹
  const mkDummy = (ox) => { const d = Enemy.fromVanilla(488, pl.x + ox, pl.y - 10); d.id = g.entities.nextId++; g.entities.add(d, 'enemies'); return d; };
  const results = {};
  // 测试函数:持枪射假人,记录弹幕与命中
  const test = async (gunId, name, ox) => {
    const dummy = mkDummy(ox);
    await new Promise((r) => setTimeout(r, 250));
    pl.inv.slots[pl.inv.selected] = { id: gunId, stack: 1 };
    pl.inv.slots[54] = { id: bullet, stack: 999 };
    g.cb.onInventoryChanged();
    g.camera.x = dummy.cx; g.camera.y = dummy.cy;
    await new Promise((r) => setTimeout(r, 250));
    g.input.mouseX = g.renderer.canvas.width / 2; g.input.mouseY = g.renderer.canvas.height / 2;
    const projs = [];
    const origPush = Array.prototype.push;
    g.input.mouseDown = true;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 60));
      for (const p of g.entities.projectiles) {
        if (!p.dead && !projs.find((q) => q.id === p.id)) {
          projs.push({ id: p.id, cls: p.constructor.name, pid: p.projId ?? null, x: Math.round(p.x - dummy.x), y: Math.round(p.y - dummy.y) });
        }
      }
      if (dummy.dummyShake > 0 || dummy.justHitT > 0) break;
    }
    g.input.mouseDown = false;
    results[name] = { shake: dummy.dummyShake, justHit: dummy.justHitT, projs };
    dummy.dead = true;
    await new Promise((r) => setTimeout(r, 200));
  };
  // 单弹手枪(219 复古手枪)
  await test(idOf(/^vi_219_/), 'pistol219', 120);
  // 霰弹枪(534 或 575)
  const sg = idOf(/^vi_534_/) >= 0 ? idOf(/^vi_534_/) : idOf(/^vi_575_/);
  if (sg > 0) await test(sg, 'shotgun', 120);
  return results;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
