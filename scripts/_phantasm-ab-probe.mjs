// 隔离 A/B 姿态对比:1 发 volley 箭 + 1 发直生箭,同速向上右,并排 teleport 到空旷天空,
// 冻结截帧 8× 放大对比
// 运行:SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_phantasm-ab-probe.mjs
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
  const py = Math.floor(g.world.groundLevel) - 60;
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
  for (let t = 0; t < 2 && volleySeen >= 0; t++) g.fixedUpdate(1 / 60);
  // 留 1 发 volley 箭,其余清掉（含载体,防继续生成/重瞄）
  const vol = g.entities.projectiles.find((q) => q.projId === 1 && !q.dead);
  g.entities.projectiles.length = 0;
  g.entities.projectiles.push(vol);
  // 直生对照箭
  const dir = new Arrow(vol.cx, vol.cy, 12, -12, 30, 2, 1, null, {});
  dir.frostEligible = true;
  g.entities.projectiles.push(dir);
  // 并排 teleport 到玩家上方空旷处,速度同向右上,vx>0
  vol.x = g.player.cx - 60; vol.y = g.player.cy - 160; vol.vx = 12; vol.vy = -12;
  vol.ph630Ctl = undefined;
  dir.x = g.player.cx + 60; dir.y = g.player.cy - 160; dir.vx = 12; dir.vy = -12;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy - 100;
  g.paused = true;
  await new Promise((r) => setTimeout(r, 400));   // 等贴图/渲染一帧
  const [svx, svy] = g.camera.worldToScreen(vol.cx, vol.cy);
  const [dvx, dvy] = g.camera.worldToScreen(dir.cx, dir.cy);
  window.__abPts = { vol: [svx, svy], dir: [dvx, dvy] };
  return { volleySeen, vol: { vx: vol.vx, vy: vol.vy, age: vol.age, pid: vol.projId },
    dir: { vx: dir.vx, vy: dir.vy, age: dir.age, pid: dir.projId },
    screen: { vol: [Math.round(svx), Math.round(svy)], dir: [Math.round(dvx), Math.round(dvy)] } };
});
console.log(JSON.stringify(info, null, 1));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: './shots/phantasm-ab.png' });
const pts = await page.evaluate(() => window.__abPts);
console.log('PTS', JSON.stringify(pts));
console.log('页面异常:', errors.slice(0, 3));
await browser.close();
