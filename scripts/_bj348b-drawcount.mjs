// ★BJ348b drawImage 计数探针——直接观测主 ctx 每帧绘制调用数（物块/NPC 消失
// = tile 绘制调用骤降的可编程观测）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5213', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('bj348bc', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  let groundY = -1;
  const pcol0 = Math.trunc(4200 * 8);
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(pcol0, y)) { groundY = y; break; } }
  const c0 = groundY >= 0 ? pcol0 : Math.trunc(p.x / 16);
  if (groundY < 0) for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  p.x = c0 * 16; p.y = groundY * 16 - p.h;
  p.vx = 0; p.vy = 0;
  p.baseMaxMana = 400; p.mana = 400;

  // ---- patch 主 ctx.drawImage + drawNPC/drawPlayer 计数 ----
  const r = g.renderer;
  const mainCtx = r.canvas.getContext('2d');
  const counts = { di: 0, diSrc: {} };
  const origDI = mainCtx.drawImage.bind(mainCtx);
  mainCtx.drawImage = function (src, ...rest) {
    counts.di++;
    const k = String((src && (src.tagName || src.constructor?.name)) ?? 'unk');
    counts.diSrc[k] = (counts.diSrc[k] ?? 0) + 1;
    return origDI(src, ...rest);
  };
  // NPC/弹绘制计数走 diSrc 直方图（NPC_*.png / Projectile_*.png 源名自动归类）
  const step = (n2) => {
    for (let i = 0; i < n2; i++) {
      g.fixedUpdate(1 / 60); g.render();
    }
  };
  const snapCounts = () => ({ di: counts.di, diSrc: { ...counts.diSrc } });
  const resetCounts = () => { counts.di = 0; counts.diSrc = {}; };

  const log = [];
  resetCounts(); step(30);
  log.push({ phase: 'baseline', per30f: snapCounts() });
  resetCounts();

  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  if (!key3476) return { fail: 'item-key-3476-missing' };
  p.inv.slots[0] = { id: items[key3476], stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60);
  const scr = g.camera.worldToScreen ? g.camera.worldToScreen(p.cx + 200, p.cy - 6) : [600, 380];
  g.input.mouseX = scr[0] ?? 600; g.input.mouseY = scr[1] ?? 380;
  for (let f = 0; f < 90; f++) {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60); g.render();
    g.input.mouseDown = false;
    if (f % 30 === 29) {
      log.push({ phase: `use f${f + 1}`, per30f: snapCounts(),
        projs: g.entities.projectiles.filter((q) => q.projId === 617 && !q.dead).length });
      resetCounts();
    }
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  resetCounts(); step(30);
  log.push({ phase: 'released', per30f: snapCounts() });
  return { log };
});
console.log(JSON.stringify(out, null, 1));
console.error('pageErrors:', JSON.stringify(pageErrors.slice(0, 5)));
await browser.close();
