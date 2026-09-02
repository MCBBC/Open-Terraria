// 幻影弓 volley 箭姿态差分探针（冻结帧）:
//   A 组 = 真实 volley 箭（载体 630 生成,pid=1）
//   B 组 = 直接 new Arrow 同 pid 同速（主链等价对照组）
//   冻结后逐箭记录 world→screen 坐标+速度向,截帧对比贴图朝向
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_phantasm-mirror-probe.mjs
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

  // 瞄准右上
  g.input.mouseX = 640 + 240; g.input.mouseY = 400 - 240;
  // ---- A 组:真实 volley（蓄力到第二轮 volley 后 3 tick 冻结）----
  g.input.mouseDown = true; g.input.mouseHeld = true;
  let volleySeen = -1;
  const dbg = { carrierEver: 0, useTime0: g.player.useTime, uiBlocking: g.input.uiBlocking,
    heldId: g.player.inv.heldItem()?.id ?? null, mouse: [g.input.mouseX, g.input.mouseY] };
  {
    const hd = g.player.inv.heldItem();
    const hdDef = hd ? ITEM_DEFS[hd.id] : null;
    dbg.heldKey = hdDef?.key ?? null;
    dbg.heldVid = hdDef?.vid ?? null;
    dbg.swItemsKey = findKey(3540);
    dbg.swItemsId = wid;
  }
  for (let t = 0; t < 60; t++) {
    g.fixedUpdate(1 / 60);
    if (g.entities.projectiles.some((q) => q.projId === 630)) dbg.carrierEver++;
    const arrows = g.entities.projectiles.filter((q) => q.projId !== 630 && !q.dead);
    if (arrows.length >= 4) { volleySeen = t; break; }
  }
  dbg.useTimeAfter = g.player.useTime;
  dbg.mouseDownAfter = g.input.mouseDown;
  dbg.pidsAfter = g.entities.projectiles.map((q) => q.projId);
  dbg.swingAfter = g.swing ? { t: g.swing.t, dur: g.swing.dur, item: g.swing.item, useStyle: g.swing.useStyle } : null;
  for (let t = 0; t < 3 && volleySeen >= 0; t++) g.fixedUpdate(1 / 60);
  // ---- B 组:同 pid 直接生成（对照组,生成于玩家右上 200px 处,同速向上右）----
  const bx = g.player.cx + 200, by = g.player.cy - 200;
  for (let i = 0; i < 2; i++) {
    const b = new Arrow(bx + i * 30, by - i * 10, 14, -14, 30, 2, 1, null, {});
    b.frostEligible = true;
    g.entities.add(b, 'projectiles');
  }
  g.fixedUpdate(1 / 60);
  g.paused = true;                     // 冻结逻辑,渲染循环仍画
  const cam = g.camera;
  const rec = [];
  for (const p of g.entities.projectiles) {
    if (p.dead) continue;
    const [sx, sy] = cam.worldToScreen(p.cx, p.cy);
    rec.push({ pid: p.projId, group: p.projId === 630 ? 'carrier' : (Math.abs(p.cx - bx) < 60 && Math.abs(p.cy - (by - 5)) < 60 ? 'B-direct' : 'A-volley'),
      cx: p.cx, cy: p.cy, vx: p.vx, vy: p.vy, age: p.age, sx, sy });
  }
  window.__ptRec = rec;
  return { volleySeen, dbg, rec, cam: { x: cam.x, y: cam.y }, zoom: cam.zoom };
});
console.log(JSON.stringify(info, null, 1));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: './shots/phantasm-mirror.png' });
console.log('页面异常:', errors.slice(0, 3));
await browser.close();
