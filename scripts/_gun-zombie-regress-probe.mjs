// 回归:修复 tile 门后普通怪(僵尸,站空气中)枪击命中正常
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
  const st = g.world.store;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  // 铲平场地
  const tx = Math.floor(pl.cx / 16) + 6;
  const ty = Math.floor((pl.y + pl.h) / 16) + 2;
  const DIRT = window.__swTileByKey('v_2_dirt') ?? 1;
  for (let x = tx - 12; x <= tx + 12; x++) {
    for (let y = ty - 8; y < ty; y++) st.setTile(x, y, 0);
    st.setTile(x, ty, DIRT);
  }
  // 生成僵尸(站平台上)
  const z = Enemy.fromVanilla(3, tx * 16 + 8, ty * 16 - 50);
  if (!z) return { err: 'no zombie' };
  z.x = tx * 16 + 8 - z.w / 2; z.y = ty * 16 - z.h;
  g.entities.add(z, 'enemies');
  await new Promise((r) => setTimeout(r, 300));
  const hp0 = z.hp;
  // 玩家传送到位+瞄准
  pl.x = z.cx - 130 - pl.w / 2; pl.y = z.cy - pl.h / 2; pl.vx = 0; pl.vy = 0;
  const shotgun = idOf(/^vi_534_/) >= 0 ? idOf(/^vi_534_/) : idOf(/^vi_575_/);
  const bullet = idOf(/^vi_97_/);
  pl.inv.slots[pl.inv.selected] = { id: shotgun, stack: 1 };
  pl.inv.slots[54] = { id: bullet, stack: 999 };
  g.cb.onInventoryChanged();
  await new Promise((r) => setTimeout(r, 1200));
  const [mx, my] = g.camera.worldToScreen(z.cx, z.cy);
  g.input.mouseX = mx; g.input.mouseY = my;
  g.input.mouseDown = true;
  let hit = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 60));
    if (z.hp < hp0 || z.dead) { hit = true; break; }
  }
  g.input.mouseDown = false;
  return { hit, hp0, hp1: z.hp, dead: z.dead, iframes: z.iframes };
});
console.log(JSON.stringify(out));
await browser.close();
