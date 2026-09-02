// 朝左持弓镜像验证:瞄准左上蓄力,截帧看载体弓是否 rotate(π)+水平镜像（弓背向左）
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_phantasm-lean-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5216', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 700));
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const py = Math.floor(g.world.groundLevel) - 40;
  for (let dx = -90; dx <= 130; dx++) for (let dy = -40; dy <= 2; dy++) {
    st.setTile(px0 + dx, py + dy, 0);
    st.liquid[st.idx(px0 + dx, py + dy)] = 0;
  }
  for (let dx = -90; dx <= 130; dx++) st.setTile(px0 + dx, py + 3, 2);
  g.player.x = px0 * 16; g.player.y = (py - 3) * 16;
  try { g.entities.enemies.length = 0; } catch { /* ignore */ }
  const findKey = (vid) => Object.keys(window.__swItems).find((k) => new RegExp(`^vi_${vid}_`).test(k)) ?? null;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const ammoDefIdxByAmmoId = (ammoId) => {
    let byVid = -1;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      const d = ITEM_DEFS[i];
      const vid = d?.vid ?? (d?.key ? Number(String(d.key).match(/^vi_(\d+)_/)?.[1] ?? -1) : -1);
      if ((d?.ammoId ?? -1) === ammoId) return i;
      if (byVid < 0 && vid === ammoId) byVid = i;
    }
    return byVid;
  };
  for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: window.__swItems[findKey(3540)], stack: 1 };
  g.player.inv.slots[54] = { id: ammoDefIdxByAmmoId(40), stack: 999 };
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  g.entities.projectiles.length = 0;
  g.cb.onInventoryChanged();
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  // 瞄准左上
  g.input.mouseX = 640 - 240; g.input.mouseY = 400 - 240;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let t = 0; t < 30; t++) g.fixedUpdate(1 / 60);
  window.__lean = {
    facing: g.player.facing,
    carrier: (() => { const c = g.entities.projectiles.find((q) => q.projId === 630);
      return c ? { vx: +c.vx.toFixed(1), vy: +c.vy.toFixed(1),
        d: +Math.hypot(c.cx - g.player.cx, c.cy - g.player.cy).toFixed(1) } : null; })(),
    arrows: g.entities.projectiles.filter((q) => q.projId !== 630 && !q.dead)
      .map((q) => ({ vx: +q.vx.toFixed(1), vy: +q.vy.toFixed(1) })).slice(0, 4),
  };
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: './shots/phantasm-left-aim.png' });
console.log(JSON.stringify(await page.evaluate(() => window.__lean)));
console.log('页面异常:', errors.slice(0, 3));
await browser.close();
