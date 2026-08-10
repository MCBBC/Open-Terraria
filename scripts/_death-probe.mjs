import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?play=small&d2=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.lastDamageCause = { kind: 'lava' };
  g.player.hp = 0;
  g.player.dead = true;
});
// 每秒采样墓碑状态
const trace = [];
for (let i = 0; i < 7; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await page.evaluate(() => {
    const g = window.__swGame;
    const t = g.entities.props[0];
    if (!t) return { gone: true, signs: g.world.signs.length };
    const st = g.world.store;
    const bx = Math.floor((t.x + t.w / 2) / 16), by = Math.floor((t.y + t.h - 4) / 16);
    const cell = (x, y) => (st.inBounds(x, y) ? { a: st.isActive(x, y), s: st.isSolid(x, y) } : null);
    return {
      x: Math.round(t.x), y: Math.round(t.y), vx: +t.vx.toFixed(2), vy: +t.vy.toFixed(2),
      onGround: t.onGround, angle: +t.angle.toFixed(2), style: t.style,
      bx, by,
      cells: {
        tl: cell(bx, by - 1), tr: cell(bx + 1, by - 1),
        bl: cell(bx, by), br: cell(bx + 1, by),
        gl: cell(bx, by + 1), gr: cell(bx + 1, by + 1),
      },
      signs: g.world.signs.length,
    };
  }).catch((e) => ({ err: e.message }));
  trace.push(s);
}
await page.screenshot({ path: 'shots/death-debug.png' });
console.log(JSON.stringify({ trace, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
