// ★BJ367 盒面追踪 v2——直包 FlaironHeadProj.draw+全帧 iw 直方图,定位实体窗是否画弹
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR', String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const s = document.querySelector('select'); s.selectedIndex = 0; s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  const { options } = await import('/src/core/Options.ts');
  options.set('renderMode', 'cpu');
  await new Promise((r) => setTimeout(r, 600));
  await g.newWorld('bj367', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) { if (g.world && g.world.store && g.world.store.w === 4200) break; await new Promise((r) => setTimeout(r, 200)); }
  const p = g.player;
  const st = g.world.store;
  let groundY = -1;
  const c0 = Math.trunc(p.x / 16);
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  p.x = c0 * 16; p.y = groundY * 16 - p.h; p.vx = 0; p.vy = 0;

  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 300));

  const { FlaironHeadProj, FlaironSpike, flaironSpawnNudge } = await import('/src/entities/WeaponProj.ts');
  // 直包 draw
  const drawCalls = { head: 0, spike: 0, headErr: [], spikeErr: [] };
  const oh = FlaironHeadProj.prototype.draw;
  FlaironHeadProj.prototype.draw = function (...a) {
    drawCalls.head++;
    try { return oh.apply(this, a); } catch (e) { drawCalls.headErr.push(String(e && e.message).slice(0, 120)); }
  };
  const os = FlaironSpike.prototype.draw;
  if (os) FlaironSpike.prototype.draw = function (...a) {
    drawCalls.spike++;
    try { return os.apply(this, a); } catch (e) { drawCalls.spikeErr.push(String(e && e.message).slice(0, 120)); }
  };

  const dirx = p.cx + 240, diry = p.cy - 4;
  const sp = flaironSpawnNudge(-1, p.cx, p.cy, dirx, diry);
  const head = new FlaironHeadProj(sp.x, sp.y, 14, 0, 30, 4.5);
  head.x = sp.x - head.w / 2; head.y = sp.y - head.h / 2;
  head.pinUse = () => {};
  head.spawnProj = (sx, sy, svx, svy, sProj, sDmg, sKb) => {
    if (sProj !== 405) return;
    g.entities.add(new FlaironSpike(sx - 7, sy - 7, svx, svy, Math.max(1, Math.round(sDmg)), sKb), 'projectiles');
  };
  g.entities.add(head, 'projectiles');

  // 全帧 drawImage 直方图
  const hist = {};
  let frameDraws = 0;
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__bj367h) {
    proto.__bj367h = true;
    const od = proto.drawImage;
    proto.drawImage = function (...a) {
      frameDraws++;
      try {
        const img = a[0];
        const k = `${img && img.width}x${img && img.height}`;
        hist[k] = (hist[k] || 0) + 1;
      } catch { }
      return od.apply(this, a);
    };
  }

  for (let t = 0; t < 24; t++) { g.paused = false; g.fixedUpdate(1 / 60); }
  hist && (frameDraws = 0);
  for (const k of Object.keys(hist)) delete hist[k];
  drawCalls.head0 = drawCalls.head; drawCalls.head = drawCalls.head; const headBefore = drawCalls.head, spikeBefore = drawCalls.spike;
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  const [hsx, hsy] = g.camera.worldToScreen(head.x, head.y);
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 25);
  return {
    head: { x: head.x, y: head.y, alpha: head.alphaView, rot: head.rotation, dead: head.dead },
    expectScreen: { sx: Math.round(hsx), sy: Math.round(hsy) },
    frameDraws, headBefore, spikeBefore, headAfter: drawCalls.head, spikeAfter: drawCalls.spike,
    headErr: drawCalls.headErr, spikeErr: drawCalls.spikeErr,
    topTextures: top,
    bucketLens: { projectiles: g.entities.projectiles.length },
  };
});
console.log('TRACE2=' + JSON.stringify(out, null, 1));
await browser.close();
