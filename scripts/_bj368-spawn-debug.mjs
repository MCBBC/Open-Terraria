// ★BJ368 出球自检——球到底画在哪:全屏 teal 搜索+头屏幕坐标+截图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR:', String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  const { options } = await import('/src/core/Options.ts');
  if ((g.renderer.usingCpu ?? false) || options.data.renderMode === 'cpu') {
    options.set('renderMode', 'gpu');
    await new Promise((r) => setTimeout(r, 500));
  }
  await g.newWorld('bj368dbg', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 27000;
  const pcol0 = Math.trunc(4200 * 8);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(pcol0, y)) { groundY = y; break; } }
  if (groundY < 0) {
    const c0 = Math.trunc(p.x / 16);
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
    p.x = c0 * 16; p.y = groundY * 16 - p.h;
  } else {
    p.x = pcol0 * 16; p.y = groundY * 16 - p.h;
  }
  p.vx = 0; p.vy = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    return [sx, sy];
  };
  const findTeal = () => {
    const o = document.createElement('canvas');
    o.width = canvas.width; o.height = canvas.height;
    const c = o.getContext('2d', { willReadFrequently: true });
    c.drawImage(canvas, 0, 0);
    const d = c.getImageData(0, 0, canvas.width, canvas.height).data;
    const hits = [];
    for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) {
      const i = (y * canvas.width + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const isTeal = Math.abs(r - 48) < 70 && Math.abs(gg - 248) < 70 && Math.abs(b - 171) < 70;
      const isRed = r > 180 && gg < 110 && b < 110;
      if (isTeal || isRed) {
        hits.push([x, y, isTeal ? 'T' : 'R']);
        if (hits.length > 400) return hits;
      }
    }
    return hits;
  };

  const log = [];
  // 出球
  const [msx, msy] = aim(p.cx + 260, p.cy - 4);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  let head = g.entities.projectiles.find((q) => q.projId === 404);
  log.push({ spawned: !!head, mouseX: g.input.mouseX, mouseY: g.input.mouseY, screenAim: [msx, msy] });
  for (let t = 1; t <= 24 && head && !head.dead; t++) {
    g.paused = false;
    g.fixedUpdate(1 / 60);
    head = g.entities.projectiles.find((q) => q.projId === 404);
    if (!head || head.dead) { log.push({ t, dead: true }); break; }
    if (t % 4 === 0) {
      const [sx, sy] = g.camera.worldToScreen(head.x, head.y);
      log.push({ t, headWorld: [Math.round(head.x), Math.round(head.y)], headScreen: [Math.round(sx), Math.round(sy)],
        cam: [Math.round(g.camera.x), Math.round(g.camera.y)], st: head.st, alpha: head.alphaView,
        vx: +head.vx.toFixed(1), vy: +head.vy.toFixed(1),
        hitNear: findTeal().length, hitSample: findTeal().slice(0, 6) });
    }
  }
  return { log, canvasW: canvas.width, canvasH: canvas.height, cssW: canvas.getBoundingClientRect().width, scale, dpr: window.devicePixelRatio, zoom: g.camera.zoom ?? g.renderer.zoom ?? null };
});
console.log('BJ368_DBG=' + JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/bj368-dbg.png' });
await browser.close();
