// ★BJ371 截图伴跑——等 409 在视口内即时截图（旋转/尾迹/白底消没目视面）
// 运行：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj371-typhoon-shot.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = '/tmp/bj371';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR:', String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
const { freezeClock } = await import('../tools/probe/lib/clock.mjs');
await freezeClock(page, { tod: 0.5 });
await page.waitForFunction(() => {
  const g = window.__swGame;
  return g.world && g.world.store && g.world.store.w === 4200;
}, { timeout: 300000 });

await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const c0 = Math.trunc(4200 * 8);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  p.statMana = p.statManaMax = p.statManaMax2 = 800;
  const key2622 = Object.keys(window.__swItems).find((k) => /^vi_2622_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key2622], stack: 999 };
  p.inv.selected = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
});

for (let round = 0; round < 4; round++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    const ang = (-35 - Math.random() * 25) * Math.PI / 180;    // 右上仰射
    const wx = p.cx + Math.cos(ang) * 300, wy = p.cy + Math.sin(ang) * 300;
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseDown = true;
  });
  try {
    await page.waitForFunction(() => {
      const g = window.__swGame;
      const q = g.entities.projectiles.find((e) => e.projId === 409 && !e.dead);
      if (!q) return false;
      const [sx, sy] = g.camera.worldToScreen(q.cx, q.cy);
      return sx > 260 && sx < 1020 && sy > 120 && sy < 560;
    }, { timeout: 8000, polling: 16 });
    await new Promise((r) => setTimeout(r, 60));
    await page.screenshot({ path: `${OUT}/typhoon-live-${round}.png` });
    console.log('shot', round);
  } catch { console.log('shot', round, 'missed'); }
  await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
  await new Promise((r) => setTimeout(r, 900));
}
await browser.close();
console.log('done');
