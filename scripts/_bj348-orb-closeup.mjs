// ★BJ348 特写探针——617 球体飞行/蓄能两相特写 + 持械观感
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj348-orb-closeup.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('bj348b', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  // 站平地（找宽 60 格平段）
  let col0 = -1, gy = -1;
  for (let c = 100; c < st.w - 200; c++) {
    let y0 = -1;
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c, y)) { y0 = y; break; } }
    if (y0 < 0) continue;
    let flat = true;
    for (let k = 1; k <= 60; k++) {
      let yy = -1;
      for (let y = Math.max(1, y0 - 3); y < y0 + 4; y++) { if (st.isSolid(c + k, y)) { yy = y; break; } }
      if (yy !== y0) { flat = false; break; }
    }
    if (flat) { col0 = c; gy = y0; break; }
  }
  p.x = col0 * 16; p.y = gy * 16 - p.h; p.vx = 0; p.vy = 0;
  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  p.inv.slots[0] = { id: items[key3476], stack: 1 };
  p.inv.selected = 0;
  p.baseMaxMana = 400; p.mana = 400;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  window.__bj348state = { col0, gy };
});
console.log('[closeup] world ready', JSON.stringify(await page.evaluate(() => window.__bj348state)));

// 相机对准玩家（跟随默认）——直接对玩家右侧平射
const fireAndStep = async (ticks) => {
  await page.evaluate((ticks) => {
    const g = window.__swGame;
    const p = g.player;
    const aimX = p.cx + 260, aimY = p.cy - 8;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    p.mana = 400;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    for (let t = 0; t < ticks; t++) g.fixedUpdate(1 / 60);
    g.paused = true;   // 冻结 rAF 推进（绘制相仍渲染当前态）
  }, ticks);
};
// 相1：出手 24 拍（球 ~150px 外，满 alpha）
await fireAndStep(23);
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/sw-bj348-closeup-t24.png' });
// 相2：续推到蓄能相（总 240 拍，scale 1.3、618 火花在场）
await page.evaluate(() => {
  const g = window.__swGame;
  g.paused = false;
  const p = g.player;
  const o = g.entities.projectiles.find((q) => q.projId === 617);
  for (let t = 0; t < 216; t++) g.fixedUpdate(1 / 60);
  g.paused = true;
  window.__bj348t240 = o ? { dead: o.dead, sp: +Math.hypot(o.vx, o.vy).toFixed(2), scale: +o.drawScale.toFixed(3), x: Math.round(o.cx - p.cx) } : 'gone';
});
await new Promise((r) => setTimeout(r, 700));
console.log('[closeup] t240 orb', JSON.stringify(await page.evaluate(() => window.__bj348t240)));
await page.screenshot({ path: '/tmp/sw-bj348-closeup-t240.png' });
console.log('[closeup] pageerrors', pageErrors.length ? pageErrors.slice(0, 3) : 'none');
await browser.close().catch(() => {});
process.exit(0);
