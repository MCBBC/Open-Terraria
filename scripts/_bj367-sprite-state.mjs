// ★BJ367 决定性微探针——404 贴图缓存态+fillRect 面+窄域 drawImage 捕获
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR', String(e.message).slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (t.includes('404') || t.includes('sw-fail')) console.log('CONSOLE', t.slice(0, 200)); });
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
  const { projSpriteHealth } = await import('/src/entities/Arrow.ts');
  // 预热 404 贴图：让 projSprite 触发加载
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

  // 窄域捕获：iw===30 或 iw===10 的 drawImage + 头域 fillRect
  const cap = { img: [], fills: [] };
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__bj367cap) {
    proto.__bj367cap = true;
    const od = proto.drawImage, of = proto.fillRect;
    proto.drawImage = function (...a) {
      try {
        const img = a[0];
        if (img && (img.width === 30 || img.width === 10)) {
          const t = this.getTransform();
          cap.img.push({ w: img.width, h: img.height, ctor: img.constructor.name,
            src: (img.src || '').split('/').pop(),
            n: a.length, args: a.length >= 9 ? a.slice(1, 9).map((x) => Math.round(x)) : a.length >= 5 ? a.slice(1, 5).map((x) => Math.round(x)) : null,
            sxp: Math.round(t.a * (a.length >= 9 ? a[5] : a.length >= 5 ? a[1] : 0) + t.c * (a.length >= 9 ? a[6] : a.length >= 5 ? a[2] : 0) + t.e),
            syp: Math.round(t.b * (a.length >= 9 ? a[5] : a.length >= 5 ? a[1] : 0) + t.d * (a.length >= 9 ? a[6] : a.length >= 5 ? a[2] : 0) + t.f),
            alpha: +(+this.globalAlpha).toFixed(2) });
        }
      } catch { }
      return od.apply(this, a);
    };
    proto.fillRect = function (x, y, w, h) {
      try {
        const t = this.getTransform();
        const px = t.a * x + t.c * y + t.e, py = t.b * x + t.d * y + t.f;
        if (Math.abs(px - 1018) < 90 && Math.abs(py - 400) < 90 && w < 80 && h < 80) {
          const f = this.fillStyle;
          cap.fills.push({ f: typeof f === 'string' ? f : String(f), x: Math.round(px), y: Math.round(py), w, h, alpha: +(+this.globalAlpha).toFixed(2) });
        }
      } catch { }
      return of.apply(this, args_protect(x, y, w, h));
    };
    function args_protect(...a) { return a; }
  }

  // 跑 120 拍（2 秒）让贴图加载+淡入完成,再采样 3 帧
  for (let t = 0; t < 120; t++) { g.paused = false; g.fixedUpdate(1 / 60); }
  cap.img.length = 0; cap.fills.length = 0;
  for (let f = 0; f < 3; f++) { await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r)); }
  const [hsx, hsy] = g.camera.worldToScreen(head.x, head.y);
  return {
    health404: projSpriteHealth([404, 405]),
    head: { cx: head.cx, cy: head.cy, alpha: head.alphaView, st: head.aiState, dead: head.dead },
    expectScreen: { sx: Math.round(hsx), sy: Math.round(hsy) },
    capImg: cap.img.slice(0, 20),
    capFills: cap.fills.slice(0, 20),
    bubbles: g.entities.projectiles.filter((q) => q.projId === 405).length,
  };
});
console.log('CAP=' + JSON.stringify(out, null, 1));
await browser.close();
