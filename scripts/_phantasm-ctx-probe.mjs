// volley 箭 vs 直生箭 draw 变换差分:用录制型 2D context 手动调 Arrow.draw,
// dump 两条 transform 序列定位翻转差异
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_phantasm-ctx-probe.mjs
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
  const volleyArrow = g.entities.projectiles.find((q) => q.projId === 1);
  const bArrow = new Arrow(volleyArrow.cx, volleyArrow.cy, volleyArrow.vx, volleyArrow.vy, 30, 2, 1, null, {});
  bArrow.age = volleyArrow.age;
  bArrow.frostEligible = true;

  // 录制型 2D context
  const capture = (ent) => {
    const log = [];
    const h = {
      save: () => log.push(['save']),
      restore: () => log.push(['restore']),
      translate: (x, y) => log.push(['translate', +x.toFixed(1), +y.toFixed(1)]),
      rotate: (a) => log.push(['rotate', +a.toFixed(3)]),
      scale: (x, y) => log.push(['scale', +x.toFixed(2), +y.toFixed(2)]),
      drawImage: (...a) => log.push(['drawImage', String(a[0]?.src ?? '?').split('/').pop(),
        ...a.slice(1).map((v) => typeof v === 'number' ? +v.toFixed(1) : v)]),
    };
    const ctx = new Proxy(h, {
      get(t, p) { if (p in t) return t[p]; return () => log.push([String(p) + '()']); },
      set(t, p, v) { log.push(['set ' + String(p), typeof v === 'number' ? +v.toFixed(3) : String(v).slice(0, 40)]); return true; },
    });
    ent.draw({ ctx, mainPlayer: null }, g.camera);
    return log;
  };
  return {
    volleySeen,
    volleyState: { vx: volleyArrow.vx, vy: volleyArrow.vy, age: volleyArrow.age, pid: volleyArrow.projId,
      dropKey: volleyArrow.dropKey, noDropItem: volleyArrow.noDropItem ?? null,
      critChance: volleyArrow.critChance, w: volleyArrow.w, h: volleyArrow.h },
    volleyDraw: capture(volleyArrow),
    directDraw: capture(bArrow),
    directState: { vx: bArrow.vx, vy: bArrow.vy, age: bArrow.age },
  };
});
console.log(JSON.stringify(info, null, 1));
console.log('页面异常:', errors.slice(0, 3));
await browser.close();
