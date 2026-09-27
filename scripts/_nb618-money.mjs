// ★Ring3 定格照：617+618 蜂群同屏（斜下掷弹→落地反弹驻屏）四连拍。
// 运行：SW_ORIGIN=http://localhost:5238 node tools/run-diag.mjs scripts/_nb618-money.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1800, height: 900 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[money] pageerror', String(e.message).slice(0, 160)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5238', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('nb618money', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  let col0 = -1, gy = -1;
  for (let c = 100; c < st.w - 200; c++) {
    let y0 = -1;
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c, y)) { y0 = y; break; } }
    if (y0 < 0) continue;
    let flat = true;
    for (let k = 1; k <= 24; k++) {
      let yy = -1;
      for (let y = Math.max(1, y0 - 3); y < y0 + 4; y++) { if (st.isSolid(c + k, y)) { yy = y; break; } }
      if (yy !== y0) { flat = false; break; }
    }
    if (flat) { col0 = c; gy = y0; break; }
  }
  if (col0 < 0) return { fail: 'no-flat-ground' };
  p.x = col0 * 16; p.y = gy * 16 - p.h; p.vx = 0; p.vy = 0;
  g.world.clock.timeOfDay = 0.85;   // 夜（辉光尘更醒目）
  p.baseMaxMana = 2000; p.mana = 2000;
  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  p.inv.slots[0] = { id: items[key3476], stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  return { col0, gy };
});
console.log('[money] setup', JSON.stringify(setup));
if (setup.fail) { await browser.close(); process.exit(1); }

// 单发斜下 → 落地反弹驻屏；t≈1.0/2.0/3.2/4.4s 四连拍
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const aimX = p.cx + 200, aimY = p.cy - 6;
  const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  p.mana = 4000; p.baseMaxMana = 4000;
  g.input.mouseHeld = true;   // 连发列车:每 0.5s 一球,蜂群纵队
});
const shots = [[1500, 'money-1'], [2500, 'money-2'], [3500, 'money-3'], [5000, 'money-4'], [6500, 'money-5']];
let prev = 0;
for (const [t, name] of shots) {
  await new Promise((r) => setTimeout(r, t - prev)); prev = t;
  const snap = await page.evaluate(() => {
    const g = window.__swGame;
    const w2s = (wx, wy) => g.camera.worldToScreen(wx, wy);
    const c617 = g.entities.projectiles.filter((q) => q.projId === 617 && !q.dead);
    const c618 = g.entities.projectiles.filter((q) => q.projId === 618 && !q.dead);
    const onScreen = c618.filter((q) => { const [sx, sy] = w2s(q.cx, q.cy); return sx > 0 && sx < 1800 && sy > 0 && sy < 900; }).length;
    return {
      n617: c617.length, n618: c618.length, onScreen618: onScreen, orbScreen: c617.map((q)=>{const [sx,sy]=w2s(q.cx,q.cy); return [Math.round(sx),Math.round(sy)];}).filter(([sx,sy])=>sx>0&&sx<1800&&sy>0&&sy<900),
      orb0: c617[0] ? [Math.round(c617[0].cx), Math.round(c617[0].cy), +Math.hypot(c617[0].vx, c617[0].vy).toFixed(1)] : null,
    };
  });
  console.log(`[money] ${name} t=${t}ms`, JSON.stringify(snap));
  await page.screenshot({ path: `/tmp/nb618-${name}.png` });
  if (name === 'money-3') { await page.evaluate(() => { window.__swGame.input.mouseHeld = false; }); }
}
console.log('[money] saved /tmp/nb618-money-1..4.png');
await browser.close().catch(() => {});
process.exit(0);
