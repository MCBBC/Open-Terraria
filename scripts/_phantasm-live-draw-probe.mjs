// 实帧 drawImage 拦截:对 Projectile_1 贴图绘制记录 CTM 矩阵,算出箭头实际指向,
// 对比 volley 箭 vs 直生箭
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_phantasm-live-draw-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });
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

const info = await page.evaluate(async () => {
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
  const { Arrow } = await import('/src/entities/Arrow.ts');
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
  const wid = window.__swItems[findKey(3540)];
  const aid = ammoDefIdxByAmmoId(40);
  for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: wid, stack: 1 };
  g.player.inv.slots[54] = { id: aid, stack: 999 };
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  g.entities.projectiles.length = 0;
  g.cb.onInventoryChanged();
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);

  g.input.mouseX = 640 + 240; g.input.mouseY = 400 - 240;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  let volleySeen = -1;
  for (let t = 0; t < 60; t++) {
    g.fixedUpdate(1 / 60);
    if (g.entities.projectiles.some((q) => q.projId !== 630 && !q.dead)) { volleySeen = t; break; }
  }
  for (let t = 0; t < 3 && volleySeen >= 0; t++) g.fixedUpdate(1 / 60);
  // B 组:直生箭（与 volley 箭同区,便于区分:放在玩家正上方 120px）
  const { ITEM_BY_KEY } = await import('/src/data/itemKeys.ts');
  const bx = g.player.cx, by = g.player.cy - 120;
  const bArrows = [];
  for (let i = 0; i < 2; i++) {
    const b = new Arrow(bx - 20 + i * 40, by, 14, -14, 30, 2, 1, null, {});
    b.frostEligible = true;
    g.entities.add(b, 'projectiles');
    bArrows.push(b);
  }
  // 等贴图就绪（projSprite 懒加载）——渲染若干真实帧
  await new Promise((r) => setTimeout(r, 1200));

  // 拦截一帧内的 Projectile_* drawImage,记录 CTM
  window.__liveDraws = [];
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__ptPatched) {
    proto.__ptPatched = true;
    proto.__optDrawImage = proto.drawImage;
    proto.drawImage = function (...a) {
      try {
        const src = a[0] && (a[0].src ?? '');
        if (typeof src === 'string' && src.includes('Projectile_')) {
          const m = this.getTransform();
          const name = src.split('/').pop();
          // 箭头局部点 (0,-ih/2)（贴图朝上）经 CTM 后相对平移的方向
          const iw = a[0].width, ih = a[0].height;
          const dxArg = a.length > 5 ? a[4] : 0, dyArg = a.length > 5 ? a[5] : 0;
          const lx = dxArg, ly = dyArg - ih / 2;      // 头部局部坐标（dst 系）
          const wx = m.a * lx + m.c * ly + m.e;
          const wy = m.b * lx + m.d * ly + m.f;
          window.__liveDraws.push({ name, iw, ih, args: a.length,
            mat: [m.a, m.b, m.c, m.d].map((v) => +v.toFixed(3)),
            head: [+wx.toFixed(1), +wy.toFixed(1)],
            origin: [+m.e.toFixed(1), +m.f.toFixed(1)] });
        }
      } catch (e) { /* ignore */ }
      return proto.__optDrawImage.apply(this, a);
    };
  }
  // 跑 3 个真实渲染帧（rAF 驱动）
  await new Promise((r) => setTimeout(r, 80));
  const rec = g.entities.projectiles.filter((q) => !q.dead).map((q) => ({
    pid: q.projId, grp: q.projId === 630 ? 'carrier'
      : (Math.abs(q.cy - by) < 40 && Math.abs(q.vx - 14) < 0.1 ? 'B-direct' : 'A-volley'),
    cx: +q.cx.toFixed(0), cy: +q.cy.toFixed(0), vx: +q.vx.toFixed(2), vy: +q.vy.toFixed(2), age: q.age,
    inWorld: g.entities.projectiles.includes(q),
  }));
  return { volleySeen, liveDraws: window.__liveDraws, rec };
});
console.log(JSON.stringify(info, null, 1));
console.log('页面异常:', errors.slice(0, 3));
await browser.close();
